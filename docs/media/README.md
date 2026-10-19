# README 演示素材

本目录保存 v0.3.0 Windows 实际程序的界面截图与操作录屏，使用独立临时应用目录和演示视频库，不包含用户的媒体、账号或登录信息。

- `wall-dark.webp`、`wall-light.webp`：深色、浅色播放墙。
- `library-light.webp`：视频库、缩略图和筛选。
- `controls-dark.webp`：统一进度、音量和倍速的小面板。
- `downloads-light.webp`、`x-privacy-light.webp`：下载入口和可选登录的权限说明。未登录真实账号，也未伪造下载结果。
- `fullscreen-grid.webp`、`fullscreen-zoom.webp`：全屏四画面与双击放大，取自同一录屏。
- `vexa-demo.gif`：全屏演示前 16 秒的精简动图，800×450、8fps，便于 README 直接播放。
- `vexa-demo.mp4`：1920×1080、30fps 的完整全屏操作录屏，无音轨。

完整录屏集中展示全屏四画面、主次与网格布局切换、双击放大及恢复、随机换片、拖动交换、六画面播放、统一进度与倍速，以及控件自动隐藏和鼠标唤醒。没有穿插视频库或下载表单；窗口界面的主题、视频库与下载截图单独保留。

鼠标指针和点击光圈是录屏辅助提示，仅存在于临时演示窗口。界面动作使用实际按钮和鼠标操作完成，脚本检查放大/恢复、媒体切换、画面交换和闲置状态。动图为同一录屏的前段节选；编码帧率不代表播放器性能测试结果，完整操作与更流畅的效果请观看 MP4。

演示视频由仓库 `ui-preview/assets/` 中的风景素材生成轻微运镜片段。素材来源说明见 [第三方说明](../THIRD_PARTY_NOTICES.md)。应用安装包不附带这些演示视频、截图或录屏。

重新生成：

```powershell
node scripts/capture-demo.cjs --fullscreen
```

脚本优先使用已有的 v0.3.0 打包程序，也可通过 `VEXA_TEST_EXECUTABLE` 指定需要展示的程序；未找到打包程序时使用当前构建的 Electron 应用。录屏通过桌面窗口的画面采集生成，使用项目已有的 FFmpeg 转码。

不带 `--fullscreen` 参数时，脚本重新采集窗口截图和基础操作演示；要保留本页的全屏版本，完成窗口截图采集后再运行一次上面的命令。

脚本在项目 `.cache/readme-demo-*` 下使用独立应用资料，完成后清理自己的临时目录；生成的演示片段缓存在 `.cache/readme-demo-fixtures-v1` 供下次复用，不访问日常使用的应用资料。截图使用 WebP，动图使用 GIF，便于 GitHub README 展示。
