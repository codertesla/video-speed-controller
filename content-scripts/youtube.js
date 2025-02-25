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
        chrome.storage.onChanged.addListener(function (changes) {
            if (changes.youtubeSpeed) {
                currentSpeed = parseFloat(changes.youtubeSpeed.newValue);
                if (enabled) {
                    applyVideoSpeed();
                }
            }

            if (changes.enabled) {
                enabled = changes.enabled.newValue;
                if (enabled) {
                    applyVideoSpeed();
                    setupVideoObserver();
                } else {
                    resetVideoSpeed();
                    disconnectObserver();
                }
            }
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