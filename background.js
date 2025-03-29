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
// 修改：现在发送包含具体设置的消息
function notifyContentScript(tabId, settings) {
    // --- 日志 ---
    console.log(`[Speed Controller] Attempting to notify content script for tabId: ${tabId} with settings:`, settings);
    try {
        // 发送更具体的消息类型和数据
        chrome.tabs.sendMessage(tabId, { type: 'applySettings', settings: settings })
            .catch((error) => {
                // --- 日志 ---
                // 忽略 "Receiving end does not exist" 错误，这通常意味着内容脚本尚未注入或页面不匹配
                if (!error.message.includes("Receiving end does not exist")) {
                    console.warn(`[Speed Controller] Could not send message to tab ${tabId}: ${error.message}`);
                }
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
        bilibiliSpeed: 1.25, // 使用常量或默认值
        youtubeSpeed: 1.5  // 使用常量或默认值
    }, function (data) {
        if (chrome.runtime.lastError) {
            console.error("Error getting settings in handleTabUpdate:", chrome.runtime.lastError);
            return;
        }

        // 更新 Badge 显示 (这部分逻辑不变)
        updateBadgeBasedOnUrl(data.enabled, url, data.bilibiliSpeed, data.youtubeSpeed);

        // 在标签页加载或切换时，通知内容脚本应用设置
        if (isBilibiliVideoPage(url)) {
            // 调用 notifyContentScript 并传递相关设置
            notifyContentScript(tabId, { enabled: data.enabled, speed: data.bilibiliSpeed });
        } else if (isYouTubeVideoPage(url)) {
            // 调用 notifyContentScript 并传递相关设置
            notifyContentScript(tabId, { enabled: data.enabled, speed: data.youtubeSpeed });
        }
        // 对于非视频页面，我们不需要通知内容脚本
    });
}

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
                bilibiliSpeed: 1.25, // 使用默认值以防万一
                youtubeSpeed: 1.5  // 使用默认值以防万一
            }, function (data) {
                // 获取最新的启用状态，优先使用变化中的值
                const currentEnabled = newEnabled !== undefined ? newEnabled : data.enabled;
                const tab = tabs[0];
                const url = tab.url || ""; // 添加 URL 检查

                // 更新当前标签页的 Badge 显示
                updateBadgeBasedOnUrl(currentEnabled, url, data.bilibiliSpeed, data.youtubeSpeed);
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

// Helper function to determine badge text based on state and URL
function updateBadgeBasedOnUrl(isEnabled, url, bilibiliSpeed, youtubeSpeed) {
    if (!isEnabled) {
        updateBadge(false); // 显示 OFF
    } else if (isBilibiliVideoPage(url)) {
        updateBadge(true, bilibiliSpeed); // 显示 B 站速度
    } else if (isYouTubeVideoPage(url)) {
        updateBadge(true, youtubeSpeed); // 显示 YouTube 速度
    } else {
        updateBadge(true); // 非视频页显示 ON
    }
}

// 初始加载时设置 Badge
chrome.runtime.onStartup.addListener(() => {
    // (与 storage.onChanged 类似逻辑更新 Badge)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) return;
        chrome.storage.sync.get({
            enabled: true,
            bilibiliSpeed: 1.25,
            youtubeSpeed: 1.5
        }, function (data) {
            updateBadgeBasedOnUrl(data.enabled, tabs[0].url || "", data.bilibiliSpeed, data.youtubeSpeed);
        });
    });
});

// 安装或更新时设置初始状态和 Badge
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        // 设置默认值
        chrome.storage.sync.set({
            enabled: true,
            bilibiliSpeed: 1.25,
            youtubeSpeed: 1.5
        });
    }
    // 立即更新 Badge
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) return;
        chrome.storage.sync.get({
            enabled: true,
            bilibiliSpeed: 1.25,
            youtubeSpeed: 1.5
        }, function (data) {
            updateBadgeBasedOnUrl(data.enabled, tabs[0].url || "", data.bilibiliSpeed, data.youtubeSpeed);
        });
    });
}); 