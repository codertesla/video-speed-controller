/**
 * 视频速度控制器 - B站内容脚本
 * 自动设置B站视频的播放速度
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
        chrome.storage.sync.get(['bilibiliSpeed', 'enabled'], function (data) {
            if (data.bilibiliSpeed) {
                currentSpeed = parseFloat(data.bilibiliSpeed);
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
            if (namespace !== 'sync') return; // 只关心 sync 存储

            let needsSpeedUpdate = false;

            if (changes.bilibiliSpeed) {
                currentSpeed = parseFloat(changes.bilibiliSpeed.newValue);
                if (enabled) { // 只有在启用时，速度变化才需要立即应用
                    needsSpeedUpdate = true;
                }
            }

            if (changes.enabled) {
                const newEnabledState = changes.enabled.newValue;
                if (enabled !== newEnabledState) { // 状态确实改变了
                    enabled = newEnabledState;
                    if (enabled) {
                        // 从禁用变为启用，应用速度并开始观察
                        needsSpeedUpdate = true; // 应用当前（可能刚更新的）速度
                        setupVideoObserver(); // 确保观察器运行
                    } else {
                        // 从启用变为禁用，重置速度并停止观察
                        resetVideoSpeed();
                        disconnectObserver();
                    }
                }
            }

            // 如果需要更新速度 (变为启用或速度变化时启用状态)
            if (needsSpeedUpdate && enabled) {
                applyVideoSpeed();
            }
        });

        // 新增：监听来自 background script 的消息 (处理 tab 更新/激活/SPA导航)
        chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
            console.log("[Speed Controller Bilibili] Received message:", message); // 日志
            if (message.type === 'applySettings' && message.settings) {
                const newEnabledState = message.settings.enabled;
                const newSpeed = parseFloat(message.settings.speed);

                // 更新状态 (即使与当前状态相同也无妨，确保同步)
                enabled = newEnabledState;
                if (!isNaN(newSpeed)) {
                    currentSpeed = newSpeed;
                }

                console.log(`[Speed Controller Bilibili] Applying settings from message: enabled=${enabled}, speed=${currentSpeed}`); // 日志

                // 根据收到的状态应用设置
                if (enabled) {
                    applyVideoSpeed();
                    setupVideoObserver(); // 确保观察器在需要时运行
                } else {
                    resetVideoSpeed();
                    disconnectObserver();
                }
                // 可以选择性地返回 true 表示异步响应，但这里不需要
                // sendResponse({ status: "done" });
                return false; // 同步处理完成
            }
            return false; // 表示未处理此消息或同步处理完成
        });
    }

    // 应用视频速度
    function applyVideoSpeed() {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (video && video.playbackRate !== currentSpeed && !isNaN(currentSpeed)) {
                video.playbackRate = currentSpeed;
                console.log(`[Speed Controller] 已将B站视频速度设置为 ${currentSpeed}x`);
            }
        });
    }

    // 重置视频速度
    function resetVideoSpeed() {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (video && video.playbackRate !== 1.0) {
                video.playbackRate = 1.0;
                console.log(`[Speed Controller] 已将B站视频速度重置为 1.0x`);
            }
        });
    }

    // 设置观察器 (示例，具体实现可能需要适配B站DOM结构)
    function setupVideoObserver() {
        disconnectObserver(); // 先断开旧的，避免重复

        const targetNode = document.body; // 观察整个 body 可能性能不佳，最好找到播放器容器
        const config = { childList: true, subtree: true };

        observer = new MutationObserver(mutationsList => {
            for (let mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        // 检查添加的节点是否是 video 或包含 video
                        if (node.nodeName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
                            console.log('[Speed Controller] 检测到视频元素变化，重新应用速度。');
                            applyVideoSpeed();
                            // 找到后可以考虑断开观察或优化观察目标
                        }
                    });
                }
            }
        });

        observer.observe(targetNode, config);
        console.log('[Speed Controller] MutationObserver 已设置。');
    }

    // 断开观察器
    function disconnectObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
            console.log('[Speed Controller] MutationObserver 已断开。');
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})(); 