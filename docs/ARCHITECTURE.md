# Vexa 0.2.1 开发设计与边界

本轮从经过评审的 UI 原型进入桌面 MVP 开发，原型保留在 `ui-preview/`，正式应用独立使用 Vue 3、Pinia、TypeScript 严格模式、Electron 和 Vite。浅色、深色、跟随系统属于正式功能，并持久化设置。

## 内核选择

- Electron 保持网页界面与工具链一致；Tauri 的系统 WebView 不能直接解决跨平台媒体兼容问题，还会引入 Rust 与原生集成工作。
- 本轮首先实现可替换的 HTML5 Video 适配器，便于验证真实导入、多实例生命周期、布局和用户流程。支持范围以实际 Electron 解码能力为准，绝不将 MP4/MKV 扩展名识别当作编码支持保证。
- libmpv 和 libVLC 的解码能力更广，但 Electron 中原生画面合成、悬浮控件、macOS 硬解与跨架构分发需要独立验证。本轮没有将它们冒充为已完成的兼容性后备。
- H.264/AAC MP4 与 VP8/VP9 WebM 纳入本轮样本；HEVC、AV1、MKV 及其他音轨组合逐项记录验证结果。不能播放时明确显示编码限制，绝不自动上传或转码。

## 进程与安全

- 主进程：窗口、文件选择、安全 IPC、媒体授权协议、偏好设置、系统集成。
- 后台 Worker：SQLite、递归扫描、媒体探测、缩略图队列。FFprobe/FFmpeg 以无 shell、隐藏子进程运行，限制并发、超时和输出大小。
- 渲染进程：Vue 界面、播放器实例和纯布局计算。开启沙箱与上下文隔离，禁用 Node 集成，不暴露任意 IPC 或任意文件读取。
- `vexa://app` 提供打包界面；`vexa-media://media/<id>` 与 `vexa-media://thumb/<id>` 只按数据库中的媒体 ID 解析路径，支持 GET/HEAD/Range。拒绝任意路径、目录穿越、未知 ID、外部导航、新窗口及网络权限；全屏权限仅授予应用自己的主窗口。
- 正式包不依赖在线字体、图片或代码，不主动联网。开发服务器仅在开发模式允许回环地址。

## 数据

- `media`：规范路径、文件变化标识、时长、分辨率、编码、索引状态、封面状态、收藏。
- `roots`：导入目录、递归设置、可用状态。
- `media_roots`：媒体与目录多对多关联，处理父子目录重叠导入。
- 使用 sql.js 的真实 SQLite 数据文件，放在 Electron userData 中，由 Worker 独占；导出后通过临时文件原子替换。
- `settings.json` 保存白名单设置；窗口边界独立保存。默认不保存播放进度、媒体墙、观看历史或随机记录。
- 缩略图为可删除缓存，关闭后不生成文件，清除时防止旧任务回写。用户视频始终只读。

## 模块与接口

- `src/shared/contracts.ts`：媒体、设置、任务和窄接口 `DesktopApi`。
- `electron/library.ts` / `library-worker.ts`：扫描、探测、缓存和 SQLite。
- `electron/main.ts` / `preload.ts`：系统边界与 IPC。
- `src/core/layout.ts`：纯函数，支持任意 1～16 路、横竖屏、主次/智能/网格和无空槽分区。
- `src/core/random.ts`：同时去重、冷却回退和安全随机起播区间。
- `src/shared/library-query.ts`：主进程与 Worker 共用筛选白名单，属性组合使用参数化 SQL，分辨率按短边计算。
- `src/core/virtual-grid.ts` / `components/VirtualMediaGrid.vue`：计算可视范围加预留行，按需请求每页 100 条，库页缓存最多 7 页；选择集与随机池属于单独的会话状态，不受页缓存上限约束。
- `src/core/playback-quality.ts`：实际解码帧计数差值、预热与暂停排除、持续掉帧判定；不伪造 GPU/CPU 指标。
- `src/player/engine.ts`：播放器控制适配层，Vue 不直接管理底层实例命令。
- `src/stores/`：视频库分页、设置、播放墙与会话内随机状态。
- 暂停状态分别记录用户意图和资源/放大限制，解除限制只恢复用户原本想播放的画面；隐私操作写入全体暂停意图。播放 Promise 按实例和媒体 ID 检查过期响应。

## 验证与分发

0.2.1 的体积优化限定在分发层：Vue/Pinia 使用已有界面构建产物，避免生产依赖重复打包；sql.js 只保留 Worker 实际使用的 `sql-wasm.js` 和 `sql-wasm.wasm`；Electron 语言保留简体中文和英语。运行环境、渲染后备、编解码库、FFmpeg/FFprobe 二进制和许可证完整保留。

NSIS 关闭当前尚未使用的差分更新包模式，采用离线整包的 solid 压缩和 BCJ2；没有增加运行时下载。输出按 `release/<版本号>/` 隔离，减少旧版目录占用对新包的影响。`npm run test:package` 检查分发内容、媒体工具哈希，并验证安装器内嵌压缩档案的解压与 CRC。

单元验证布局几何不变量、随机锁定/去重、请求范围解析、设置白名单、真实文件扫描、SQLite 重开与取消行为；桌面验证真实导入、视频读取跳转、主题持久化、隐私恢复、跨布局实例保留。构建与打包在完成后记录结果。Windows 本机验证，macOS Intel/Apple Silicon 在缺少设备时明确标记未验证。

参考：[Electron 安全](https://www.electronjs.org/docs/latest/tutorial/security)、[协议接口](https://www.electronjs.org/docs/latest/api/protocol)、[拖拽文件路径](https://www.electronjs.org/docs/latest/api/web-utils)、[sql.js](https://github.com/sql-js/sql.js)、[Electron Builder](https://www.electron.build/)。
