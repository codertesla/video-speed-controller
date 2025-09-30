// 简化版本的 background.js
console.info("[Speed Controller] Background service worker started");

const MIN_ALLOWED_SPEED = 0.1;
const MAX_ALLOWED_SPEED = 3.0;
const STORAGE_DEFAULTS = Object.freeze({
    enabled: true,
    bilibiliSpeed: 1.25,
    youtubeSpeed: 1.5
});

function getStorageDefaults() {
    return { ...STORAGE_DEFAULTS };
}

function sanitizeSpeed(value, fallback) {
    const fallbackSpeed = typeof fallback === 'number' ? fallback : STORAGE_DEFAULTS.bilibiliSpeed;
    const numericValue = parseFloat(value);

    if (Number.isNaN(numericValue)) {
        return Math.max(MIN_ALLOWED_SPEED, Math.min(MAX_ALLOWED_SPEED, fallbackSpeed));
    }

    return Math.max(MIN_ALLOWED_SPEED, Math.min(MAX_ALLOWED_SPEED, numericValue));
}

// 消息管理器 - 优化消息传递机制
class MessageManager {
    constructor() {
        this.pendingMessages = new Map(); // tabId -> Set of message types
        this.messageQueue = new Map(); // tabId -> Array of queued messages
        this.maxConcurrentMessages = 3; // 每个标签页最大并发消息数
        this.messageTimeout = 10000; // 消息超时时间（毫秒）
        this.retryDelays = [1000, 2000, 5000]; // 重试延迟时间
    }

    // 发送消息到指定标签页（带队列和去重）
    async sendMessage(tabId, message, options = {}) {
        const {
            priority = 'normal', // 'high', 'normal', 'low'
            skipQueue = false,
            timeout = this.messageTimeout
        } = options;

        if (!tabId || typeof tabId !== 'number') {
            throw new Error('Invalid tabId for message sending');
        }

        // 消息去重检查
        const messageKey = this.getMessageKey(message);
        if (this.isMessagePending(tabId, messageKey) && !skipQueue) {
            console.log(`[MessageManager] Message ${messageKey} already pending for tab ${tabId}, queuing`);
            this.queueMessage(tabId, { message, options, messageKey });
            return;
        }

        // 标记消息为待处理
        this.markMessagePending(tabId, messageKey);

        try {
            const result = await this.sendMessageWithRetry(tabId, message, timeout);

            this.clearMessagePending(tabId, messageKey);

            // 消息发送成功，处理队列中的下一条消息
            this.processQueuedMessages(tabId);

            return result;

        } catch (error) {
            // 消息发送失败，清除待处理标记
            this.clearMessagePending(tabId, messageKey);

            // 根据错误类型决定是否重试
            if (this.shouldRetry(error) && !skipQueue) {
                console.log(`[MessageManager] Queuing failed message ${messageKey} for retry`);
                this.queueMessage(tabId, { message, options, messageKey }, true);
                const retryDelay = this.retryDelays[0] || 1000;
                setTimeout(() => {
                    try {
                        this.processQueuedMessages(tabId);
                    } catch (processError) {
                        console.error('[MessageManager] Failed to process queued messages after retry scheduling:', processError);
                    }
                }, retryDelay);
            } else {
                throw error;
            }
        }
    }

    // 带重试的消息发送
    async sendMessageWithRetry(tabId, message, timeout) {
        let lastError;

        for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
            try {
                const result = await this.sendMessageOnce(tabId, message, timeout);
                return result;

            } catch (error) {
                lastError = error;

                if (attempt < this.retryDelays.length) {
                    const delay = this.retryDelays[attempt];
                    console.log(`[MessageManager] Message attempt ${attempt + 1} failed, retrying in ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    // 单次消息发送
    async sendMessageOnce(tabId, message, timeout) {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Message timeout after ${timeout}ms`));
            }, timeout);

            try {
                // 先验证标签页存在
                const tab = await chrome.tabs.get(tabId);

                // 发送消息
                const response = await chrome.tabs.sendMessage(tabId, {
                    ...message,
                    _messageId: Date.now() + Math.random(),
                    _timestamp: Date.now()
                });

                clearTimeout(timeoutId);
                resolve(response);

            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    // 获取消息唯一键（用于去重）
    getMessageKey(message) {
        if (message.type === 'applySettings') {
            const speedValue = message.settings?.speed;
            const enabledValue = message.settings?.enabled;
            const normalizedSpeed = typeof speedValue === 'number' ? speedValue : parseFloat(speedValue);
            const speedKey = Number.isFinite(normalizedSpeed) ? normalizedSpeed : 'unknown';
            const enabledKey = enabledValue === false ? 'off' : 'on';
            return `applySettings_${enabledKey}_${speedKey}`;
        }
        return message.type || 'unknown';
    }

    // 检查消息是否正在处理中
    isMessagePending(tabId, messageKey) {
        const pending = this.pendingMessages.get(tabId);
        return pending && pending.has(messageKey);
    }

    // 标记消息为待处理
    markMessagePending(tabId, messageKey) {
        if (!this.pendingMessages.has(tabId)) {
            this.pendingMessages.set(tabId, new Set());
        }
        this.pendingMessages.get(tabId).add(messageKey);
    }

    // 清除消息待处理标记
    clearMessagePending(tabId, messageKey) {
        const pending = this.pendingMessages.get(tabId);
        if (pending) {
            pending.delete(messageKey);
            if (pending.size === 0) {
                this.pendingMessages.delete(tabId);
            }
        }
    }

    // 将消息加入队列
    queueMessage(tabId, messageData, isRetry = false) {
        if (!this.messageQueue.has(tabId)) {
            this.messageQueue.set(tabId, []);
        }

        const queue = this.messageQueue.get(tabId);

        if (isRetry) {
            // 重试消息插入到队列前面
            queue.unshift(messageData);
        } else {
            // 新消息添加到队列后面
            queue.push(messageData);
        }

        // 限制队列大小
        if (queue.length > 10) {
            queue.splice(10); // 保留最新的10条消息
            console.warn(`[MessageManager] Message queue for tab ${tabId} is full, dropping old messages`);
        }
    }

    // 处理队列中的消息
    processQueuedMessages(tabId) {
        const queue = this.messageQueue.get(tabId);
        if (!queue || queue.length === 0) return;

        // 检查是否可以发送更多消息
        const pendingCount = this.pendingMessages.get(tabId)?.size || 0;
        if (pendingCount >= this.maxConcurrentMessages) return;

        // 发送下一条消息
        const nextMessage = queue.shift();
        if (nextMessage) {
            this.sendMessage(tabId, nextMessage.message, nextMessage.options)
                .catch(error => {
                    console.error(`[MessageManager] Failed to process queued message:`, error);
                });
        }
    }

    // 判断是否应该重试
    shouldRetry(error) {
        const retryableErrors = [
            'Extension context invalidated',
            'The message port closed',
            'Could not establish connection',
            'Receiving end does not exist',
            'Message timeout'
        ];

        return retryableErrors.some(msg => error.message && error.message.includes(msg));
    }

    // 清理指定标签页的消息状态
    cleanupTab(tabId) {
        this.pendingMessages.delete(tabId);
        this.messageQueue.delete(tabId);
    }

    // 获取状态信息
    getStats() {
        const stats = {
            pendingMessages: 0,
            queuedMessages: 0,
            activeTabs: 0
        };

        for (const [tabId, pending] of this.pendingMessages) {
            stats.pendingMessages += pending.size;
            stats.activeTabs++;
        }

        for (const [tabId, queue] of this.messageQueue) {
            stats.queuedMessages += queue.length;
        }

        return stats;
    }
}

// 创建全局消息管理器实例
const messageManager = new MessageManager();

// 错误处理工具
class ErrorHandler {
    static async withRetry(operation, maxRetries = 3, delay = 1000, operationName = 'operation') {
        let lastError;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`[Speed Controller] ${operationName} failed (attempt ${i + 1}/${maxRetries}):`, error);

                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // 递增延迟
                }
            }
        }

        console.error(`[Speed Controller] ${operationName} failed after ${maxRetries} attempts:`, lastError);
        throw lastError;
    }

    static isRecoverableError(error) {
        // 检查是否是可恢复的错误
        const recoverableErrors = [
            'Extension context invalidated',
            'The message port closed',
            'Could not establish connection',
            'Receiving end does not exist'
        ];

        return recoverableErrors.some(msg => error.message && error.message.includes(msg));
    }

    static logError(context, error, additionalInfo = {}) {
        const errorInfo = {
            context,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            ...additionalInfo
        };

        console.error(`[Speed Controller] ${context}:`, errorInfo);

        // 在开发环境中可以考虑上报错误统计
        if (chrome.runtime && chrome.runtime.id) {
            // 可以在这里添加错误上报逻辑
        }
    }
}

// 更新 badge 显示 - 增强版本
async function updateBadge(enabled, speed) {
    try {
        await ErrorHandler.withRetry(async () => {
            if (!enabled) {
                await chrome.action.setBadgeText({ text: 'OFF' });
                await chrome.action.setBadgeBackgroundColor({ color: '#888888' });
            } else if (speed && typeof speed === 'number' && !isNaN(speed)) {
                // 验证速度值范围
                const validSpeed = sanitizeSpeed(speed, speed);
                const speedText = Number.isInteger(validSpeed) ? validSpeed.toString() : validSpeed.toFixed(1);

                await chrome.action.setBadgeText({ text: speedText });
                await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            } else {
                await chrome.action.setBadgeText({ text: 'ON' });
                await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
            }
        }, 2, 500, 'updateBadge'); // 重试2次，延迟500ms

    } catch (error) {
        ErrorHandler.logError('Badge update failed', error, { enabled, speed });
        // 降级处理：尝试只设置文本
        try {
            await chrome.action.setBadgeText({ text: '!' });
            await chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
        } catch (fallbackError) {
            console.error('[Speed Controller] Fallback badge update also failed:', fallbackError);
        }
    }
}

// 检查 URL 是否为 Bilibili 视频页面
function isBilibiliVideoPage(url) {
    return url && url.includes('bilibili.com/video/');
}

// 检查 URL 是否为 YouTube 视频页面
function isYouTubeVideoPage(url) {
    return url && url.includes('youtube.com/watch');
}

// 尝试向指定标签页发送设置变更消息 - 使用消息管理器
async function notifyContentScript(tabId, settings, options = {}) {
    if (!tabId || typeof tabId !== 'number') {
        ErrorHandler.logError('Invalid tabId for message sending', new Error('Invalid tabId'), { tabId, settings });
        return;
    }

    console.log(`[Speed Controller] Notifying content script for tabId: ${tabId} with settings:`, settings);

    try {
        const message = {
            type: 'applySettings',
            settings: settings
        };

        // 使用消息管理器发送消息
        const response = await messageManager.sendMessage(tabId, message, {
            priority: options.priority || 'normal',
            timeout: options.timeout || 5000,
            skipQueue: options.skipQueue || false
        });

        return response;

    } catch (error) {
        // 记录错误，但不抛出（消息管理器已经处理了重试逻辑）
        ErrorHandler.logError('Message sending failed after retries', error, {
            tabId,
            settings,
            recoverable: ErrorHandler.isRecoverableError(error)
        });

        // 返回失败状态
        return { success: false, error: error.message };
    }
}

// 通用标签页更新处理函数 - 增强版本
async function handleTabUpdate(tabId, url) {
    console.log(`[Speed Controller] handleTabUpdate called for tabId: ${tabId}, url: ${url}`);

    // 输入验证
    if (!tabId || typeof tabId !== 'number') {
        ErrorHandler.logError('Invalid tabId in handleTabUpdate', new Error('Invalid tabId'), { tabId, url });
        return;
    }

    if (!url || typeof url !== 'string') {
        console.log("[Speed Controller] handleTabUpdate exiting: URL is invalid.");
        return;
    }

    try {
        // 使用重试机制获取存储设置
        const data = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.storage.sync.get(getStorageDefaults(), (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
        }, 2, 200, 'getStorageSettings');

        // 验证和清理设置数据
        const validatedData = {
            enabled: Boolean(data.enabled),
            bilibiliSpeed: sanitizeSpeed(data.bilibiliSpeed, STORAGE_DEFAULTS.bilibiliSpeed),
            youtubeSpeed: sanitizeSpeed(data.youtubeSpeed, STORAGE_DEFAULTS.youtubeSpeed)
        };

        // 更新 Badge 显示
        await updateBadgeBasedOnUrl(validatedData.enabled, url, validatedData.bilibiliSpeed, validatedData.youtubeSpeed);

        // 根据页面类型通知内容脚本
        let settings = null;
        if (isBilibiliVideoPage(url)) {
            settings = { enabled: validatedData.enabled, speed: validatedData.bilibiliSpeed };
        } else if (isYouTubeVideoPage(url)) {
            settings = { enabled: validatedData.enabled, speed: validatedData.youtubeSpeed };
        }

        if (settings) {
            await notifyContentScript(tabId, settings);
        }

    } catch (error) {
        ErrorHandler.logError('handleTabUpdate failed', error, { tabId, url });
        // 即使出错也要尝试更新badge
        try {
            await updateBadge(false);
        } catch (badgeError) {
            console.error('[Speed Controller] Fallback badge update failed:', badgeError);
        }
    }
}

// 监听设置变化 - 增强版本
chrome.storage.onChanged.addListener(async function (changes, namespace) {
    if (namespace !== 'sync') return;

    // 检查是否有相关设置发生变化
    const relevantChange = changes.enabled || changes.bilibiliSpeed || changes.youtubeSpeed;
    if (!relevantChange) return;

    try {
        // 获取当前活动标签页
        const tabs = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
        }, 2, 200, 'queryActiveTab');

        if (!tabs || !tabs[0]) {
            console.log('[Speed Controller] No active tab found for storage change update');
            return;
        }

        const activeTab = tabs[0];

        // 获取最新的设置数据
        const data = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.storage.sync.get(getStorageDefaults(), (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
        }, 2, 200, 'getUpdatedStorageSettings');

        const sanitizedBilibiliSpeed = sanitizeSpeed(data.bilibiliSpeed, STORAGE_DEFAULTS.bilibiliSpeed);
        const sanitizedYoutubeSpeed = sanitizeSpeed(data.youtubeSpeed, STORAGE_DEFAULTS.youtubeSpeed);

        // 获取最新的启用状态
        const currentEnabledRaw = changes.enabled ? changes.enabled.newValue : data.enabled;
        const currentEnabled = Boolean(currentEnabledRaw);
        const url = activeTab.url || "";

        // 更新当前标签页的 Badge 显示
        await updateBadgeBasedOnUrl(currentEnabled, url, sanitizedBilibiliSpeed, sanitizedYoutubeSpeed);

        // 如果是视频页面，通知内容脚本
        if ((isBilibiliVideoPage(url) || isYouTubeVideoPage(url)) && activeTab.id) {
            const speed = isBilibiliVideoPage(url) ? sanitizedBilibiliSpeed : sanitizedYoutubeSpeed;
            await notifyContentScript(activeTab.id, { enabled: currentEnabled, speed: speed });
        }

    } catch (error) {
        ErrorHandler.logError('Storage change listener failed', error, { changes, namespace });
    }
});

// 监听标签页激活 - 增强版本
chrome.tabs.onActivated.addListener(async function (activeInfo) {
    try {
        const tab = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.tabs.get(activeInfo.tabId, (result) => {
        if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
            return;
        }
                    resolve(result);
                });
            });
        }, 2, 200, `getTab ${activeInfo.tabId}`);

        if (tab && tab.id && tab.url) {
            await handleTabUpdate(tab.id, tab.url);
        } else {
            console.warn(`[Speed Controller] Invalid tab data for activated tab ${activeInfo.tabId}:`, tab);
        }

    } catch (error) {
        ErrorHandler.logError('Tab activation listener failed', error, { activeInfo });
    }
});

// 监听标签页更新 - 增强版本
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
    console.log(`[Speed Controller] tabs.onUpdated triggered for tabId: ${tabId}, changeInfo:`, changeInfo, `tab.url: ${tab.url}`);

    // 输入验证
    if (!tabId || typeof tabId !== 'number') {
        console.error('[Speed Controller] Invalid tabId in onUpdated listener:', tabId);
        return;
    }

    try {
        // 检查是否需要处理这次更新
        const shouldProcess = tab && tab.active && (changeInfo.url || changeInfo.status === 'complete');

        if (!shouldProcess) {
            return; // 不需要处理，直接返回
        }

        let targetUrl = null;

        // 优先使用 changeInfo.url，然后是 tab.url
        if (changeInfo.url) {
            targetUrl = changeInfo.url;
        } else if (tab.url) {
            targetUrl = tab.url;
        } else {
            // 如果都没有，异步获取最新的tab信息
            try {
                const updatedTab = await ErrorHandler.withRetry(async () => {
                    return new Promise((resolve, reject) => {
                        chrome.tabs.get(tabId, (result) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                                return;
                            }
                            resolve(result);
                        });
                    });
                }, 2, 200, `getUpdatedTab ${tabId}`);

                if (updatedTab && updatedTab.url) {
                    targetUrl = updatedTab.url;
                }
            } catch (error) {
                ErrorHandler.logError('Failed to get updated tab info', error, { tabId, changeInfo });
                return;
            }
        }

        // 如果获取到了有效的URL，处理标签页更新
        if (targetUrl && typeof targetUrl === 'string') {
            await handleTabUpdate(tabId, targetUrl);
        } else {
            console.warn(`[Speed Controller] No valid URL found for tab ${tabId}`);
        }

    } catch (error) {
        ErrorHandler.logError('Tab update listener failed', error, {
            tabId,
            changeInfo,
            tabUrl: tab?.url
        });
    }
});

// 处理快捷键 - 增强版本
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-speed-control") return;

    try {
        console.log('[Speed Controller] Toggle command received');

        // 获取当前启用状态
        const data = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.storage.sync.get(['enabled'], (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
        }, 2, 200, 'getEnabledStatus');

        const currentEnabledRaw = data.enabled !== undefined ? data.enabled : STORAGE_DEFAULTS.enabled;
        const currentEnabled = Boolean(currentEnabledRaw);
        const newEnabled = !currentEnabled;

        // 保存新的启用状态
        await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.storage.sync.set({ enabled: newEnabled }, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve();
                });
            });
        }, 2, 200, 'setEnabledStatus');

        console.log(`[Speed Controller] Toggled speed control: ${currentEnabled} -> ${newEnabled}`);

        // 显示用户反馈（通过badge变化）
        try {
            await updateBadge(newEnabled);
        } catch (badgeError) {
            console.warn('[Speed Controller] Could not update badge after toggle:', badgeError);
        }

    } catch (error) {
        ErrorHandler.logError('Command toggle failed', error, { command });
    }
});

// 接收内容脚本的消息 - 增强版本
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    try {
        // 验证消息来源和内容
        if (!message || !message.type) {
            console.warn('[Speed Controller] Received invalid message:', message);
            sendResponse({ success: false, error: 'Invalid message format' });
            return false;
        }

        if (!sender || !sender.tab) {
            console.warn('[Speed Controller] Message from unknown sender:', sender);
            sendResponse({ success: false, error: 'Unknown sender' });
            return false;
        }

        console.log('[Speed Controller] Received message:', message.type, 'from tab:', sender.tab.id);

        // 处理状态查询消息
        if (message.type === 'getStatus') {
            try {
                const data = await ErrorHandler.withRetry(async () => {
                    return new Promise((resolve, reject) => {
                        chrome.storage.sync.get(getStorageDefaults(), (result) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                                return;
                            }
                            resolve(result);
                        });
                    });
                }, 2, 200, 'getStatusData');

                sendResponse({
                    success: true,
                    status: {
                        enabled: Boolean(data.enabled),
                        bilibiliSpeed: sanitizeSpeed(data.bilibiliSpeed, STORAGE_DEFAULTS.bilibiliSpeed),
                        youtubeSpeed: sanitizeSpeed(data.youtubeSpeed, STORAGE_DEFAULTS.youtubeSpeed),
                        tabId: sender.tab.id,
                        url: sender.tab.url
                    }
                });

            } catch (error) {
                ErrorHandler.logError('Status query failed', error, { senderTabId: sender.tab.id });
                sendResponse({ success: false, error: 'Failed to get status' });
            }
            return true; // 异步响应
        }

        // 未知消息类型
        console.warn('[Speed Controller] Unknown message type:', message.type);
        sendResponse({ success: false, error: 'Unknown message type' });
        return false;

    } catch (error) {
        ErrorHandler.logError('Message listener failed', error, {
            message,
            senderTabId: sender?.tab?.id
        });
        sendResponse({ success: false, error: 'Message processing failed' });
        return false;
    }
});

// 监听 Web Navigation 的 History State 更新 - 增强版本
chrome.webNavigation.onHistoryStateUpdated.addListener(async function (details) {
    try {
        // 输入验证
        if (!details || !details.url || typeof details.tabId !== 'number') {
            console.warn('[Speed Controller] Invalid webNavigation details:', details);
            return;
        }

    // 仅处理顶级框架 (frameId === 0) 的导航事件
        if (details.frameId !== 0) {
            console.log(`[Speed Controller] webNavigation - Ignoring event for non-top frame (frameId: ${details.frameId})`);
            return;
        }

        console.log("[Speed Controller] webNavigation.onHistoryStateUpdated triggered:", {
            tabId: details.tabId,
            url: details.url,
            transitionType: details.transitionType
        });

        // 检查是否是支持的视频页面
        const isYouTube = isYouTubeVideoPage(details.url);
        const isBilibili = isBilibiliVideoPage(details.url);

        if (isYouTube || isBilibili) {
            console.log(`[Speed Controller] webNavigation - Processing ${isYouTube ? 'YouTube' : 'Bilibili'} navigation for tabId: ${details.tabId}`);
            await handleTabUpdate(details.tabId, details.url);
        } else {
            console.log(`[Speed Controller] webNavigation - Ignoring non-video page: ${details.url}`);
        }

    } catch (error) {
        ErrorHandler.logError('WebNavigation listener failed', error, { details });
    }
});

// Helper function to determine badge text based on state and URL - 增强版本
async function updateBadgeBasedOnUrl(isEnabled, url, bilibiliSpeed, youtubeSpeed) {
    try {
        // 输入验证
        if (typeof isEnabled !== 'boolean') {
            console.warn('[Speed Controller] Invalid isEnabled value:', isEnabled);
        }

        if (typeof url !== 'string') {
            console.warn('[Speed Controller] Invalid URL value:', url);
            url = '';
        }

        const normalizedEnabled = Boolean(isEnabled);

        // 验证和清理速度值
        const validBiliSpeed = sanitizeSpeed(bilibiliSpeed, STORAGE_DEFAULTS.bilibiliSpeed);
        const validYtSpeed = sanitizeSpeed(youtubeSpeed, STORAGE_DEFAULTS.youtubeSpeed);

        if (!normalizedEnabled) {
            await updateBadge(false); // 显示 OFF
        } else if (isBilibiliVideoPage(url)) {
            await updateBadge(true, validBiliSpeed); // 显示 B站速度
        } else if (isYouTubeVideoPage(url)) {
            await updateBadge(true, validYtSpeed); // 显示 YouTube 速度
        } else {
            await updateBadge(true); // 非视频页显示 ON
        }

    } catch (error) {
        ErrorHandler.logError('updateBadgeBasedOnUrl failed', error, {
            isEnabled,
            url,
            bilibiliSpeed,
            youtubeSpeed
        });

        // 降级处理
        try {
            await updateBadge(false);
        } catch (fallbackError) {
            console.error('[Speed Controller] Fallback badge update also failed:', fallbackError);
        }
    }
}

// 初始加载时设置 Badge - 增强版本
chrome.runtime.onStartup.addListener(async () => {
    try {
        console.log('[Speed Controller] Extension startup - initializing badge');

        const tabs = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
        }, 2, 200, 'queryActiveTabOnStartup');

        if (!tabs || !tabs[0]) {
            console.log('[Speed Controller] No active tab found on startup');
            return;
        }

        const data = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.storage.sync.get(getStorageDefaults(), (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
        }, 2, 200, 'getStorageOnStartup');

        const sanitizedBilibiliSpeed = sanitizeSpeed(data.bilibiliSpeed, STORAGE_DEFAULTS.bilibiliSpeed);
        const sanitizedYoutubeSpeed = sanitizeSpeed(data.youtubeSpeed, STORAGE_DEFAULTS.youtubeSpeed);

        await updateBadgeBasedOnUrl(Boolean(data.enabled), tabs[0].url || "", sanitizedBilibiliSpeed, sanitizedYoutubeSpeed);

    } catch (error) {
        ErrorHandler.logError('Startup initialization failed', error);
    }
});

// 安装或更新时设置初始状态和 Badge - 增强版本
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        console.log(`[Speed Controller] Extension ${details.reason} - version ${chrome.runtime.getManifest().version}`);

    if (details.reason === "install") {
        // 设置默认值
            await ErrorHandler.withRetry(async () => {
                return new Promise((resolve, reject) => {
                    chrome.storage.sync.set({ ...STORAGE_DEFAULTS }, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        resolve();
                    });
                });
            }, 2, 200, 'setDefaultSettings');

            console.log('[Speed Controller] Default settings initialized');
        }

        // 获取当前活动标签页
        const tabs = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
        }, 2, 200, 'queryActiveTabOnInstall');

        if (!tabs || !tabs[0]) {
            console.log('[Speed Controller] No active tab found during installation');
            return;
        }

        // 获取设置并更新badge
        const data = await ErrorHandler.withRetry(async () => {
            return new Promise((resolve, reject) => {
                chrome.storage.sync.get(getStorageDefaults(), (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    resolve(result);
                });
            });
        }, 2, 200, 'getStorageOnInstall');

        const sanitizedBilibiliSpeed = sanitizeSpeed(data.bilibiliSpeed, STORAGE_DEFAULTS.bilibiliSpeed);
        const sanitizedYoutubeSpeed = sanitizeSpeed(data.youtubeSpeed, STORAGE_DEFAULTS.youtubeSpeed);

        await updateBadgeBasedOnUrl(Boolean(data.enabled), tabs[0].url || "", sanitizedBilibiliSpeed, sanitizedYoutubeSpeed);

    } catch (error) {
        ErrorHandler.logError('Installation initialization failed', error, { details });
    }
});

// 监听标签页关闭事件，清理消息管理器状态
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`[Speed Controller] Tab ${tabId} removed, cleaning up message manager state`);
    messageManager.cleanupTab(tabId);
});

// 定期清理和状态报告（可选的调试功能）
if (chrome.runtime.getManifest().version.includes('dev')) {
    setInterval(() => {
        const stats = messageManager.getStats();
        console.log('[MessageManager] Stats:', stats);

        // 清理长时间未使用的状态（可选）
        // 这里可以添加更复杂的清理逻辑
    }, 30000); // 每30秒报告一次状态
}
