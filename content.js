/**
 * 视频速度控制器 - 通用功能模块
 * 提供核心功能和共享逻辑
 */

(function () {
    'use strict';

    // 添加全局错误处理
    window.onerror = function (message, source, lineno, colno, error) {
        console.error('[Speed Controller] Global error:', message, error);
        return false;
    };

    // 通用日志函数
    function logInfo(message) {
        console.log(`[Speed Controller] ${message}`);
    }

    function logError(message, error) {
        console.error(`[Speed Controller] ${message}`, error);
    }

    // 通用消息发送函数
    function sendMessage(type, data) {
        try {
            chrome.runtime.sendMessage({
                type: type,
                ...data
            });
        } catch (e) {
            // 忽略错误
        }
    }

    // 报告速度到后台
    function reportSpeed(speed) {
        sendMessage('speedChanged', { speed });
    }

    // 导出通用函数到全局命名空间
    window.SpeedController = {
        logInfo,
        logError,
        sendMessage,
        reportSpeed
    };

    logInfo('通用模块已加载');
})();