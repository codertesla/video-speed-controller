/**
 * 视频速度控制器 - 弹出界面脚本
 * 允许用户为B站和YouTube设置不同的视频播放速度
 */

document.addEventListener('DOMContentLoaded', function () {
    // 获取DOM元素
    const bilibiliSpeed = document.getElementById('bilibiliSpeed');
    const youtubeSpeed = document.getElementById('youtubeSpeed');
    const bilibiliSpeedValue = document.getElementById('bilibiliSpeedValue');
    const youtubeSpeedValue = document.getElementById('youtubeSpeedValue');
    const enableControl = document.getElementById('enableControl');

    // 从存储中加载设置
    chrome.storage.sync.get(['bilibiliSpeed', 'youtubeSpeed', 'enabled'], function (data) {
        if (data.bilibiliSpeed) {
            bilibiliSpeed.value = data.bilibiliSpeed;
            bilibiliSpeedValue.textContent = data.bilibiliSpeed + 'x';
        }
        if (data.youtubeSpeed) {
            youtubeSpeed.value = data.youtubeSpeed;
            youtubeSpeedValue.textContent = data.youtubeSpeed + 'x';
        }
        if (typeof data.enabled !== 'undefined') {
            enableControl.checked = data.enabled;
        }
    });

    // 监听滑动条变化并实时更新显示值
    bilibiliSpeed.addEventListener('input', function () {
        bilibiliSpeedValue.textContent = this.value + 'x';
    });

    youtubeSpeed.addEventListener('input', function () {
        youtubeSpeedValue.textContent = this.value + 'x';
    });

    /**
     * 保存用户设置到Chrome存储
     * 验证速度值在有效范围内(0.5-3.0)
     */
    function saveSettings() {
        const bSpeed = parseFloat(bilibiliSpeed.value);
        const ySpeed = parseFloat(youtubeSpeed.value);

        // 验证速度值是否在有效范围内
        if (isNaN(bSpeed) || bSpeed < 0.5 || bSpeed > 3 ||
            isNaN(ySpeed) || ySpeed < 0.5 || ySpeed > 3) {
            console.error("[Speed Controller] Invalid speed value");
            return;
        }

        chrome.storage.sync.set({
            bilibiliSpeed: bSpeed,
            youtubeSpeed: ySpeed,
            enabled: enableControl.checked
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("[Speed Controller] Error saving settings:", chrome.runtime.lastError);
            }
        });
    }

    // 监听值变化并保存
    bilibiliSpeed.addEventListener('change', saveSettings);
    youtubeSpeed.addEventListener('change', saveSettings);
    enableControl.addEventListener('change', saveSettings);
}); 