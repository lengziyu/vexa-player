# README 演示素材

本目录保存 v0.3.0 Windows 实际程序的界面截图与操作录屏，使用独立临时应用目录和演示视频库，不包含用户的媒体、账号或登录信息。

- `wall-dark.webp`、`wall-light.webp`：深色、浅色播放墙。
- `library-light.webp`：视频库、缩略图和筛选。
- `controls-dark.webp`：统一进度、音量和倍速的小面板。
- `downloads-light.webp`、`x-privacy-light.webp`：下载入口和可选登录的权限说明。未登录真实账号，也未伪造下载结果。
- `vexa-demo.gif`：适合 README 直接播放的操作动图。
- `vexa-demo.mp4`：1440×1000 的高清操作录屏，无音轨。

录屏展示视频库多选建墙、布局切换、统一倍速、深浅主题与返回视频库。动图为同一录屏的压缩版本；显示帧率用于控制文档体积，不代表程序的视频播放帧率。

演示视频由仓库 `ui-preview/assets/` 中的风景素材生成轻微运镜片段。素材来源说明见 [第三方说明](../THIRD_PARTY_NOTICES.md)。应用安装包不附带这些演示视频、截图或录屏。

重新生成：

```powershell
node scripts/capture-demo.cjs
```

脚本优先使用已有的 v0.3.0 打包程序，也可通过 `VEXA_TEST_EXECUTABLE` 指定需要展示的程序；未找到打包程序时使用当前构建的 Electron 应用。录屏通过桌面窗口的画面采集生成，使用项目已有的 FFmpeg 转码。

脚本在项目 `.cache/readme-demo-*` 下使用独立应用资料，完成后清理自己的临时目录；生成的演示片段缓存在 `.cache/readme-demo-fixtures-v1` 供下次复用，不访问日常使用的应用资料。截图使用 WebP，动图使用 GIF，便于 GitHub README 展示。
