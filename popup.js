/**
 * 视频速度控制器 - 弹出界面脚本
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
        bilibiliSpeed.value = data.bilibiliSpeed;
        youtubeSpeed.value = data.youtubeSpeed;
        enableControl.checked = data.enabled;

        // 更新初始显示值
        updateSpeedDisplay(bilibiliSpeed, bilibiliSpeedValue);
        updateSpeedDisplay(youtubeSpeed, youtubeSpeedValue);
    });

    // 监听滑动条变化并实时更新显示值
    bilibiliSpeed.addEventListener('input', () => updateSpeedDisplay(bilibiliSpeed, bilibiliSpeedValue));
    youtubeSpeed.addEventListener('input', () => updateSpeedDisplay(youtubeSpeed, youtubeSpeedValue));

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
            console.error(`[Speed Controller] Invalid speed value. Must be between ${MIN_SPEED} and ${MAX_SPEED}.`);
            // 可以在此处添加用户可见的错误提示，例如修改一个状态元素的文本
            return;
        }

        chrome.storage.sync.set({
            bilibiliSpeed: bSpeed,
            youtubeSpeed: ySpeed,
            enabled: isEnabled
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("[Speed Controller] Error saving settings:", chrome.runtime.lastError);
                // 可以在此处添加用户可见的错误提示
            } else {
                // 可选：保存成功后给用户一个反馈
                // console.log("[Speed Controller] Settings saved successfully.");
            }
        });
    }

    // 监听值变化并保存 (change事件在用户释放滑块或更改复选框后触发)
    bilibiliSpeed.addEventListener('change', saveSettings);
    youtubeSpeed.addEventListener('change', saveSettings);
    enableControl.addEventListener('change', saveSettings);
}); 