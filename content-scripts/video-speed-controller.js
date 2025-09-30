/**
 * 通用视频速度控制器模块
 * 为不同平台的视频播放器提供统一的倍速控制功能
 */

(function() {
    'use strict';

    const MIN_SPEED = (window.SPEED_SETTINGS && window.SPEED_SETTINGS.MIN) || 0.1;
    const MAX_SPEED = (window.SPEED_SETTINGS && window.SPEED_SETTINGS.MAX) || 3.0;

    // 错误处理工具
    class ErrorHandler {
        static log(level, message, error = null) {
            const prefix = '[Video Speed Controller]';
            const logMessage = `${prefix} ${message}`;

            // 仅在提供了错误对象时才追加到日志，避免在控制台出现“null”
            const logWithOptionalError = (logger) => {
                if (error !== null && error !== undefined) {
                    logger(logMessage, error);
                } else {
                    logger(logMessage);
                }
            };

            switch (level) {
                case 'error':
                    logWithOptionalError(console.error);
                    break;
                case 'warn':
                    logWithOptionalError(console.warn);
                    break;
                case 'info':
                default:
                    console.log(logMessage);
                    break;
            }
        }

    }

    // DOM操作工具
    class DOMUtils {
        static findVideoElements() {
            return Array.from(document.querySelectorAll('video')).filter(video => {
                // 放宽条件：仅忽略被显式标记的元素，尽早拿到新创建的 <video>
                return !video.classList.contains('speed-controller-ignored');
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
                   speed >= MIN_SPEED && speed <= MAX_SPEED;
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

        // 将观察目标限制在指定深度以内，返回调整后的节点与深度
        static clampObserverTargetDepth(element, maxDepth) {
            if (!element) {
                return { node: null, depth: 0 };
            }

            if (typeof maxDepth !== 'number' || maxDepth < 0) {
                return { node: element, depth: DOMUtils.getElementDepth(element) };
            }

            let current = element;
            let depth = DOMUtils.getElementDepth(current);

            while (current && current !== document.body && depth > maxDepth) {
                const parent = current.parentElement;
                if (!parent) {
                    break;
                }
                current = parent;
                depth = DOMUtils.getElementDepth(current);
            }

            return { node: current || element, depth };
        }

        // 生成便于调试的元素描述
        static describeElement(element) {
            if (!element) {
                return 'unknown';
            }

            const parts = [];
            if (element.tagName) {
                parts.push(element.tagName.toLowerCase());
            }
            if (element.id) {
                parts.push(`#${element.id}`);
            }
            if (element.classList && element.classList.length) {
                parts.push(`.${Array.from(element.classList).join('.')}`);
            }
            return parts.join('') || 'unnamed-element';
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
            this.hasLoggedDeepTargetWarning = false;
            this.storageKeys = {
                speed: `${platform}Speed`,
                enabled: 'enabled'
            };

            this.manualOverrides = new Map();
            this.observedVideos = new Set();
            this.videoSources = new Map();
            this.boundHandleRateChange = this.handleRateChange.bind(this);
            this.boundHandleLoadedMetadata = this.handleLoadedMetadata.bind(this);
            this.boundRecordInteraction = this.recordInteraction.bind(this);
            this.interactionEvents = ['pointerdown', 'mousedown', 'keydown', 'wheel', 'touchstart'];
            this.interactionTrackingInitialized = false;
            this.lastUserInteraction = 0;

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
                maxObserverDepth: typeof config.maxObserverDepth === 'number' ? config.maxObserverDepth : 6,
                deepTargetWarningThreshold: typeof config.deepTargetWarningThreshold === 'number'
                    ? config.deepTargetWarningThreshold
                    : 7,
                manualOverrideInteractionWindow: typeof config.manualOverrideInteractionWindow === 'number'
                    ? config.manualOverrideInteractionWindow
                    : 1200,
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
                this.setupUserInteractionTracking();

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
                            this.clearManualOverrides();
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
                            this.clearManualOverrides();
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
                    this.clearManualOverrides();
                    this.applyVideoSpeed();
                    this.setupObserver();
                } else {
                    this.resetVideoSpeed();
                    this.disconnectObserver();
                    this.clearManualOverrides();
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
                    this.attachVideoListeners(video);

                    if (this.manualOverrides.has(video)) {
                        return;
                    }

                    if (this.setVideoPlaybackRate(video, this.currentSpeed)) {
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
                    this.attachVideoListeners(video);

                    if (this.setVideoPlaybackRate(video, 1.0)) {
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
                let observerOptions = { ...this.config.observeOptions };

                if (Array.isArray(this.config.targetSelector)) {
                    // 如果是选择器数组，寻找最佳目标
                    targetNode = DOMUtils.findOptimalObserverTarget(this.config.targetSelector);
                } else {
                    // 单个选择器
                    targetNode = document.querySelector(this.config.targetSelector) || document.body;
                }

                // 评估目标的性能影响
                let { node: adjustedTarget, depth: targetDepth } = DOMUtils.clampObserverTargetDepth(
                    targetNode,
                    this.config.maxObserverDepth
                );

                if (adjustedTarget && adjustedTarget !== targetNode) {
                    targetNode = adjustedTarget;
                    ErrorHandler.log('info', `${this.platform} 调整观察目标为 ${DOMUtils.describeElement(targetNode)} 以降低观察深度`);
                }

                observerOptions = { ...observerOptions };
                const warningThreshold = this.config.deepTargetWarningThreshold;
                if (typeof warningThreshold === 'number' && targetDepth > warningThreshold && !this.hasLoggedDeepTargetWarning) {
                    ErrorHandler.log('info',
                        `${this.platform} 观察目标深度较大(${targetDepth})，请确认 targetSelector 是否最佳`);
                    this.hasLoggedDeepTargetWarning = true;
                }

                this.observer = new MutationObserver((mutations) => {
                    this.handleMutations(mutations);
                });

                this.observer.observe(targetNode, observerOptions);

                // 记录观察器信息用于调试
                this.observerInfo = {
                    target: DOMUtils.describeElement(targetNode),
                    depth: targetDepth,
                    options: observerOptions
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
            this.observedVideos.forEach(video => {
                video.removeEventListener('ratechange', this.boundHandleRateChange, true);
                video.removeEventListener('loadedmetadata', this.boundHandleLoadedMetadata, true);
                delete video.__speedControllerApplying;
            });
            this.observedVideos.clear();
            this.manualOverrides.clear();
            this.videoSources.clear();
            this.teardownUserInteractionTracking();
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

        attachVideoListeners(video) {
            if (!video || this.observedVideos.has(video)) {
                return;
            }

            video.addEventListener('ratechange', this.boundHandleRateChange, true);
            video.addEventListener('loadedmetadata', this.boundHandleLoadedMetadata, true);
            this.observedVideos.add(video);
            this.videoSources.set(video, video.currentSrc || video.src || '');
        }

        clearManualOverrides() {
            this.manualOverrides.clear();
        }

        setVideoPlaybackRate(video, speed) {
            if (!video || !DOMUtils.isValidSpeed(speed)) {
                return false;
            }

            if (typeof video.playbackRate !== 'number') {
                return false;
            }

            if (Math.abs(video.playbackRate - speed) < 0.001) {
                this.manualOverrides.delete(video);
                return false;
            }

            try {
                video.__speedControllerApplying = true;
                video.playbackRate = speed;
                this.manualOverrides.delete(video);
                this.videoSources.set(video, video.currentSrc || video.src || '');
                return true;
            } catch (error) {
                ErrorHandler.log('warn', `${this.platform} 设置视频速度失败，速率=${speed}`, error);
                return false;
            } finally {
                video.__speedControllerApplying = false;
            }
        }

        handleRateChange(event) {
            const video = event.target;

            if (!video || video.__speedControllerApplying) {
                return;
            }

            const newRate = video.playbackRate;

            if (!DOMUtils.isValidSpeed(newRate)) {
                return;
            }

            const now = Date.now();
            const interactionWindow = Math.max(0, this.config.manualOverrideInteractionWindow || 0);
            const hadRecentInteraction = now - this.lastUserInteraction <= interactionWindow;

            if (!hadRecentInteraction) {
                this.manualOverrides.delete(video);
                if (this.enabled) {
                    this.debounceUpdate();
                }
                return;
            }

            if (Math.abs(newRate - this.currentSpeed) < 0.001) {
                this.manualOverrides.delete(video);
                return;
            }

            this.manualOverrides.set(video, {
                speed: newRate,
                timestamp: Date.now()
            });

            ErrorHandler.log('info', `${this.platform} 检测到手动倍速 ${newRate}x，暂停自动应用`);
        }

        handleLoadedMetadata(event) {
            const video = event.target;

            if (!video) {
                return;
            }

            const newSrc = video.currentSrc || video.src || '';
            const previousSrc = this.videoSources.get(video) || '';

            if (newSrc && newSrc !== previousSrc) {
                this.manualOverrides.delete(video);
                this.videoSources.set(video, newSrc);
                ErrorHandler.log('info', `${this.platform} 检测到新媒体源，恢复自动倍速`);
            }

            if (this.enabled && !this.manualOverrides.has(video)) {
                this.debounceUpdate();
            }
        }

        recordInteraction() {
            this.lastUserInteraction = Date.now();
        }

        setupUserInteractionTracking() {
            if (this.interactionTrackingInitialized) {
                return;
            }

            this.interactionEvents.forEach(eventName => {
                document.addEventListener(eventName, this.boundRecordInteraction, true);
            });

            this.interactionTrackingInitialized = true;
        }

        teardownUserInteractionTracking() {
            if (!this.interactionTrackingInitialized) {
                return;
            }

            this.interactionEvents.forEach(eventName => {
                document.removeEventListener(eventName, this.boundRecordInteraction, true);
            });

            this.interactionTrackingInitialized = false;
        }

        prepareForNavigation() {
            this.clearManualOverrides();
            this.videoSources.clear();
            this.lastUserInteraction = 0;
        }
    }

    // 导出到全局作用域
    window.VideoSpeedController = VideoSpeedController;

})();
