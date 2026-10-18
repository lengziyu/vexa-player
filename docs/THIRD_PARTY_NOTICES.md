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

## 本次 Windows x64 实际二进制

已执行二进制的 `-version` 与 `-L`，确认：

- FFmpeg：`6.1.1-essentials_build-www.gyan.dev`，启用 `--enable-gpl --enable-version3`，二进制为 GPL v3 或以后版本。
- FFprobe：`2023-02-13-git-2296078397-essentials_build-www.gyan.dev`，启用 `--enable-gpl --enable-version3`，二进制为 GPL v3 或以后版本。
- 两个工具作为独立子进程执行。本应用未将其链接为播放内核，也未因此取得更广泛的播放兼容性。

GPL 完整文本保存在 [licenses/GPL-3.0.txt](licenses/GPL-3.0.txt)。FFmpeg 自带构建与源码说明同时保留在 `node_modules/ffmpeg-static/ffmpeg.exe.README`、`ffmpeg.exe.LICENSE`；打包时保留这些文件。

Vue 与 Pinia 编译进界面资源，不再重复分发其完整 npm 包；MIT 完整许可保存在 [Vue-MIT.txt](licenses/Vue-MIT.txt) 和 [Pinia-MIT.txt](licenses/Pinia-MIT.txt)，随安装包保留。Electron 与 Chromium 自带许可、媒体工具二进制与许可不参与裁剪。

FFmpeg 构建说明给出的源码标识：[FFmpeg e38092ef93](https://github.com/FFmpeg/FFmpeg/commit/e38092ef93)。FFprobe 源码标识来自二进制版本字符串：[FFmpeg 2296078397](https://github.com/FFmpeg/FFmpeg/commit/2296078397)。构建提供者：[Gyan FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/)，下载包装器：[ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)、[ffprobe-installer](https://github.com/SavageCore/node-ffprobe-installer)。

对外分发前需为实际打包的平台、架构和构建准备完整对应源码、构建材料与第三方许可，不能只凭 npm 包的 license 字段或普通源码链接宣称已完成分发义务。本次本地测试包不等于公开发布。

## 网络与素材

正式应用不使用在线素材、远程字体或运行时下载器。媒体工具的输入协议限制为 `file,pipe`，避免本地媒体伪装成网络播放列表后触发请求。

`ui-preview/assets/` 中的 Unsplash 风景素材仅用于概念预览和生成自测视频；正式产品不包含示例库。桌面截图中的视频来自自动化生成的测试样本，不是用户真实媒体资料。
