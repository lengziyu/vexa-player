# 第三方依赖与媒体工具

依赖锁定于根目录 `package-lock.json`，不直接复用竞品代码。应用项目许可证尚未选定，当前私有开发使用 `UNLICENSED`，不代表第三方代码可以省略其许可。

| 依赖 | 版本 | 上游许可 |
| --- | --- | --- |
| Electron | 44.9.0 | MIT；其分发包另带 Chromium 等第三方许可 |
| Vue | 3.5.44 | MIT |
| Pinia | 4.1.0 | MIT |
| sql.js | 1.15.0 | MIT；SQLite 上游 public domain |
| Vite / electron-vite | 8.3.4 / 6.0.0 | MIT |
| electron-builder | 26.15.3 | MIT |
| TypeScript | 5.9.3 | Apache-2.0 |
| ffmpeg-static | 5.3.0 | GPL-3.0-or-later |
| @ffprobe-installer/ffprobe | 2.1.2 | 包装器声明 LGPL-2.1；不等于二进制许可 |
| Playwright / Vitest | 1.64.1 / 5.0.5 | Apache-2.0 / MIT；仅开发测试 |
| yt-dlp（首次使用可选安装） | 2026.08.19 | 源码 Unlicense；官方 standalone 分发包含 GPLv3+ 等第三方组件，不能仅按源码许可证理解 |

## 本次 Windows x64 实际二进制

已执行二进制的 `-version` 与 `-L`，确认：

- FFmpeg：`6.1.1-essentials_build-www.gyan.dev`，启用 `--enable-gpl --enable-version3`，二进制为 GPL v3 或以后版本。
- FFprobe：`2023-02-13-git-2296078397-essentials_build-www.gyan.dev`，启用 `--enable-gpl --enable-version3`，二进制为 GPL v3 或以后版本。
- 两个工具作为独立子进程执行。本应用未将其链接为播放内核，也未因此取得更广泛的播放兼容性。

GPL 完整文本保存在 [licenses/GPL-3.0.txt](licenses/GPL-3.0.txt)。FFmpeg 自带构建与源码说明同时保留在 `node_modules/ffmpeg-static/ffmpeg.exe.README`、`ffmpeg.exe.LICENSE`；打包时保留这些文件。

Vue 与 Pinia 编译进界面资源，不再重复分发其完整 npm 包；MIT 完整许可保存在 [Vue-MIT.txt](licenses/Vue-MIT.txt) 和 [Pinia-MIT.txt](licenses/Pinia-MIT.txt)，随安装包保留。Electron 与 Chromium 自带许可、媒体工具二进制与许可不参与裁剪。

FFmpeg 构建说明给出的源码标识：[FFmpeg e38092ef93](https://github.com/FFmpeg/FFmpeg/commit/e38092ef93)。FFprobe 源码标识来自二进制版本字符串：[FFmpeg 2296078397](https://github.com/FFmpeg/FFmpeg/commit/2296078397)。构建提供者：[Gyan FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/)，下载包装器：[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)、[ffprobe-installer](https://github.com/SavageCore/node-ffprobe-installer)。

所用平台、架构和构建的对应源码、构建材料与第三方许可应按其实际条款处理，不能只凭 npm 包的 license 字段或普通源码链接宣称已完成分发义务。v0.3.0 Windows 发行保留上述许可证与构建来源说明；此文不把来源链接表述为完整对应源码材料的替代品。

## 网络与素材

本地播放界面不使用在线素材或远程字体。X 下载为用户主动使用的可选联网功能：官方下载组件、X 原生视频与受限封面请求由独立后台处理；渲染页面继续禁止任意外联。本地媒体工具的输入协议限制仍为 `file,pipe`，避免本地媒体伪装成网络播放列表后触发请求。

yt-dlp 官方 `2026.08.19` 的 [源码许可](licenses/yt-dlp-LICENSE) 与 [发行组件第三方许可清单](licenses/yt-dlp-THIRD_PARTY_LICENSES.txt) 保存在仓库并随主安装包保留；组件安装/手动导入时同时复制到组件目录，并附 GPL 文本。来源：[固定版本发布页](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19)、[对应源码树](https://github.com/yt-dlp/yt-dlp/tree/2026.08.19)。v0.3.0 主安装包不内置 yt-dlp 可执行文件，只有用户主动安装或导入后才使用该可选组件；主安装包的体积不包含该组件的下载体积。

`ui-preview/assets/` 中的 Unsplash 风景素材仅用于概念预览和生成自测视频；正式产品不包含示例库。桌面截图中的视频来自自动化生成的测试样本，不是用户真实媒体资料。
