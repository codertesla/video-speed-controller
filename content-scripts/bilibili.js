/**
 * B站视频速度控制器
 * 使用通用视频速度控制器模块为B站提供倍速控制功能
 */

(function() {
    'use strict';

    let controller = null;

    // B站特定的配置
    const bilibiliConfig = {
        // B站播放器选择器数组，按优先级排序
        targetSelector: [
            '.bpx-player-video-area',    // 主要播放器区域
            '.player-container',         // 播放器容器
            '#player_module',            // 播放器模块
            '.video-container',          // 视频容器
            '#bilibili-player'           // B站播放器根元素
        ],
        // 针对B站DOM结构的优化观察选项
        observeOptions: {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'class', 'style', 'data-loaded']
        },
        maxObserverDepth: 6,
        deepTargetWarningThreshold: 9,
        // B站视频加载可能需要更长的延迟
        debounceDelay: 500,
        defaultSpeed: 1.25,
        defaultEnabled: true
    };

    // 初始化B站视频速度控制器
    function initialize() {
        try {
            // 确保通用控制器已加载
            if (typeof VideoSpeedController === 'undefined') {
                console.error('[B站控制器] VideoSpeedController 未加载，延迟初始化');
                setTimeout(initialize, 100);
                return;
            }

            // 创建B站控制器实例
            controller = new VideoSpeedController('bilibili', bilibiliConfig);

            // 等待控制器初始化完成
            controller.initialize().catch(error => {
                console.error('[B站控制器] 初始化失败:', error);
            });

            console.log('[B站控制器] 启动完成');

        } catch (error) {
            console.error('[B站控制器] 初始化异常:', error);
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        if (controller) {
            controller.destroy();
        }
    });

})(); 
