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

// 更简单的 URL 检查
function isVideoPage(url) {
    return url && (url.includes('bilibili.com/video/') ||
        url.includes('youtube.com/watch'));
}

// 初始化 badge
chrome.storage.sync.get({
    enabled: true,
    bilibiliSpeed: 1.25,
    youtubeSpeed: 1.5
}, function (data) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].url) return;

        const tab = tabs[0];
        if (!data.enabled) {
            updateBadge(false);
        } else if (isVideoPage(tab.url)) {
            const speed = tab.url.includes('bilibili.com') ? data.bilibiliSpeed : data.youtubeSpeed;
            updateBadge(true, speed);
        } else {
            updateBadge(true);
        }
    });
});

// 监听设置变化
chrome.storage.onChanged.addListener(function (changes) {
    if (changes.enabled || changes.bilibiliSpeed || changes.youtubeSpeed) {
        const newEnabled = changes.enabled ? changes.enabled.newValue : undefined;

        // 更新当前标签页的 badge
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;

            chrome.storage.sync.get({
                enabled: true,
                bilibiliSpeed: 1.25,
                youtubeSpeed: 1.5
            }, function (data) {
                const currentEnabled = newEnabled !== undefined ? newEnabled : data.enabled;
                const tab = tabs[0];

                if (!currentEnabled) {
                    updateBadge(false);
                } else if (isVideoPage(tab.url)) {
                    const speed = tab.url.includes('bilibili.com') ? data.bilibiliSpeed : data.youtubeSpeed;
                    updateBadge(true, speed);
                } else {
                    updateBadge(true);
                }
            });
        });

        // 通知内容脚本
        chrome.tabs.query({ url: ["*://*.bilibili.com/video/*", "*://*.youtube.com/watch*"] }, function (tabs) {
            tabs.forEach(tab => {
                try {
                    chrome.tabs.sendMessage(tab.id, { type: 'settingsChanged' })
                        .catch(() => { }); // 忽略错误
                } catch (e) { }
            });
        });
    }
});

// 监听标签页变化
chrome.tabs.onActivated.addListener(function (activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function (tab) {
        if (!tab || !tab.url) return;

        chrome.storage.sync.get({
            enabled: true,
            bilibiliSpeed: 1.25,
            youtubeSpeed: 1.5
        }, function (data) {
            if (!data.enabled) {
                updateBadge(false);
            } else if (isVideoPage(tab.url)) {
                const speed = tab.url.includes('bilibili.com') ? data.bilibiliSpeed : data.youtubeSpeed;
                updateBadge(true, speed);
            } else {
                updateBadge(true);
            }
        });
    });
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.active && tab.url) {
        chrome.storage.sync.get({
            enabled: true,
            bilibiliSpeed: 1.25,
            youtubeSpeed: 1.5
        }, function (data) {
            if (!data.enabled) {
                updateBadge(false);
            } else if (isVideoPage(tab.url)) {
                const speed = tab.url.includes('bilibili.com') ? data.bilibiliSpeed : data.youtubeSpeed;
                updateBadge(true, speed);
            } else {
                updateBadge(true);
            }
        });
    }
});

// 处理快捷键
chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-speed-control") {
        chrome.storage.sync.get(['enabled'], (data) => {
            chrome.storage.sync.set({ enabled: !data.enabled });
        });
    }
});

// 接收内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'speedChanged' && sender.tab) {
        chrome.storage.sync.get({ enabled: true }, function (data) {
            if (data.enabled) {
                updateBadge(true, message.speed);
            } else {
                updateBadge(false);
            }
            sendResponse({ success: true });
        });
        return true; // 表示异步响应
    }
}); 