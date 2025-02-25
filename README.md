# 视频速度控制器 (Video Speed Controller)

一个简单易用的浏览器扩展，可以为B站(Bilibili)和YouTube设置不同的默认播放速度。

## 功能特点

- 为B站和YouTube分别设置不同的默认播放速度
- 速度范围从0.5x到3.0x
- 简洁直观的用户界面
- 可随时启用或禁用控制

## 安装方法


### 手动安装
1. 下载此仓库的ZIP文件并解压
2. 打开Chrome浏览器，进入扩展管理页面 (chrome://extensions/)
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择解压后的文件夹

## 使用方法

1. 点击浏览器工具栏中的扩展图标
2. 使用滑块调整B站和YouTube的播放速度
3. 设置会自动保存并应用到相应网站的视频

## 贡献指南

欢迎提交问题报告和功能请求！如果您想贡献代码：

1. Fork此仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启一个Pull Request

## 许可证

本项目采用MIT许可证 - 详情请参阅 [LICENSE](LICENSE) 文件

## 联系方式

项目维护者: [codertesla]

项目链接: [https://github.com/codertesla/video-speed-controller](https://github.com/codertesla/video-speed-controller)

## 项目结构

- `manifest.json`: 扩展配置文件
- `popup.html` 和 `popup.js`: 弹出界面
- `background.js`: 后台脚本
- `content-scripts/bilibili.js`: B站视频速度控制
- `content-scripts/youtube.js`: YouTube视频速度控制
- `icons/`: 扩展图标 