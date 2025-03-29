/**
 * 视频速度控制器 - YouTube内容脚本
 * 自动设置YouTube视频的播放速度
 */

(function () {
    'use strict';

    // 存储当前设置和状态
    let currentSpeed = 1.0;
    let enabled = true;
    let observer = null;

    // 初始化
    function initialize() {
        // 从存储中获取设置
        chrome.storage.sync.get(['youtubeSpeed', 'enabled'], function (data) {
            if (data.youtubeSpeed) {
                currentSpeed = parseFloat(data.youtubeSpeed);
            }

            if (typeof data.enabled !== 'undefined') {
                enabled = data.enabled;
            }

            // 如果启用了控制，则应用速度设置
            if (enabled) {
                applyVideoSpeed();
                setupVideoObserver();
            }
        });

        // 监听存储变化
        chrome.storage.onChanged.addListener(function (changes, namespace) {
            if (namespace !== 'sync') return; // 检查 namespace

            let needsSpeedUpdate = false;

            // 修正: 确保只处理 youtubeSpeed
            if (changes.youtubeSpeed) {
                currentSpeed = parseFloat(changes.youtubeSpeed.newValue);
                if (enabled) {
                    needsSpeedUpdate = true;
                }
            }

            if (changes.enabled) {
                const newEnabledState = changes.enabled.newValue;
                if (enabled !== newEnabledState) {
                    enabled = newEnabledState;
                    if (enabled) {
                        needsSpeedUpdate = true; // 应用当前速度
                        setupVideoObserver();
                    } else {
                        resetVideoSpeed();
                        disconnectObserver();
                    }
                }
            }

            if (needsSpeedUpdate && enabled) {
                applyVideoSpeed();
            }
        });

        // 新增：监听来自 background script 的消息 (处理 tab 更新/激活/SPA导航)
        chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
            console.log("[Speed Controller YouTube] Received message:", message); // 日志
            if (message.type === 'applySettings' && message.settings) {
                const newEnabledState = message.settings.enabled;
                const newSpeed = parseFloat(message.settings.speed);

                // 更新状态
                enabled = newEnabledState;
                if (!isNaN(newSpeed)) {
                    currentSpeed = newSpeed;
                }

                console.log(`[Speed Controller YouTube] Applying settings from message: enabled=${enabled}, speed=${currentSpeed}`); // 日志

                // 根据收到的状态应用设置
                if (enabled) {
                    applyVideoSpeed();
                    setupVideoObserver();
                } else {
                    resetVideoSpeed();
                    disconnectObserver();
                }
                return false; // 同步处理完成
            }
            return false; // 表示未处理此消息或同步处理完成
        });
    }

    // 应用视频速度
    function applyVideoSpeed() {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (video && !isNaN(currentSpeed)) {
                video.playbackRate = currentSpeed;
                console.log(`[Speed Controller] 已将YouTube视频速度设置为 ${currentSpeed}x`);
            }
        });
    }

    // 重置视频速度为默认值
    function resetVideoSpeed() {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (video) {
                video.playbackRate = 1.0;
            }
        });
    }

    // 设置视频元素观察器，处理动态加载的视频
    function setupVideoObserver() {
        if (observer) {
            disconnectObserver();
        }

        observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        if (node.nodeName.toLowerCase() === 'video') {
                            if (enabled && !isNaN(currentSpeed)) {
                                node.playbackRate = currentSpeed;
                                console.log(`[Speed Controller] 已将新YouTube视频速度设置为 ${currentSpeed}x`);
                            }
                        } else if (node.querySelector) {
                            const videos = node.querySelectorAll('video');
                            if (videos.length > 0 && enabled) {
                                applyVideoSpeed();
                            }
                        }
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 断开观察器连接
    function disconnectObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})(); 