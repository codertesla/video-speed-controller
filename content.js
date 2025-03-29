/**
 * 视频速度控制器 - 通用功能模块
 * 提供核心功能和共享逻辑
 */

(function () {
    'use strict';

    // --- 日志函数定义在 IIFE 作用域内 ---
    // 保留 logError 用于记录关键错误
    function logError(message, ...optionalParams) {
        console.error(`[Speed Controller] ${message}`, ...optionalParams);
    }
    // logInfo 和 logWarn 已移除或注释掉

    // 添加全局错误处理
    window.onerror = function (message, source, lineno, colno, error) {
        logError('Global error caught:', { message, source, lineno, colno, error });
        return false;
    };

    // 通用消息发送函数
    function sendMessage(type, data) {
        try {
            chrome.runtime.sendMessage({
                type: type,
                ...data
            }, response => {
                if (chrome.runtime.lastError) {
                    // 生产环境通常忽略消息发送错误，除非有特定需求
                    // logError('Error sending message:', chrome.runtime.lastError.message);
                }
            });
        } catch (e) {
            logError('Failed to send message:', e);
        }
    }

    // 报告速度到后台
    function reportSpeed(speed) {
        sendMessage('speedChanged', { speed });
    }

    // 示例 content.js 消息监听器
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // logInfo("Received message:", message); // 日志移除
        if (message.type === 'settingsChanged') {
            // logInfo("settingsChanged message received. Applying speed..."); // 日志移除
            applySpeedSettingsRobustly();
            sendResponse({ success: true });
        }
        // return true; // 如果需要异步响应
    });

    // --- 重命名并增强 applySpeedSettings ---
    function applySpeedSettingsRobustly() {
        // logInfo("applySpeedSettingsRobustly called"); // 日志移除

        chrome.storage.sync.get({
            enabled: true,
            youtubeSpeed: 1.5,
            bilibiliSpeed: 1.25
        }, function (data) {
            if (chrome.runtime.lastError) {
                logError("Error getting settings from storage:", chrome.runtime.lastError);
                return;
            }
            // logInfo("Storage data fetched:", data); // 日志移除

            // logInfo("Attempting to find video element ('video.html5-main-video')..."); // 日志移除
            const videoElement = document.querySelector('video.html5-main-video');

            if (!videoElement) {
                // 在生产环境中，如果找不到元素，可以选择静默失败或只记录一次错误
                // logError("Video element ('video.html5-main-video') not found. Exiting applySpeedSettingsRobustly."); // 保留或移除根据需要
                return; // 找不到元素则退出
            }

            // logInfo("Video element found:", videoElement); // 日志移除
            // logInfo(`Video readyState: ${videoElement.readyState}, current playbackRate: ${videoElement.playbackRate}`); // 日志移除

            const targetSpeed = window.location.hostname.includes('youtube.com') ? data.youtubeSpeed : data.bilibiliSpeed;

            if (!data.enabled) {
                // logInfo("Extension disabled. Setting playbackRate to 1.0"); // 日志移除
                try {
                    if (videoElement.playbackRate !== 1.0) {
                        videoElement.playbackRate = 1.0;
                        // logInfo(`playbackRate after set (disabled): ${videoElement.playbackRate}`); // 日志移除
                    } else {
                        // logInfo("playbackRate is already 1.0."); // 日志移除
                    }
                } catch (error) {
                    logError("Error setting playbackRate to 1.0 (disabled):", error);
                }
                return;
            }

            // logInfo(`Extension enabled. Target speed: ${targetSpeed}`); // 日志移除

            const setSpeed = (speed, attemptDesc) => {
                const currentVideoElement = document.querySelector('video.html5-main-video');
                if (!currentVideoElement) {
                    // logWarn(`Video element disappeared before setting speed (${attemptDesc}).`); // 日志移除
                    return;
                }
                const videoToSet = currentVideoElement;

                try {
                    if (videoToSet.playbackRate !== speed) {
                        // logInfo(`Attempting to set speed to ${speed} (${attemptDesc}) ...`); // 日志移除
                        videoToSet.playbackRate = speed;
                        // logInfo(`playbackRate immediately after set (${attemptDesc}): ${videoToSet.playbackRate}`); // 日志移除
                        // 在生产中，这个检查可能不是必需的，除非你想记录失败尝试
                        // if (Math.abs(videoToSet.playbackRate - speed) > 0.01) {
                        //     logWarn(`Failed to set speed to ${speed} (${attemptDesc}), value reverted to ${videoToSet.playbackRate}`);
                        // }
                    } else {
                        // logInfo(`Speed is already ${speed} (${attemptDesc}), no change needed.`); // 日志移除
                    }
                } catch (error) {
                    // 保留错误日志
                    logError(`Error setting playbackRate to ${speed} (${attemptDesc}):`, error);
                }
            };

            // 初始尝试
            setSpeed(targetSpeed, "Initial attempt");
            // 保留 500ms 重试
            setTimeout(() => setSpeed(targetSpeed, "Retry after 500ms"), 500);
            // 移除 1500ms 重试
            // setTimeout(() => setSpeed(targetSpeed, "Retry after 1500ms"), 1500);
        });
    }

    // 初始加载时也尝试应用一次速度
    // 延迟一点执行，给页面初始渲染一些时间
    setTimeout(applySpeedSettingsRobustly, 100); // 延迟 100ms

    // 导出通用函数到全局命名空间 (如果其他脚本需要)
    // 这次确保在函数定义之后导出
    // window.SpeedController = {
    //     logError, // 只导出需要的
    //     // ... 其他可能需要导出的函数
    // };

    // logInfo('通用模块已加载'); // 日志移除
})();