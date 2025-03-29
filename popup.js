/**
 * B站、YouTube倍速器 - 弹出界面脚本
 * 允许用户为B站和YouTube设置不同的视频播放速度
 */

document.addEventListener('DOMContentLoaded', function () {
    // 定义常量
    const MIN_SPEED = 0.5;
    const MAX_SPEED = 3.0;
    const DEFAULT_SPEED = 1.0;
    const DEFAULT_ENABLED = true;

    // 获取DOM元素
    const bilibiliSpeed = document.getElementById('bilibiliSpeed');
    const youtubeSpeed = document.getElementById('youtubeSpeed');
    const bilibiliSpeedValue = document.getElementById('bilibiliSpeedValue');
    const youtubeSpeedValue = document.getElementById('youtubeSpeedValue');
    const enableControl = document.getElementById('enableControl');
    const saveStatusElement = document.getElementById('saveStatus'); // 获取状态元素
    const footerTextElement = document.getElementById('footerText'); // 获取页脚文本元素
    const resetButtons = document.querySelectorAll('.reset-button'); // 获取所有重置按钮

    /**
     * 更新速度滑块旁边的显示文本
     * @param {HTMLInputElement} sliderElement 滑块元素
     * @param {HTMLElement} displayElement 显示值的元素
     */
    function updateSpeedDisplay(sliderElement, displayElement) {
        displayElement.textContent = sliderElement.value + 'x';
    }

    // 从存储中加载设置
    chrome.storage.sync.get({
        // 提供默认值，如果存储中没有对应键，则使用这些值
        bilibiliSpeed: DEFAULT_SPEED,
        youtubeSpeed: DEFAULT_SPEED,
        enabled: DEFAULT_ENABLED
    }, function (data) {
        // 设置滑块和复选框的初始值
        bilibiliSpeed.value = Math.max(MIN_SPEED, Math.min(MAX_SPEED, data.bilibiliSpeed));
        youtubeSpeed.value = Math.max(MIN_SPEED, Math.min(MAX_SPEED, data.youtubeSpeed));
        enableControl.checked = data.enabled;

        // 更新初始显示值
        updateSpeedDisplay(bilibiliSpeed, bilibiliSpeedValue);
        updateSpeedDisplay(youtubeSpeed, youtubeSpeedValue);
    });

    // 监听滑动条变化并实时更新显示值
    bilibiliSpeed.addEventListener('input', () => updateSpeedDisplay(bilibiliSpeed, bilibiliSpeedValue));
    youtubeSpeed.addEventListener('input', () => updateSpeedDisplay(youtubeSpeed, youtubeSpeedValue));

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
    function saveSettings() {
        const bSpeed = parseFloat(bilibiliSpeed.value);
        const ySpeed = parseFloat(youtubeSpeed.value);
        const isEnabled = enableControl.checked;

        // 验证速度值是否在有效范围内 (使用常量)
        if (isNaN(bSpeed) || bSpeed < MIN_SPEED || bSpeed > MAX_SPEED ||
            isNaN(ySpeed) || ySpeed < MIN_SPEED || ySpeed > MAX_SPEED) {
            const errorMsg = `速度必须在 ${MIN_SPEED}x 和 ${MAX_SPEED}x 之间`;
            console.error(`[Speed Controller] Invalid speed value. ${errorMsg}`);
            showStatusMessage(errorMsg, true); // 向用户显示错误
            return;
        }

        chrome.storage.sync.set({
            bilibiliSpeed: bSpeed,
            youtubeSpeed: ySpeed,
            enabled: isEnabled
        }, () => {
            if (chrome.runtime.lastError) {
                const errorMsg = "保存设置失败";
                console.error("[Speed Controller] Error saving settings:", chrome.runtime.lastError);
                showStatusMessage(errorMsg, true); // 向用户显示错误
            } else {
                // 可选：保存成功后给用户一个反馈
                console.log("[Speed Controller] Settings saved successfully.");
                showStatusMessage("已保存 ✓"); // 显示成功消息
            }
        });
    }

    // 监听值变化并保存 (change事件在用户释放滑块或更改复选框后触发)
    bilibiliSpeed.addEventListener('change', saveSettings);
    youtubeSpeed.addEventListener('change', saveSettings);
    enableControl.addEventListener('change', saveSettings);

    // 处理重置按钮点击
    resetButtons.forEach(button => {
        button.addEventListener('click', function () {
            const sliderId = this.dataset.targetSlider;
            const displayId = this.dataset.targetDisplay;
            const sliderElement = document.getElementById(sliderId);
            const displayElement = document.getElementById(displayId);

            if (sliderElement && displayElement) {
                sliderElement.value = DEFAULT_SPEED; // 设置为默认速度
                updateSpeedDisplay(sliderElement, displayElement); // 更新显示
                saveSettings(); // 触发保存
                showStatusMessage("已重置 ✓"); // 显示重置成功消息
            }
        });
    });
}); 