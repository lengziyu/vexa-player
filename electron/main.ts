import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  screen,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { Worker } from "node:worker_threads";
import { join, resolve, relative, isAbsolute, extname } from "node:path";
import {
  readFile,
  writeFile,
  rename,
  mkdir,
  realpath,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { Downloads } from "./downloads";
import { DownloadNetwork } from "./download-network";
import { XAuthentication } from "./x-auth";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "@ffprobe-installer/ffprobe";
import {
  defaultSettings,
  type Settings,
  type MediaItem,
  type LibraryQuery,
  type ScanRequest,
} from "../src/shared/contracts";
import { validateId, validateSettings } from "../src/shared/validation";
import { byteRange } from "./range";
import { validateLibraryQuery } from "../src/shared/library-query";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "vexa",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: "vexa-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
let window: BrowserWindow | null = null,
  worker: Worker,
  downloads: Downloads,
  xAuthentication: XAuthentication,
  settings: Settings = { ...defaultSettings },
  quitting = false;
let settingsWrite = Promise.resolve();
let requestId = 0;
const waiting = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }
>();
const grants = new Set<string>();
function unpacked(path: string): string {
  return path.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
}
function rpc<T>(method: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error("后台操作超时，请稍后重试"));
    }, 60000);
    waiting.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });
    worker.postMessage({ id, method, args });
  });
}
function trusted(event: IpcMainInvokeEvent): void {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("无效的窗口请求");
}
function handle(
  channel: string,
  handler: (...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    trusted(event);
    return handler(...args);
  });
}
async function atomicJson(file: string, value: unknown): Promise<void> {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2));
  await rename(`${file}.tmp`, file);
}
function applyTheme(): void {
  nativeTheme.themeSource = settings.theme;
  window?.setBackgroundColor(
    nativeTheme.shouldUseDarkColors ? "#101014" : "#f6f5f9",
  );
}

async function registerProtocols(): Promise<void> {
  protocol.handle("vexa", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "app" || !["GET", "HEAD"].includes(request.method))
      return new Response(null, { status: 403 });
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    const root = join(__dirname, "../renderer"),
      file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`),
      rel = relative(root, file);
    if (rel.startsWith("..") || isAbsolute(rel))
      return new Response(null, { status: 403 });
    try {
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".json": "application/json",
      };
      return new Response(
        request.method === "HEAD" ? null : new Uint8Array(await readFile(file)),
        {
          headers: {
            "Content-Type": mime[extname(file)] || "application/octet-stream",
          },
        },
      );
    } catch {
      return new Response(null, { status: 404 });
    }
  });
  protocol.handle("vexa-media", async (request) => {
    try {
      const url = new URL(request.url);
      if (
        !["GET", "HEAD"].includes(request.method) ||
        !["media", "thumb"].includes(url.hostname)
      )
        return new Response(null, { status: 403 });
      const id = validateId(url.pathname.slice(1)),
        media = await rpc<MediaItem | null>("getMedia", id);
      if (!media) return new Response(null, { status: 404 });
      if (url.hostname === "thumb" && !media.thumbnail)
        return new Response(null, { status: 404 });
      const file =
        url.hostname === "thumb"
          ? join(app.getPath("userData"), "thumbnails", `${id}.jpg`)
          : media.path;
      if (url.hostname === "media" && (await realpath(file)) !== media.path)
        return new Response(null, { status: 403 });
      const info = await stat(file);
      if (!info.isFile()) return new Response(null, { status: 403 });
      const range = byteRange(request.headers.get("range"), info.size);
      if (range === "invalid")
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${info.size}` },
        });
      const mime: Record<string, string> = {
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".wmv": "video/x-ms-wmv",
        ".jpg": "image/jpeg",
        ".ogv": "video/ogg",
      };
      const headers: Record<string, string> = {
        "Content-Type":
          mime[extname(file).toLowerCase()] || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      };
      const start = range?.start ?? 0,
        end = range?.end ?? info.size - 1;
      headers["Content-Length"] = String(Math.max(0, end - start + 1));
      if (range)
        headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
      if (request.method === "HEAD" || info.size === 0)
        return new Response(null, { status: range ? 206 : 200, headers });
      const stream = createReadStream(file, { start, end });
      request.signal.addEventListener("abort", () => stream.destroy(), {
        once: true,
      });
      return new Response(
        Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        { status: range ? 206 : 200, headers },
      );
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
function registerIpc(): void {
  const requireAuthIdle = () => {
    if (downloads.busy)
      throw new Error("请先等待当前解析或下载结束，再修改 X 登录状态");
  };
  handle("downloads:connect-x", () => {
    requireAuthIdle();
    return xAuthentication.connect(window!, downloads.snapshot().preferences);
  });
  handle("downloads:x-browser", () =>
    shell.openExternal("https://x.com/i/flow/login"),
  );
  handle("downloads:import-x-login", async () => {
    requireAuthIdle();
    const result = await dialog.showOpenDialog(window!, {
      title: "选择已登录 X 的 Cookie 文件（仅在本机使用）",
      properties: ["openFile"],
      filters: [
        { name: "Netscape Cookie 文件", extensions: ["txt", "cookies"] },
      ],
    });
    if (!result.canceled && result.filePaths[0]) {
      requireAuthIdle();
      await xAuthentication.importFile(result.filePaths[0]);
    }
  });
  handle("downloads:disconnect-x", () => {
    requireAuthIdle();
    return xAuthentication.disconnect();
  });
  handle("downloads:snapshot", () => downloads.snapshot());
  handle("downloads:install", () => downloads.install());
  handle("downloads:engine-source", () =>
    shell.openExternal(
      "https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19",
    ),
  );
  handle("downloads:import-engine", async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: "选择官方 yt-dlp 2026.08.19 下载组件",
      properties: ["openFile"],
    });
    if (!result.canceled && result.filePaths[0])
      await downloads.importEngine(result.filePaths[0]);
  });
  handle("downloads:directory", async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: "选择视频下载保存位置",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    await downloads.setDirectory(result.filePaths[0]);
    return downloads.snapshot().preferences.directory;
  });
  handle("downloads:configure", (input) => downloads.configure(input));
  handle("downloads:paste", async () =>
    (await clipboard.readText()).slice(0, 2048),
  );
  handle("downloads:parse", (input) => downloads.parse(input));
  handle("downloads:enqueue", (input) => downloads.enqueue(input));
  handle("downloads:cancel", (id) => downloads.cancel(id));
  handle("downloads:retry", (id) => downloads.retry(id));
  handle("downloads:reveal", async (id) =>
    shell.showItemInFolder(await downloads.completedFile(id)),
  );
  handle("downloads:import", (id) => downloads.importFile(id));
  handle("downloads:clear", () => downloads.clearFinished());
  handle("appearance:get", () => nativeTheme.shouldUseDarkColors);
  handle("settings:get", () => settings);
  handle("settings:set", async (patch) => {
    const validated = validateSettings(patch);
    settingsWrite = settingsWrite
      .catch(() => {})
      .then(async () => {
        const next = { ...settings, ...validated };
        await atomicJson(join(app.getPath("userData"), "settings.json"), next);
        settings = next;
        await rpc("configure", settings.cacheEnabled);
        applyTheme();
      });
    await settingsWrite;
    return settings;
  });
  handle("files:pick", async (kind) => {
    if (!["files", "folders"].includes(String(kind)))
      throw new Error("无效选择类型");
    const result = await dialog.showOpenDialog(window!, {
      title: kind === "folders" ? "导入视频文件夹" : "导入本地视频",
      properties:
        kind === "folders"
          ? ["openDirectory", "multiSelections"]
          : ["openFile", "multiSelections"],
      ...(kind === "files"
        ? {
            filters: [
              {
                name: "视频",
                extensions: [
                  "mp4",
                  "mkv",
                  "avi",
                  "mov",
                  "wmv",
                  "webm",
                  "m4v",
                  "mpg",
                  "mpeg",
                  "ts",
                  "m2ts",
                  "flv",
                  "ogv",
                ],
              },
            ],
          }
        : {}),
    });
    for (const path of result.filePaths) grants.add(path);
    return result.canceled ? [] : result.filePaths;
  });
  handle("files:grant", (paths) => {
    if (
      !Array.isArray(paths) ||
      paths.length > 10000 ||
      paths.some((p) => typeof p !== "string" || !isAbsolute(p))
    )
      throw new Error("拖入文件无效");
    for (const path of paths) grants.add(path);
    return paths;
  });
  handle("library:scan", async (input) => {
    const request = input as ScanRequest;
    if (
      !request ||
      !Array.isArray(request.paths) ||
      !request.paths.length ||
      request.paths.length > 10000 ||
      typeof request.recursive !== "boolean" ||
      request.paths.some((p) => typeof p !== "string" || !grants.has(p))
    )
      throw new Error("请通过文件选择或拖拽导入");
    return rpc("scan", request);
  });
  handle("library:query", (query) => {
    return rpc("query", validateLibraryQuery(query));
  });
  handle("library:roots", () => rpc("roots"));
  handle("library:refresh", () => rpc("refresh"));
  handle("library:cancel", () => rpc("cancel"));
  handle("library:favorite", (id, value) => {
    if (typeof value !== "boolean") throw new Error("收藏状态无效");
    return rpc("favorite", validateId(id), value);
  });
  handle("library:remove-root", (id) => rpc("removeRoot", validateId(id)));
  handle("library:reveal", async (id) => {
    const media = await rpc<MediaItem | null>("getMedia", validateId(id));
    if (!media) throw new Error("媒体不存在");
    await stat(media.path);
    shell.showItemInFolder(media.path);
  });
  handle("cache:clear", () => rpc("clearCache"));
  handle("cache:size", () => rpc("cacheSize"));
  handle("privacy:hide", () => {
    window?.webContents.setAudioMuted(true);
    window?.minimize();
  });
}
async function createWindow(): Promise<void> {
  let bounds = {
    width: 1480,
    height: 970,
    x: undefined as number | undefined,
    y: undefined as number | undefined,
  };
  try {
    const stored = JSON.parse(
      await readFile(join(app.getPath("userData"), "window.json"), "utf8"),
    ) as { width: number; height: number; x: number; y: number };
    if (
      [stored.width, stored.height, stored.x, stored.y].every(Number.isFinite)
    ) {
      bounds = {
        width: Math.max(960, Math.min(2500, stored.width)),
        height: Math.max(700, Math.min(1800, stored.height)),
        x: stored.x,
        y: stored.y,
      };
      const visible = screen
        .getAllDisplays()
        .some(
          (d) =>
            stored.x < d.workArea.x + d.workArea.width &&
            stored.x + stored.width > d.workArea.x &&
            stored.y < d.workArea.y + d.workArea.height &&
            stored.y + 100 > d.workArea.y,
        );
      if (!visible) {
        bounds.x = undefined;
        bounds.y = undefined;
      }
    }
  } catch {}
  window = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 650,
    show: false,
    title: "Vexa Player",
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#101014" : "#f6f5f9",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.on("show", () => {
    window?.webContents.send("privacy:restore");
    window?.webContents.setAudioMuted(false);
  });
  window.on("restore", () => {
    window?.webContents.send("privacy:restore");
    window?.webContents.setAudioMuted(false);
  });
  let closingConfirmed = false,
    closePrompt = false;
  window.on("close", (event) => {
    if (!quitting && !closingConfirmed && downloads?.busy) {
      event.preventDefault();
      if (closePrompt) return;
      closePrompt = true;
      void dialog
        .showMessageBox(window!, {
          type: "question",
          title: "还有下载任务正在进行",
          message: "退出将停止正在进行的下载与解析。",
          detail: "未完成文件会清理，已完成的视频会保留。",
          buttons: ["继续使用", "退出并停止"],
          defaultId: 0,
          cancelId: 0,
        })
        .then((result) => {
          closePrompt = false;
          if (result.response === 1) {
            closingConfirmed = true;
            window?.close();
          }
        });
      return;
    }
    void xAuthentication?.close().catch(() => {});
    if (window) {
      const rect = window.getNormalBounds();
      void atomicJson(join(app.getPath("userData"), "window.json"), rect).catch(
        () => {},
      );
    }
  });
  window.on("closed", () => {
    window = null;
  });
  window.once("ready-to-show", () => window?.show());
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadURL("vexa://app/index.html");
}
const instance = app.requestSingleInstanceLock();
if (!instance) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      if (process.env.VEXA_DATA_DIR)
        app.setPath("userData", resolve(process.env.VEXA_DATA_DIR));
      await mkdir(app.getPath("userData"), { recursive: true });
      try {
        settings = {
          ...defaultSettings,
          ...validateSettings(
            JSON.parse(
              await readFile(
                join(app.getPath("userData"), "settings.json"),
                "utf8",
              ),
            ),
          ),
        };
      } catch {}
      applyTheme();
      nativeTheme.on("updated", () => {
        window?.setBackgroundColor(
          nativeTheme.shouldUseDarkColors ? "#101014" : "#f6f5f9",
        );
        window?.webContents.send(
          "appearance:changed",
          nativeTheme.shouldUseDarkColors,
        );
      });
      worker = new Worker(join(__dirname, "library-worker.cjs"), {
        workerData: {
          dataDir: app.getPath("userData"),
          wasmPath: join(
            app.getAppPath(),
            "node_modules/sql.js/dist/sql-wasm.wasm",
          ),
          ffmpegPath: ffmpegPath ? unpacked(ffmpegPath) : null,
          ffprobePath: unpacked(ffprobe.path),
          cacheEnabled: settings.cacheEnabled,
        },
      });
      worker.on(
        "message",
        (message: {
          id?: number;
          data?: unknown;
          error?: string;
          event?: string;
        }) => {
          if (message.event === "scan") {
            window?.webContents.send("library:progress", message.data);
            return;
          }
          const request = message.id ? waiting.get(message.id) : undefined;
          if (request) {
            clearTimeout(request.timer);
            waiting.delete(message.id!);
            message.error
              ? request.reject(new Error(message.error))
              : request.resolve(message.data);
          }
        },
      );
      worker.on("error", () => {
        for (const request of waiting.values()) {
          clearTimeout(request.timer);
          request.reject(new Error("媒体后台暂不可用，请重新启动应用"));
        }
        waiting.clear();
      });
      const devOrigin = process.env.ELECTRON_RENDERER_URL
        ? new URL(process.env.ELECTRON_RENDERER_URL).origin
        : "";
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback) =>
          callback(
            permission === "fullscreen" && contents === window?.webContents,
          ),
      );
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission) =>
          permission === "fullscreen" && contents === window?.webContents,
      );
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        const development =
          !!devOrigin &&
          (url.origin === devOrigin ||
            ((url.protocol === "ws:" || url.protocol === "wss:") &&
              url.hostname === new URL(devOrigin).hostname));
        callback({
          cancel:
            !development &&
            !["vexa:", "vexa-media:", "blob:", "data:", "devtools:"].includes(
              url.protocol,
            ),
        });
      });
      await registerProtocols();
      const downloadNetwork = new DownloadNetwork();
      xAuthentication = new XAuthentication(() => {
        if (
          downloads &&
          window &&
          !window.isDestroyed() &&
          !window.webContents.isDestroyed()
        )
          window?.webContents.send("downloads:changed", downloads.snapshot());
      }, app.getPath("userData"));
      await xAuthentication.init();
      downloads = new Downloads({
        dataDir: app.getPath("userData"),
        authentication: () => xAuthentication.state(),
        withCookies: (callback) =>
          xAuthentication.credentials.withCookies(callback),
        licensesDir: join(app.getAppPath(), "docs/licenses"),
        ffmpegPath: ffmpegPath ? unpacked(ffmpegPath) : null,
        ffprobePath: unpacked(ffprobe.path),
        fetch: (url, preferences, signal) =>
          downloadNetwork.fetch(url, preferences, signal),
        proxy: (preferences) => downloadNetwork.proxy(preferences),
        changed: (snapshot) =>
          window?.webContents.send("downloads:changed", snapshot),
        importFile: async (file) => {
          await rpc("scan", { paths: [file], recursive: false });
          const id = createHash("sha256")
            .update(process.platform === "win32" ? file.toLowerCase() : file)
            .digest("hex")
            .slice(0, 32);
          const deadline = Date.now() + 45000;
          while (!quitting && Date.now() < deadline) {
            const media = await rpc<MediaItem | null>("getMedia", id);
            if (media?.status === "ready") return;
            if (media?.status === "error" || media?.status === "missing") break;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          throw new Error("入库未完成");
        },
      });
      await downloads.init();
      registerIpc();
      await createWindow();
      app.on("activate", () => {
        if (window) {
          window.show();
          window.focus();
        } else void createWindow();
      });
    })
    .catch(() => {
      dialog.showErrorBox(
        "Vexa 启动失败",
        "无法初始化本地应用，请检查安装是否完整、数据目录是否可写。",
      );
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (!quitting && worker) {
      event.preventDefault();
      quitting = true;
      void Promise.allSettled([
        xAuthentication?.close(),
        downloads?.close(),
        Promise.race([rpc("close"), new Promise((r) => setTimeout(r, 5000))]),
      ]).finally(() => {
        void worker.terminate();
        app.quit();
      });
    }
  });
}
