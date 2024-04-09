// ==UserScript==
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @name         Bookmark Exporter
// @namespace    http://tampermonkey.net/
// @version      2024-04-09
// @description  从根源断绝问题！
// @author       sblzdddd
// @match        https://www.pixiv.net/users/*/bookmarks/artworks*
// @icon         https://avatars.githubusercontent.com/u/159037376?s=48&v=4
// @require      https://code.jquery.com/jquery-2.1.4.min.js
// ==/UserScript==

// 同时请求的 Request 数量
let g_maxXhr = 16;

var GM__xmlHttpRequest;
if ("undefined" != typeof (GM_xmlhttpRequest)) {
    GM__xmlHttpRequest = GM_xmlhttpRequest;
} else {
    GM__xmlHttpRequest = GM.xmlHttpRequest;
}

function WatchElement(elementSelector, callback, timeout) {
    const element = $(elementSelector);
    if (element.length) {
        // If the element does exist, wait for it to disappear
        const intervalId = setInterval(function() {
            const element = $(elementSelector);
            if (!element.length) { // Stop checking
                clearInterval(intervalId);
                callback(element, "deleted"); // Execute the callback function with the element
                WatchElement(elementSelector, callback); // Resume checking after callback
            }
        }, timeout);
    } else {
        // If the element does not exist, wait for it to appear
        const intervalId = setInterval(function() {
            const element = $(elementSelector);
            if (element.length) {
                clearInterval(intervalId); // Stop checking
                callback(element, "created"); // Execute the callback function with the element
                WatchElement(elementSelector, callback); // Resume checking after callback
            }
        }, timeout); // Check every second (adjust this value as needed)
    }
};
function WatchAttr(targetElement, attr, callback) {
    let oldValue = targetElement.getAttribute(attr);
    const observer = new MutationObserver((mutationsList, observer) => {
        // Iterate through each mutation
        mutationsList.forEach((mutation) => {
            // Check if attributes were modified
            if (mutation.type === 'attributes') {
                console.log(52345234)
                // Check if the modified attribute is the target
                if (mutation.attributeName === attr) {
                    const newValue = targetElement.getAttribute(attr);
                    console.log('Attr ' + attr + ' changed:' + oldValue + ' -> ' + newValue)
                    callback(oldValue, newValue)
                    oldValue = newValue
                }
            }
        });
    });
    observer.observe(targetElement, { attributes: true });
}
function CollectSelectedArtworks() {
    const ids = []
    // 找到被选中的
    const selected = $('.sc-cdtm3u-2.cnmYO[aria-disabled=true]')
    selected.each(function(index, item,c) {
        // 拿到画作id
        const s = $(item).find('span.sc-rp5asc-16.iUsZyY.sc-bdnxRM.fGjAxR')
        ids.push({"illustId": s.attr('data-gtm-value')})
    })
    console.log(ids)
    return ids
}

function formatData(json) {
    let result = {}
    let data = json.body;
    result["title"] = data.title;
    result["author"] = data.userName;
    result["thumb"] = data.urls.small;
    result["page"] = data.pageCount;
    let images = []
    const originalUrl = data.urls.original;
    for (let j = 0; j < data.pageCount; j++) {
        // Replace the filename suffix from _p0.jpg to _p1.jpg for any file extension
        const replacedUrl = originalUrl.replace(/(_p\d+)\.\w+$/, (match, group) => {
            const index = j; // Extract the digit, increment, and convert to integer
            return `_p${index}.${match.split('.').pop()}`; // Reconstruct the replacement string
        });
        images.push(replacedUrl)
    }
    result["images"] = images;
    result["source"] = `https://www.pixiv.net/artworks/${data.illustId}`;

    let tags_list = []
    const tags = data.tags.tags;
    tags.forEach(function(it){
        tags_list.push(it.tag)
    })
    result["tags"] = tags_list;
    console.log(result)
    return result;
}

function GetArtworkData(id_list) {
    let xhrs = [];
    let errors = []
    let result = []
    let currentRequestGroupMinimumIndex = 0;

    function AddError(id, msg) {
        console.error("ERROR: " + msg + "\nAt Id="+id)
        errors.push({"id": id, "message": msg})
    }

    function GetIllustId(url) {
        let illustId = '';
        let illustIdMatched = url.match(/\d+$/);
        if (illustIdMatched) {
            illustId = illustIdMatched[0];
            return illustId
        } else {
            AddError("-1", 'Can not get illust id from url: ' + url);
            return null;
        }
    }

    function getIndexInXhr(illustId) {
        let indexOfThisRequest = -1;
        for (let j = 0; j < g_maxXhr; j++) {
            if (xhrs[j].illustId == illustId) {
                indexOfThisRequest = j;
                break;
            }
        }
        if (indexOfThisRequest == -1) {
            AddError(illustId, 'This url not match any request!');
            return null;
        }
        return indexOfThisRequest
    }

    function getIndexInList(illustId) {
        let indexOfThisRequest = -1;
        for (let j = 0; j < id_list.length; j++) {
            if (id_list[j].illustId == illustId) {
                indexOfThisRequest = j;
                break;
            }
        }
        if (indexOfThisRequest == -1) {
            AddError(illustId, 'This url not match any selections!');
            return null;
        }
        return indexOfThisRequest
    }

    function FillXhrsArray() {
        xhrs.length = 0;
        let onloadFunc = function (event) {
            let json = null;
            try {
                json = JSON.parse(event.responseText);
            } catch (e) {
                AddError("-1", "parse json failed: " + e)
                errors.append()
                return;
            }
            // 获取这个请求的illlustId
            const illustId = GetIllustId(event.finalUrl)
            console.log("illustId: " + illustId)
            if(illustId===null) {return;}
            console.log(json)

            if (json) {
                // 获取这个请求在源列表的位置
                let indexOfThisRequest = getIndexInXhr(illustId)
                console.log("indexOfThisRequest: " + indexOfThisRequest)
                if(indexOfThisRequest===null) {return;}

                xhrs[indexOfThisRequest].complete = true;

                if (!json.error) {
                    let indexInIdList = getIndexInList(illustId);
                    console.log("indexInIdList: " + indexInIdList)
                    result[indexInIdList] = formatData(json)
                } else {
                    AddError(illustId, 'JSON error occured: ' + json.message);
                    return;
                }

                let completeCount = 0;
                let realCompleteCount = 0;
                for (let j = 0; j < g_maxXhr; j++) {
                    if (xhrs[j].complete) {
                        completeCount++;
                        if (xhrs[j].illustId != '') {
                            realCompleteCount++;
                        }
                    }
                }
                console.log("completeCount: " + realCompleteCount)
                console.log((currentRequestGroupMinimumIndex + realCompleteCount) + '/' + id_list.length)
                $('b.loadedCounts').text(currentRequestGroupMinimumIndex + realCompleteCount);
                if (completeCount == g_maxXhr) {
                    currentRequestGroupMinimumIndex += g_maxXhr;
                    FetchArtworkAPI(currentRequestGroupMinimumIndex);
                }
            } else {
                console.log(json)
                AddError(illustId, "No JSON Format Presented")
            }
        };
        let onerrorFunc = function (event) {
            console.log("ERR")
            // 获取这个请求的illlustId
            const illustId = GetIllustId(event.finalUrl)
            if(illustId===null) {return;}

            let indexOfThisRequest = getIndexInXhr(illustId)
            if(indexOfThisRequest===null) {return;}

            xhrs[indexOfThisRequest].complete = true;
            AddError(illustId, 'Request Error');

            let completeCount = 0;
            let realCompleteCount = 0;
            for (let j = 0; j < g_maxXhr; j++) {
                if (xhrs[j].complete) {
                    completeCount++;
                    if (xhrs[j].illustId != '') {
                        realCompleteCount++;
                    }
                }
            }
            console.error("completeCount: " + realCompleteCount)
            console.error((currentRequestGroupMinimumIndex + realCompleteCount) + '/' + id_list.length)
            $('b.loadedCounts').text(currentRequestGroupMinimumIndex + realCompleteCount);
            if (completeCount == g_maxXhr) {
                currentRequestGroupMinimumIndex += g_maxXhr;
                FetchArtworkAPI(currentRequestGroupMinimumIndex + g_maxXhr);
            }
        };
        for (let i = 0; i < g_maxXhr; i++) {
            xhrs.push({
                illustId: '',   
                complete: false,
                onabort: onerrorFunc,
                onerror: onerrorFunc,
                onload: onloadFunc,
                ontimeout: onerrorFunc,
            });
        }
    }
    const FetchArtworkAPI = (index) => {
        console.log(id_list)
        if (index >= id_list.length) {
            swal.close()
            Swal.fire({
                title: "Completed",
                input: 'textarea',
                inputValue: atob(JSON.stringify(result, null)),
                allowOutsideClick: false,
                didOpen: () => {
                    
                }
            });
        }

        if (xhrs.length === 0) {
            FillXhrsArray();
        }

        for (let i = 0; i < g_maxXhr; i++) {
            if (index + i >= id_list.length) {
                xhrs[i].complete = true;
                xhrs[i].illustId = '';
                continue;
            }

            let illustId = id_list[index + i].illustId;
            let url = "https://pixiv.net/ajax/illust/" + illustId
            console.log(url)
            xhrs[i].illustId = illustId;
            xhrs[i].complete = false;
            GM__xmlHttpRequest({
                method: 'GET',
                url: url,
                anonymous: false,
                onabort: xhrs[i].onerror,
                onerror: xhrs[i].onerror,
                onload: xhrs[i].onload,
                ontimeout: xhrs[i].onerror,
            });
        }
    }


    Swal.fire({
        title: "Fetching Artwork Data",
        html: `Fetching <b class="loadedCounts">0</b> / ${id_list.length}`,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
            const l = id_list.length;
            result = Array.from({ l }, () => ({}));
            FetchArtworkAPI(0)
        }
    });
}

(function() {
    'use strict';

    $('head').append($('<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>'))

    console.log("ArtworkData Importer V1.0")
    // 编辑界面父元素，会被动态创建和删除
    const MultiEditDiv = '.sc-13ywrd6-8.bomZNB'
    // 编辑界面左半边，可以塞更多按钮
    const EditActionRoot = '.sc-13ywrd6-4.cXBjgZ'
    // 编辑界面按钮class，用来同步disable属性
    const Button = '.sc-1ij5ui8-0.QihHO.sc-13ywrd6-7.tPCje'
    // 生成按钮元素
    const generateBtn = $(`
    <div class="sc-4a5gah-0 dydUg" style="cursor: default;display: flex; gap: 6px; cursor: pointer;">
        <img src="https://avatars.githubusercontent.com/u/159037376?s=48&v=4"
        style="width: 20px; border-radius: 5px;">
        <div class="sc-4a5gah-1 kHyYuA">生成ArtworkData</div>
    </div>
    `)
    generateBtn.click(function() {
        if (generateBtn.attr('aria-disabled') === 'false') {
            const id_list = CollectSelectedArtworks();
            const data = GetArtworkData(id_list)
        }
    })
    WatchElement(MultiEditDiv, function(element, status) {
        console.log("MultiEditActions" + status)
        if(status === "created") {
            $(EditActionRoot).append(generateBtn)
            generateBtn.attr('aria-disabled', 'true')
            const actionBtn = $(element).find(Button);
            WatchAttr(actionBtn.get(actionBtn.length-1), 'aria-disabled', function(oldValue, newValue) {
                generateBtn.attr('aria-disabled', newValue)
            })
        }
    }, 500)
})();