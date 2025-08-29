/**
 * YouTube视频速度控制器
 * 使用通用视频速度控制器模块为YouTube提供倍速控制功能
 */

(function() {
    'use strict';

    let controller = null;

    // YouTube特定的配置
    const youtubeConfig = {
        // YouTube播放器选择器数组，按优先级排序
        targetSelector: [
            '#movie_player',             // 主要的电影播放器
            '.html5-video-player',       // HTML5播放器容器
            'ytd-player',                // YouTube播放器组件
            '#player-container',         // 播放器容器
            '.ytd-video-player'          // 视频播放器元素
        ],
        // 针对YouTube SPA导航的优化观察选项
        observeOptions: {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'class', 'video-id', 'data-loaded']
        },
        // YouTube视频切换较快，使用稍短的延迟
        debounceDelay: 300,
        defaultSpeed: 1.5,
        defaultEnabled: true
    };

    // 初始化YouTube视频速度控制器
    function initialize() {
        try {
            // 确保通用控制器已加载
            if (typeof VideoSpeedController === 'undefined') {
                console.error('[YouTube控制器] VideoSpeedController 未加载，延迟初始化');
                setTimeout(initialize, 100);
                return;
            }

            // 创建YouTube控制器实例
            controller = new VideoSpeedController('youtube', youtubeConfig);

            // 等待控制器初始化完成
            controller.initialize().catch(error => {
                console.error('[YouTube控制器] 初始化失败:', error);
            });

            console.log('[YouTube控制器] 启动完成');

        } catch (error) {
            console.error('[YouTube控制器] 初始化异常:', error);
        }
    }

    // YouTube特定的额外处理
    function setupYouTubeSpecificHandlers() {
        // 监听YouTube的导航事件（用于SPA页面切换）
        document.addEventListener('yt-navigate-finish', () => {
            if (controller && controller.enabled) {
                // 页面导航完成后，延迟应用速度设置
                setTimeout(() => {
                    controller.applyVideoSpeed();
                }, 1000);
            }
        });

        // 监听播放器状态变化
        const checkPlayerReady = () => {
            const player = document.querySelector('#movie_player');
            if (player && controller && controller.enabled) {
                controller.applyVideoSpeed();
            } else {
                // 如果播放器还没准备好，继续检查
                setTimeout(checkPlayerReady, 500);
            }
        };

        // 页面加载后开始检查播放器
        setTimeout(checkPlayerReady, 1000);
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initialize();
            setupYouTubeSpecificHandlers();
        });
    } else {
        initialize();
        setupYouTubeSpecificHandlers();
    }

    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        if (controller) {
            controller.destroy();
        }
    });

})(); 