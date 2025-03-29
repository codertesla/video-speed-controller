// 简化版本的 background.js
console.info("[Speed Controller] Background service worker started");

// 更新 badge 显示 - 简化版本
function updateBadge(enabled, speed) {
    try {
        if (!enabled) {
            chrome.action.setBadgeText({ text: 'OFF' });
            chrome.action.setBadgeBackgroundColor({ color: '#888888' });
        } else if (speed && typeof speed === 'number') {
            // 格式化数字显示
            const speedText = speed % 1 === 0 ? speed.toString() : speed.toFixed(1);
            chrome.action.setBadgeText({ text: speedText });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        } else {
            chrome.action.setBadgeText({ text: 'ON' });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        }
    } catch (error) {
        console.error("[Speed Controller] Badge error:", error);
    }
}

// 检查 URL 是否为 Bilibili 视频页面
function isBilibiliVideoPage(url) {
    return url && url.includes('bilibili.com/video/');
}

// 检查 URL 是否为 YouTube 视频页面
function isYouTubeVideoPage(url) {
    return url && url.includes('youtube.com/watch');
}

// 尝试向指定标签页发送设置变更消息
function notifyContentScript(tabId) {
    // --- 日志 ---
    console.log(`[Speed Controller] Attempting to notify content script for tabId: ${tabId}`);
    try {
        chrome.tabs.sendMessage(tabId, { type: 'settingsChanged' })
            .catch((error) => {
                // --- 日志 ---
                console.warn(`[Speed Controller] Could not send message to tab ${tabId}: ${error.message}`);
            });
    } catch (e) {
        // --- 日志 ---
        console.error("[Speed Controller] Error sending message:", e);
    }
}

// 通用标签页更新处理函数
function handleTabUpdate(tabId, url) {
    // --- 日志 ---
    console.log(`[Speed Controller] handleTabUpdate called for tabId: ${tabId}, url: ${url}`);
    if (!url) {
        console.log("[Speed Controller] handleTabUpdate exiting: URL is invalid.");
        return;
    }

    chrome.storage.sync.get({
        enabled: true,
        bilibiliSpeed: 1.25,
        youtubeSpeed: 1.5
    }, function (data) {
        // --- 日志 ---
        console.log(`[Speed Controller] handleTabUpdate - storage data fetched for tabId ${tabId}:`, data);
        if (!data.enabled) {
            console.log(`[Speed Controller] handleTabUpdate - Extension disabled for tabId ${tabId}. Updating badge to OFF.`);
            updateBadge(false);
        } else if (isBilibiliVideoPage(url)) {
            console.log(`[Speed Controller] handleTabUpdate - Bilibili video page detected for tabId ${tabId}. Speed: ${data.bilibiliSpeed}`);
            updateBadge(true, data.bilibiliSpeed);
            // --- 日志 ---
            console.log(`[Speed Controller] handleTabUpdate - Notifying content script for Bilibili tabId: ${tabId}`);
            notifyContentScript(tabId);
        } else if (isYouTubeVideoPage(url)) {
            console.log(`[Speed Controller] handleTabUpdate - YouTube video page detected for tabId ${tabId}. Speed: ${data.youtubeSpeed}`);
            updateBadge(true, data.youtubeSpeed);
            // --- 日志 ---
            console.log(`[Speed Controller] handleTabUpdate - Notifying content script for YouTube tabId: ${tabId}`);
            notifyContentScript(tabId);
        } else {
            console.log(`[Speed Controller] handleTabUpdate - Non-video page detected for tabId ${tabId}. Updating badge to ON.`);
            updateBadge(true);
        }
    });
}

// 初始化 badge
chrome.storage.sync.get({
    enabled: true,
    bilibiliSpeed: 1.25,
    youtubeSpeed: 1.5
}, function (data) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            // 使用通用处理函数
            handleTabUpdate(tabs[0].id, tabs[0].url);
        }
    });
});

// 监听设置变化
chrome.storage.onChanged.addListener(function (changes, namespace) {
    // 检查是否有相关设置发生变化
    const relevantChange = changes.enabled || changes.bilibiliSpeed || changes.youtubeSpeed;
    if (namespace === 'sync' && relevantChange) {
        const newEnabled = changes.enabled ? changes.enabled.newValue : undefined;

        // 更新当前活动标签页的 badge
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0]) return; // 检查 tabs 是否有效

            chrome.storage.sync.get({
                enabled: true, // 获取最新的 enabled 状态
                bilibiliSpeed: 1.25,
                youtubeSpeed: 1.5
            }, function (data) {
                const currentEnabled = newEnabled !== undefined ? newEnabled : data.enabled;
                const tab = tabs[0];

                // 更新当前标签页的 Badge 显示
                if (!currentEnabled) {
                    updateBadge(false);
                } else if (isBilibiliVideoPage(tab.url)) {
                    updateBadge(true, data.bilibiliSpeed);
                } else if (isYouTubeVideoPage(tab.url)) {
                    updateBadge(true, data.youtubeSpeed);
                } else {
                    updateBadge(true); // 非视频页显示 ON
                }
            });
        });

        // 通知所有相关的 Bilibili 和 YouTube 内容脚本设置已更改
        chrome.tabs.query({ url: ["*://*.bilibili.com/video/*", "*://*.youtube.com/watch*"] }, function (tabs) {
            tabs.forEach(tab => {
                notifyContentScript(tab.id); // 使用封装的通知函数
            });
        });
    }
});

// 监听标签页激活
chrome.tabs.onActivated.addListener(function (activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
        if (chrome.runtime.lastError) {
            // 处理获取 tab 失败的情况
            console.warn(`[Speed Controller] Error getting tab ${activeInfo.tabId}: ${chrome.runtime.lastError.message}`);
            return;
        }
        if (tab) {
            // 使用通用处理函数
            handleTabUpdate(tab.id, tab.url);
        }
    });
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    // --- 日志 ---
    console.log(`[Speed Controller] tabs.onUpdated triggered for tabId: ${tabId}, changeInfo:`, changeInfo, `tab.url: ${tab.url}`);
    // 检查 URL 是否变化，或者加载状态是否完成，并且确保标签页是活动的
    // 优先处理 URL 变化，因为 SPA 导航时 status 可能不是 'complete'
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
        // 从 tab 对象获取最新的 URL，因为 changeInfo.url 可能不存在
        if (tab.url) {
            handleTabUpdate(tabId, tab.url);
        } else {
            // 如果 tab.url 不可用，尝试异步获取
            chrome.tabs.get(tabId, (updatedTab) => {
                if (updatedTab && updatedTab.url) {
                    handleTabUpdate(tabId, updatedTab.url);
                }
            });
        }
    }
});

// 处理快捷键
chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-speed-control") {
        chrome.storage.sync.get(['enabled'], (data) => {
            const currentEnabled = data.enabled !== undefined ? data.enabled : true; // 处理未初始化的情况
            chrome.storage.sync.set({ enabled: !currentEnabled });
        });
    }
});

// 接收内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'speedChanged' && sender.tab) {
        chrome.storage.sync.get({ enabled: true }, function (data) {
            if (data.enabled) {
                // 仅在启用时根据内容脚本的消息更新 badge
                updateBadge(true, message.speed);
            }
            // 不需要在此处更新 badge 为 OFF，因为那是 storage 变化的职责
            sendResponse({ success: true });
        });
        return true; // 表示异步响应
    }
    // 可以添加其他消息处理逻辑
});

// 新增：监听 Web Navigation 的 History State 更新
chrome.webNavigation.onHistoryStateUpdated.addListener(function (details) {
    // --- 日志 ---
    console.log("[Speed Controller] webNavigation.onHistoryStateUpdated triggered:", details);
    // 仅处理顶级框架 (frameId === 0) 的导航事件
    if (details.frameId === 0) {
        const isYouTube = isYouTubeVideoPage(details.url);
        // --- 日志 ---
        console.log(`[Speed Controller] webNavigation - URL: ${details.url}, Is YouTube Video Page: ${isYouTube}`);
        if (isYouTube) {
            // --- 日志 ---
            console.log(`[Speed Controller] webNavigation - Calling handleTabUpdate for YouTube tabId: ${details.tabId}`);
            // 使用通用处理函数
            handleTabUpdate(details.tabId, details.url);
        }
        // 可以根据需要添加对 Bilibili SPA 导航的处理
        // else if (isBilibiliVideoPage(details.url)) { ... }
    } else {
        // --- 日志 ---
        console.log(`[Speed Controller] webNavigation - Ignoring event for non-top frame (frameId: ${details.frameId})`);
    }
}); 