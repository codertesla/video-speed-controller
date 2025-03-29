# B站、YouTube倍速器 (Video Speed Controller)

[![版本](https://img.shields.io/badge/Version-1.0.8-blue)](manifest.json)
[![作者](https://img.shields.io/badge/Author-codertesla-brightgreen)](https://github.com/codertesla)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repo-lightgrey?logo=github)](https://github.com/codertesla/video-speed-controller)

**掌控 B站/YouTube 播放速度！自动应用您的偏好倍速，观看更高效。**

一个简单易用的浏览器扩展，可以为B站(Bilibili)和YouTube独立设置不同的默认播放速度，并自动生效。

## ✨ 功能特点 (Features)

*   **独立设置**: 分别为 Bilibili 和 YouTube 设置不同的默认播放速度。
*   **自动应用**: 打开或在网站内导航到视频页面时（兼容YouTube SPA导航），自动将播放速度调整为您预设的值。
*   **图标状态显示**:
    *   插件图标实时显示当前标签页的目标播放速度 (例如 "1.5", "3.0")。
    *   插件禁用时显示 "OFF"。
    *   在非 B站/YouTube 视频页面显示 "ON" (表示插件已启用)。
*   **快捷切换**: 使用快捷键 `Alt+S` (可自定义) 快速启用或禁用插件功能。
*   **速度范围**: 支持 0.5x 到 3.0x。
*   **简洁界面**: 通过弹出窗口轻松修改速度设置。
*   **实时反馈**: 拖动滑块时，速度值实时更新。
*   **自动保存与状态提示**: 更改设置后自动保存，并在弹出窗口底部显示"已保存 ✓"或错误提示。
*   **一键重置**: 提供重置按钮 (↺)，可快速将对应平台的速度恢复为默认值 (1.0x)。

## 🚀 安装方法 (Installation)

### 商店安装 (TODO)
*   暂未发布到应用商店

### 手动安装 (开发者模式)
1.  前往 [GitHub Releases](https://github.com/codertesla/video-speed-controller/releases) 页面下载最新的 `.zip` 压缩包。
2.  解压缩下载的文件。
3.  打开 Chrome/Edge 浏览器，进入扩展管理页面 (`chrome://extensions` 或 `edge://extensions`)。
4.  启用页面右上角的 "开发者模式"。
5.  点击 "加载已解压的扩展程序" 按钮。
6.  选择您刚刚解压缩的文件夹。

## 💡 如何使用 (Usage)

1.  安装扩展后，点击浏览器工具栏上的插件图标。
2.  在弹出的窗口中，通过拖动滑块为 Bilibili 和 YouTube 设置所需的默认播放速度。
3.  点击速度值旁边的重置按钮 (↺) 可将该平台速度恢复为 1.0x。
4.  勾选/取消勾选右上角的开关来全局控制插件的启用/禁用状态。
5.  设置会自动保存（底部会有提示），访问 Bilibili 或 YouTube 的视频页面，预设的速度将被自动应用。
6.  您也可以使用快捷键 `Alt+S` 来快速切换插件的启用/禁用状态。

## 🤝 贡献指南 (Contributing)

欢迎提交问题报告 (Issues) 和功能请求！如果您想贡献代码：

1.  Fork 此仓库
2.  创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3.  提交您的更改 (`git commit -m 'Add some amazing feature'`)
4.  推送到分支 (`git push origin feature/amazing-feature`)
5.  开启一个 Pull Request

## 📄 许可证 (License)

本项目采用 MIT 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件

## 📧 联系方式 (Contact)

项目维护者: [codertesla]

项目链接: [https://github.com/codertesla/video-speed-controller](https://github.com/codertesla/video-speed-controller)

## 📁 项目结构 (Project Structure)

*   `manifest.json`: 扩展配置文件
*   `popup.html`, `popup.js`, `styles.css`: 弹出界面相关文件 (注意 CSS 文件名)
*   `background.js`: 后台服务工作线程 (处理事件、管理状态)
*   `content-scripts/`: 内容脚本目录
    *   `bilibili.js`: 注入 Bilibili 页面的脚本
    *   `youtube.js`: 注入 YouTube 页面的脚本
*   `icons/`: 扩展图标文件 