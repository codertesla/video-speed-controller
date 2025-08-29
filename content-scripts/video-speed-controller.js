/**
 * 通用视频速度控制器模块
 * 为不同平台的视频播放器提供统一的倍速控制功能
 */

(function() {
    'use strict';

    // 错误处理工具
    class ErrorHandler {
        static log(level, message, error = null) {
            const prefix = '[Video Speed Controller]';
            const logMessage = `${prefix} ${message}`;

            switch(level) {
                case 'error':
                    console.error(logMessage, error);
                    break;
                case 'warn':
                    console.warn(logMessage, error);
                    break;
                case 'info':
                default:
                    console.log(logMessage);
                    break;
            }
        }

        static async withRetry(operation, maxRetries = 3, delay = 1000) {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await operation();
                } catch (error) {
                    if (i === maxRetries - 1) {
                        throw error;
                    }
                    ErrorHandler.log('warn', `操作失败，重试 ${i + 1}/${maxRetries}`, error);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
    }

    // DOM操作工具
    class DOMUtils {
        static findVideoElements() {
            return Array.from(document.querySelectorAll('video')).filter(video => {
                // 过滤掉一些不需要的video元素，如广告、预览等
                return video.offsetWidth > 0 && video.offsetHeight > 0 &&
                       video.readyState > 0 && !video.classList.contains('speed-controller-ignored');
            });
        }

        static getVideoContainer(video) {
            // 尝试找到视频的容器元素，通常是父级div
            let container = video.parentElement;
            while (container && container.tagName !== 'BODY') {
                if (container.offsetWidth > video.offsetWidth ||
                    container.offsetHeight > video.offsetHeight) {
                    return container;
                }
                container = container.parentElement;
            }
            return video.parentElement || document.body;
        }

        static isValidSpeed(speed) {
            return typeof speed === 'number' && !isNaN(speed) &&
                   speed >= 0.1 && speed <= 16; // 支持更广的范围
        }

        // 智能查找最佳观察目标
        static findOptimalObserverTarget(selectors) {
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return element;
                }
            }
            return document.body; // 降级到body
        }

        // 检查元素是否是有效的视频容器
        static isVideoContainer(element) {
            if (!element) return false;

            // 检查是否包含video元素或可能成为video容器的元素
            const hasVideo = element.querySelector('video') !== null;
            const hasVideoClasses = /\b(player|video|media)\b/i.test(element.className);
            const hasVideoId = /\b(player|video)\b/i.test(element.id);

            return hasVideo || hasVideoClasses || hasVideoId;
        }

        // 获取元素的深度（用于性能评估）
        static getElementDepth(element) {
            let depth = 0;
            let current = element;
            while (current && current !== document.body) {
                depth++;
                current = current.parentElement;
            }
            return depth;
        }
    }

    // 视频速度控制器核心类
    class VideoSpeedController {
        constructor(platform, config = {}) {
            this.platform = platform;
            this.currentSpeed = config.defaultSpeed || 1.0;
            this.enabled = config.defaultEnabled !== false;
            this.observer = null;
            this.isInitialized = false;
            this.storageKeys = {
                speed: `${platform}Speed`,
                enabled: 'enabled'
            };

            // 配置选项
            this.config = {
                targetSelector: config.targetSelector || 'body',
                observeOptions: config.observeOptions || {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src', 'class']
                },
                debounceDelay: config.debounceDelay || 300,
                ...config
            };

            // 防抖计时器
            this.debounceTimer = null;
        }

        // 初始化控制器
        async initialize() {
            if (this.isInitialized) return;

            try {
                await this.loadSettings();
                this.setupStorageListener();
                this.setupMessageListener();

                if (this.enabled) {
                    this.applyVideoSpeed();
                    this.setupObserver();
                }

                this.isInitialized = true;
                ErrorHandler.log('info', `${this.platform} 视频速度控制器初始化完成`);
            } catch (error) {
                ErrorHandler.log('error', `${this.platform} 控制器初始化失败`, error);
            }
        }

        // 从存储加载设置
        async loadSettings() {
            return new Promise((resolve, reject) => {
                const defaults = {
                    [this.storageKeys.speed]: this.currentSpeed,
                    [this.storageKeys.enabled]: this.enabled
                };

                chrome.storage.sync.get(defaults, (data) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    this.currentSpeed = parseFloat(data[this.storageKeys.speed]);
                    this.enabled = data[this.storageKeys.enabled];

                    if (!DOMUtils.isValidSpeed(this.currentSpeed)) {
                        this.currentSpeed = 1.0;
                        ErrorHandler.log('warn', `无效的速度值，已重置为 1.0x`);
                    }

                    resolve(data);
                });
            });
        }

        // 设置存储变化监听
        setupStorageListener() {
            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace !== 'sync') return;

                let needsUpdate = false;

                // 处理启用状态变化
                if (changes.enabled) {
                    const newEnabled = changes.enabled.newValue;
                    if (this.enabled !== newEnabled) {
                        this.enabled = newEnabled;
                        if (this.enabled) {
                            this.applyVideoSpeed();
                            this.setupObserver();
                        } else {
                            this.resetVideoSpeed();
                            this.disconnectObserver();
                        }
                        needsUpdate = true;
                    }
                }

                // 处理速度变化
                if (changes[this.storageKeys.speed]) {
                    const newSpeed = parseFloat(changes[this.storageKeys.speed].newValue);
                    if (DOMUtils.isValidSpeed(newSpeed) && this.currentSpeed !== newSpeed) {
                        this.currentSpeed = newSpeed;
                        if (this.enabled) {
                            needsUpdate = true;
                        }
                    }
                }

                if (needsUpdate && this.enabled) {
                    this.debounceUpdate();
                }
            });
        }

        // 设置消息监听
        setupMessageListener() {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'applySettings' && message.settings) {
                    this.handleSettingsMessage(message.settings);
                    sendResponse({ success: true });
                }
                return false; // 同步处理
            });
        }

        // 处理来自background的消息
        handleSettingsMessage(settings) {
            try {
                const newEnabled = settings.enabled;
                const newSpeed = parseFloat(settings.speed);

                // 更新状态
                this.enabled = newEnabled;
                if (!isNaN(newSpeed) && DOMUtils.isValidSpeed(newSpeed)) {
                    this.currentSpeed = newSpeed;
                }

                ErrorHandler.log('info',
                    `${this.platform} 收到设置更新: enabled=${this.enabled}, speed=${this.currentSpeed}`);

                // 应用设置
                if (this.enabled) {
                    this.applyVideoSpeed();
                    this.setupObserver();
                } else {
                    this.resetVideoSpeed();
                    this.disconnectObserver();
                }
            } catch (error) {
                ErrorHandler.log('error', `${this.platform} 处理设置消息失败`, error);
            }
        }

        // 应用视频速度（防抖处理）
        debounceUpdate() {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
                this.applyVideoSpeed();
            }, this.config.debounceDelay);
        }

        // 应用视频速度到所有视频元素
        applyVideoSpeed() {
            try {
                const videos = DOMUtils.findVideoElements();
                let appliedCount = 0;

                videos.forEach(video => {
                    if (video.playbackRate !== this.currentSpeed) {
                        video.playbackRate = this.currentSpeed;
                        appliedCount++;
                    }
                });

                if (appliedCount > 0) {
                    ErrorHandler.log('info',
                        `${this.platform} 已将 ${appliedCount} 个视频速度设置为 ${this.currentSpeed}x`);
                }
            } catch (error) {
                ErrorHandler.log('error', `${this.platform} 应用视频速度失败`, error);
            }
        }

        // 重置视频速度
        resetVideoSpeed() {
            try {
                const videos = DOMUtils.findVideoElements();
                let resetCount = 0;

                videos.forEach(video => {
                    if (video.playbackRate !== 1.0) {
                        video.playbackRate = 1.0;
                        resetCount++;
                    }
                });

                if (resetCount > 0) {
                    ErrorHandler.log('info', `${this.platform} 已重置 ${resetCount} 个视频速度为 1.0x`);
                }
            } catch (error) {
                ErrorHandler.log('error', `${this.platform} 重置视频速度失败`, error);
            }
        }

        // 设置DOM观察器
        setupObserver() {
            this.disconnectObserver();

            try {
                // 使用智能目标选择
                let targetNode;

                if (Array.isArray(this.config.targetSelector)) {
                    // 如果是选择器数组，寻找最佳目标
                    targetNode = DOMUtils.findOptimalObserverTarget(this.config.targetSelector);
                } else {
                    // 单个选择器
                    targetNode = document.querySelector(this.config.targetSelector) || document.body;
                }

                // 评估目标的性能影响
                const targetDepth = DOMUtils.getElementDepth(targetNode);
                const subtreeEnabled = this.config.observeOptions.subtree !== false;

                // 如果目标太深且启用了子树观察，考虑优化
                if (targetDepth > 5 && subtreeEnabled && targetNode !== document.body) {
                    ErrorHandler.log('warn',
                        `${this.platform} 观察目标深度较大(${targetDepth})，可能影响性能`);
                }

                this.observer = new MutationObserver((mutations) => {
                    this.handleMutations(mutations);
                });

                this.observer.observe(targetNode, this.config.observeOptions);

                // 记录观察器信息用于调试
                this.observerInfo = {
                    target: targetNode.tagName + (targetNode.id ? '#' + targetNode.id : '') +
                           (targetNode.className ? '.' + targetNode.className.split(' ').join('.') : ''),
                    depth: targetDepth,
                    options: this.config.observeOptions
                };

                ErrorHandler.log('info', `${this.platform} MutationObserver 已设置，目标: ${this.observerInfo.target}`);
            } catch (error) {
                ErrorHandler.log('error', `${this.platform} 设置观察器失败`, error);
            }
        }

        // 处理DOM变化
        handleMutations(mutations) {
            let hasVideoChanges = false;
            let changeCount = 0;
            const maxChangesToProcess = 50; // 限制单次处理的变更数量

            for (const mutation of mutations) {
                // 防止处理过多变更
                if (changeCount >= maxChangesToProcess) {
                    ErrorHandler.log('warn', `${this.platform} 变更数量过多，跳过部分处理`);
                    break;
                }

                if (mutation.type === 'childList') {
                    // 优化：只检查新增的节点是否与视频相关
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (this.isVideoRelatedElement(node)) {
                                hasVideoChanges = true;
                                changeCount++;
                                break; // 找到一个就够了
                            }
                        }
                    }
                } else if (mutation.type === 'attributes') {
                    // 优化：只处理视频元素的属性变化
                    if (mutation.target.nodeName === 'VIDEO') {
                        // 检查是否是重要的属性变化
                        if (this.config.observeOptions.attributeFilter) {
                            if (this.config.observeOptions.attributeFilter.includes(mutation.attributeName)) {
                                hasVideoChanges = true;
                                changeCount++;
                            }
                        } else {
                            hasVideoChanges = true;
                            changeCount++;
                        }
                    }
                }

                // 如果已经找到视频相关变化，可以提前退出
                if (hasVideoChanges) break;
            }

            if (hasVideoChanges && this.enabled) {
                ErrorHandler.log('info', `${this.platform} 检测到视频元素变化，重新应用速度 (${changeCount}个变更)`);
                this.debounceUpdate();
            }
        }

        // 检查元素是否与视频相关
        isVideoRelatedElement(element) {
            // 快速检查：直接是video元素
            if (element.nodeName === 'VIDEO') {
                return true;
            }

            // 检查是否包含video元素（但限制深度以提高性能）
            if (element.querySelector && DOMUtils.getElementDepth(element) < 3) {
                const video = element.querySelector('video');
                if (video) {
                    return true;
                }
            }

            // 检查类名和ID是否暗示这是视频容器
            return DOMUtils.isVideoContainer(element);
        }

        // 断开观察器
        disconnectObserver() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
                ErrorHandler.log('info', `${this.platform} MutationObserver 已断开`);
            }
        }

        // 销毁控制器
        destroy() {
            this.disconnectObserver();
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.isInitialized = false;
            ErrorHandler.log('info', `${this.platform} 控制器已销毁`);
        }

        // 获取当前状态
        getStatus() {
            return {
                platform: this.platform,
                enabled: this.enabled,
                currentSpeed: this.currentSpeed,
                isInitialized: this.isInitialized,
                videoCount: DOMUtils.findVideoElements().length
            };
        }
    }

    // 导出到全局作用域
    window.VideoSpeedController = VideoSpeedController;

})();
