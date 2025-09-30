/**
 * B站、YouTube倍速器 - 弹出界面脚本
 * 允许用户为B站和YouTube设置不同的视频播放速度
 */

document.addEventListener('DOMContentLoaded', async function () {
    // 统一配置常量
    const speedSettings = window.SPEED_SETTINGS || {};
    const MIN_SPEED = typeof speedSettings.MIN === "number" ? speedSettings.MIN : 0.1;
    const MAX_SPEED = typeof speedSettings.MAX === "number" ? speedSettings.MAX : 3.0;
    const DEFAULT_SPEED = typeof speedSettings.DEFAULT === "number" ? speedSettings.DEFAULT : 1.0;
    const DEFAULT_ENABLED = typeof speedSettings.DEFAULT_ENABLED === "boolean"
        ? speedSettings.DEFAULT_ENABLED
        : true;
    const PLATFORM_DEFAULTS = speedSettings.PLATFORM_DEFAULTS || {};
    const DEFAULT_BILIBILI_SPEED = Math.max(
        MIN_SPEED,
        Math.min(MAX_SPEED,
            typeof PLATFORM_DEFAULTS.bilibili === "number"
                ? PLATFORM_DEFAULTS.bilibili
                : DEFAULT_SPEED)
    );
    const DEFAULT_YOUTUBE_SPEED = Math.max(
        MIN_SPEED,
        Math.min(MAX_SPEED,
            typeof PLATFORM_DEFAULTS.youtube === "number"
                ? PLATFORM_DEFAULTS.youtube
                : DEFAULT_SPEED)
    );

    // 获取DOM元素
    const bilibiliSpeed = document.getElementById('bilibiliSpeed');
    const youtubeSpeed = document.getElementById('youtubeSpeed');
    const bilibiliSpeedInput = document.getElementById('bilibiliSpeedInput');
    const youtubeSpeedInput = document.getElementById('youtubeSpeedInput');
    const bilibiliSpeedValue = document.getElementById('bilibiliSpeedValue');
    const youtubeSpeedValue = document.getElementById('youtubeSpeedValue');
    const enableControl = document.getElementById('enableControl');
    const saveStatusElement = document.getElementById('saveStatus');
    const footerTextElement = document.getElementById('footerText');
    const resetButtons = document.querySelectorAll('.reset-button');
    const versionElement = document.getElementById('versionNumber');

    // 设置控件属性
    [bilibiliSpeed, youtubeSpeed].forEach(slider => {
        slider.min = MIN_SPEED;
        slider.max = MAX_SPEED;
        slider.step = 0.1;
    });
    [bilibiliSpeedInput, youtubeSpeedInput].forEach(input => {
        input.min = MIN_SPEED;
        input.max = MAX_SPEED;
        input.step = 0.1;
    });

    /**
     * 限制速度值范围
     * @param {number|string} value
     * @param {number} [fallback] 当值无法解析时使用的默认值
     */
    function clampSpeed(value, fallback = DEFAULT_SPEED) {
        const num = parseFloat(value);
        if (isNaN(num)) {
            return Math.max(MIN_SPEED, Math.min(MAX_SPEED, fallback));
        }
        return Math.max(MIN_SPEED, Math.min(MAX_SPEED, num));
    }

    /**
     * 更新速度滑块旁边的显示文本
     * @param {HTMLInputElement} sliderElement 滑块元素
     * @param {HTMLElement} displayElement 显示值的元素
     */
    function updateSpeedDisplay(sliderElement, displayElement) {
        displayElement.textContent = sliderElement.value + 'x';
    }

    // 从存储中加载设置
    try {
        const data = await chrome.storage.sync.get({
            bilibiliSpeed: DEFAULT_BILIBILI_SPEED,
            youtubeSpeed: DEFAULT_YOUTUBE_SPEED,
            enabled: DEFAULT_ENABLED
        });

        bilibiliSpeed.value = clampSpeed(data.bilibiliSpeed, DEFAULT_BILIBILI_SPEED);
        youtubeSpeed.value = clampSpeed(data.youtubeSpeed, DEFAULT_YOUTUBE_SPEED);
        bilibiliSpeedInput.value = bilibiliSpeed.value;
        youtubeSpeedInput.value = youtubeSpeed.value;
        enableControl.checked = data.enabled;

        updateSpeedDisplay(bilibiliSpeed, bilibiliSpeedValue);
        updateSpeedDisplay(youtubeSpeed, youtubeSpeedValue);
    } catch (e) {
        console.error('[Speed Controller] Error loading settings:', e);
    }

    // 监听滑动条变化并实时更新显示值
    bilibiliSpeed.addEventListener('input', () => {
        bilibiliSpeedInput.value = bilibiliSpeed.value;
        updateSpeedDisplay(bilibiliSpeed, bilibiliSpeedValue);
    });
    youtubeSpeed.addEventListener('input', () => {
        youtubeSpeedInput.value = youtubeSpeed.value;
        updateSpeedDisplay(youtubeSpeed, youtubeSpeedValue);
    });

    // 监听数字输入变化
    bilibiliSpeedInput.addEventListener('change', () => {
        const val = clampSpeed(bilibiliSpeedInput.value, DEFAULT_BILIBILI_SPEED);
        bilibiliSpeed.value = val;
        bilibiliSpeedInput.value = val;
        updateSpeedDisplay(bilibiliSpeed, bilibiliSpeedValue);
        saveSettings();
    });
    youtubeSpeedInput.addEventListener('change', () => {
        const val = clampSpeed(youtubeSpeedInput.value, DEFAULT_YOUTUBE_SPEED);
        youtubeSpeed.value = val;
        youtubeSpeedInput.value = val;
        updateSpeedDisplay(youtubeSpeed, youtubeSpeedValue);
        saveSettings();
    });

    /**
     * 显示状态消息并自动隐藏
     * @param {string} message 要显示的消息
     * @param {boolean} isError 是否是错误消息
     */
    function showStatusMessage(message, isError = false) {
        if (!saveStatusElement) return;

        saveStatusElement.textContent = message;
        saveStatusElement.classList.remove('show', 'error-status'); // 重置类

        if (isError) {
            saveStatusElement.classList.add('error-status');
        }

        // 立即显示
        saveStatusElement.classList.add('show');

        // 清除之前的隐藏计时器（如果有）
        if (saveStatusElement.timeoutId) {
            clearTimeout(saveStatusElement.timeoutId);
        }

        // 设置新的隐藏计时器
        saveStatusElement.timeoutId = setTimeout(() => {
            saveStatusElement.classList.remove('show');
        }, 1500); // 1.5秒后隐藏
    }

    /**
     * 保存用户设置到Chrome存储
     * 验证速度值在有效范围内
     */
    async function saveSettings() {
        const bParsed = parseFloat(bilibiliSpeed.value);
        const yParsed = parseFloat(youtubeSpeed.value);
        const isEnabled = enableControl.checked;

        if (isNaN(bParsed) || bParsed < MIN_SPEED || bParsed > MAX_SPEED ||
            isNaN(yParsed) || yParsed < MIN_SPEED || yParsed > MAX_SPEED) {
            const errorMsg = `速度必须在 ${MIN_SPEED}x 和 ${MAX_SPEED}x 之间`;
            console.error(`[Speed Controller] Invalid speed value. ${errorMsg}`);
            showStatusMessage(errorMsg, true);
            return;
        }

        const bSpeed = clampSpeed(bParsed, DEFAULT_BILIBILI_SPEED);
        const ySpeed = clampSpeed(yParsed, DEFAULT_YOUTUBE_SPEED);

        try {
            await chrome.storage.sync.set({
                bilibiliSpeed: bSpeed,
                youtubeSpeed: ySpeed,
                enabled: isEnabled
            });
            console.log('[Speed Controller] Settings saved successfully.');
            showStatusMessage('已保存 ✓');
        } catch (err) {
            const errorMsg = '保存设置失败';
            console.error('[Speed Controller] Error saving settings:', err);
            showStatusMessage(errorMsg, true);
        }
    }

    // 监听值变化并保存 (change事件在用户释放滑块或更改复选框后触发)
    bilibiliSpeed.addEventListener('change', saveSettings);
    youtubeSpeed.addEventListener('change', saveSettings);
    enableControl.addEventListener('change', saveSettings);

    const DEFAULTS_BY_SLIDER = {
        bilibiliSpeed: DEFAULT_BILIBILI_SPEED,
        youtubeSpeed: DEFAULT_YOUTUBE_SPEED
    };

    // 处理重置按钮点击
    resetButtons.forEach(button => {
        button.addEventListener('click', function () {
            const sliderId = this.dataset.targetSlider;
            const displayId = this.dataset.targetDisplay;
            const sliderElement = document.getElementById(sliderId);
            const displayElement = document.getElementById(displayId);
            const inputElement = document.getElementById(sliderId + 'Input');
            const defaultValue = DEFAULTS_BY_SLIDER[sliderId] ?? DEFAULT_SPEED;

            if (sliderElement && displayElement) {
                const clampedDefault = clampSpeed(defaultValue, defaultValue);
                sliderElement.value = clampedDefault;
                if (inputElement) inputElement.value = clampedDefault;
                updateSpeedDisplay(sliderElement, displayElement);
                saveSettings();
                showStatusMessage('已重置 ✓');
            }
        });
    });

    // --- 新增：获取并显示版本号 ---
    if (versionElement) {
        try {
            const manifest = chrome.runtime.getManifest();
            versionElement.textContent = `v${manifest.version}`;
        } catch (e) {
            console.error("[Speed Controller] Error getting manifest version:", e);
            versionElement.textContent = 'v?.?.?'; // 出错时显示占位符
        }
    }
    // --- 结束新增 ---
}); 
