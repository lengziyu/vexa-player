# Vexa 0.3.0 发布自测报告

日期：2026-10-19。结论：Windows x64 开发版通过下列检查；桌面、容量、登录面板、真实下载及编码检查均直接运行最终打包目录中的程序。安装器实际安装/卸载和长期性能验收仍未完成。

## 环境与隔离

Windows 11 x64（10.0.26200），Intel Core i5-12490F、32 GB 内存、NVIDIA GeForce RTX 3060。Electron 44.9.0、Chromium 152.0.7977.167、内置 Node.js 24.22.0。自动化使用独立临时视频库与应用目录，不读取用户账号、登录信息或真实视频资料。正式应用初始为空库。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| 严格类型检查及生产构建 | 通过 |
| 单元 / 后台集成测试 | 100 项，13 个文件通过 |
| 打包程序完整桌面流程 | 59 项通过 |
| 32 路容量及 3× / 5× 倍速 | 12 项通过 |
| X 登录面板及凭据生命周期 | 26 项通过，使用合成凭据 |
| X 公开样本真实联网下载 | 16 项通过 |
| 实际媒体编码组合 | 6 种；5 种播放，1 种显示明确的不支持提示 |
| 安装包内容、媒体工具哈希及内嵌档案 CRC | 12 项通过 |
| npm audit | 0 个已报告依赖漏洞；不代表原生二进制安全审计 |

桌面检查覆盖真实导入、元信息/封面/损坏隔离、Range 拖动、布局与播放实例保留、独立和统一控制、全屏闲置隐藏/鼠标唤醒/键盘操作、锁定换片、隐私恢复、主题与收藏持久化、组合筛选，以及 3,017 条记录的虚拟滚动和跨页选择。菜单覆盖键盘选择、Esc 回焦、数值设置保存、全屏挂载和展开期间保持控制可见。

发布复测修复了控件隐藏时焦点离开按钮可能唤醒控件的问题；检查在控件隐藏后继续等待，确认没有立即闪回。

## 32 路与高倍速

容量测试正常导入 33 个独立本地样本，拒绝超量创建并保留选择，随后创建 32 个实际播放器。检查 16 路起的资源提示、32 路帧推进、主动暂停其余 31 路及恢复、24→32 调整去重、独立与统一 3× / 5×，以及暂停状态不被倍速操作改变。

32 路为低复杂度 1080P H.264/AAC 的 4 秒采样，各播放器至少推进 98 帧，均无解码错误；采样结束时累计掉帧 588 帧。该掉帧值包含采样前已产生的帧，不是严格的 4 秒丢帧增量。观察到掉帧，因此不能将本次短测表述为 32 路长期流畅保证。

同轮桌面流程的 4 / 9 / 16 路样本均从头播放，下表记录采样区间帧数增量：

| 路数 | 采样 | 总帧增量 | 丢帧增量 |
| --- | --- | --- | --- |
| 4 | 4 秒 | 476 | 0 |
| 9 | 4 秒 | 1080 | 0 |
| 16 | 4 秒 | 1920 | 0 |

样本由 FFmpeg 生成，不能替代高码率、复杂运动、60fps、不同 GPU 或 30 分钟以上压力测试；未确认各路实际硬解方式。截图见 [32 路播放墙](screenshots/wall-32.png)。

## X 下载及可选登录

打包程序首次安装固定官方 yt-dlp 2026.08.19，校验大小及 SHA-256。Brooklyn Nets 公开样本实际下载 2,664,147 字节、270P H.264/AAC，FFprobe 验证音视频后正常入库和播放；Prime Video UK 多视频样本解析两段并选择第二段下载成功。使用直连和临时目录，结束清理样本与组件。

登录检查使用合成 auth_token / ct0，验证 Windows 系统加密保存、重启恢复、断开清除、独立登录窗口的沙箱与导航限制、官方第三方登录脚本及挑战 iframe 兼容。局部面板已检查登录可选性、权限/隐私说明、点外部或 Esc 收起、回焦、深浅主题和窄窗。没有输入或验证真实账号密码，也不能以合成检查代表真实 X 登录或受限帖子下载成功。详见 [X 下载测试记录](X_DOWNLOAD_TEST.md)。

## 安装包与体积

| 项目 | v0.2.0 | v0.3.0 |
| --- | --- | --- |
| Windows x64 安装包 | 159.70 MiB | 127.06 MiB |
| 完整应用目录 | 569.77 MiB | 479.52 MiB |
| app.asar | 44.95 MiB | 1.88 MiB |
| Electron 语言包 | 55 | 2 |

安装包 133,233,677 字节，比 v0.2.0 缩小 20.44%。保留 FFmpeg/FFprobe、SQLite WebAssembly、播放编解码和渲染回退文件、Electron/Chromium 与第三方许可。未包含测试资料、保存的账号会话或 yt-dlp 可执行文件；可选下载组件首次使用另行安装，不增加主安装包大小。

安装器内嵌归档已通过解压和 CRC 检查；两个媒体工具与原始依赖中的二进制 SHA-256 一致。安装器实际安装/卸载及正式证书签名未验收。

安装包：`release/0.3.0/Vexa-Player-0.3.0-Windows-x64.exe`。

SHA-256：`be4998d491b677717a1eca254a0107d1a65473acc02b3dde6f59cd0f7b61eeae`。

## 编码样本与限制

编码测试为 320×180、24fps、5 秒真实视频：MP4 H.264/AAC、MKV H.264/AAC、WebM VP9/Opus、MP4 HEVC 8-bit/AAC、MKV AV1/Opus 可播放；AVI MPEG-4 Part 2/MP3 显示当前内核不支持，其他画面正常播放。测试为静音音轨，未做音频听感验收，也不代表 HEVC 10-bit、4K、HDR 或全部格式均已支持。

macOS、Windows 10、其他显卡、长期内存/显存稳定性及高码率多路压力未验收。X 任务暂不跨重启保存，登录后也受平台和账号权限限制。

## 复现与记录

```powershell
npm test
npm run dist:win
npm run test:package
$env:VEXA_TEST_EXECUTABLE = (Resolve-Path -LiteralPath 'release\0.3.0\win-unpacked\Vexa Player.exe').Path
node scripts/desktop-smoke.cjs
node scripts/capacity-smoke.cjs
node scripts/x-auth-smoke.cjs
node scripts/downloads-smoke.cjs
node scripts/codec-smoke.cjs
```

下载检查会主动联网；其余样本和凭据均由测试生成。原始记录在忽略的 `test-results/*-results.json`，发行留存见 [test-summary.json](test-summary.json)。

界面截图：[全屏统一控制](screenshots/fullscreen-controls.png)、[全屏隐藏](screenshots/fullscreen-idle.png)、[全屏倍速菜单](screenshots/fullscreen-speed-menu.png)、[深色菜单](screenshots/select-menu-dark.png)、[浅色菜单](screenshots/select-menu-light.png)、[登录面板](screenshots/x-login-dark.png)。
