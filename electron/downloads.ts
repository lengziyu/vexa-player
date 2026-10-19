import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  link,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  downloadError,
  parseXLink,
  validateDownloadPreferences,
  type DownloadPreferences,
  type DownloadPreview,
  type DownloadSnapshot,
  type DownloadTask,
  type DownloadVideo,
} from "../src/shared/downloads";

export const ENGINE_VERSION = "2026.08.19";
export const PROGRESS_TEMPLATE =
  'download:VEXA_PROGRESS:{"downloaded_bytes":%(progress.downloaded_bytes)j,"total_bytes":%(progress.total_bytes)j,"total_bytes_estimate":%(progress.total_bytes_estimate)j,"speed":%(progress.speed)j,"eta":%(progress.eta)j,"status":%(progress.status)j}';
export interface EngineAsset {
  name: string;
  size: number;
  sha256: string;
}
const windowsAsset: EngineAsset = {
  name: "yt-dlp.exe",
  size: 17840399,
  sha256: "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
};
const macAsset: EngineAsset = {
  name: "yt-dlp_macos",
  size: 37146048,
  sha256: "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202",
};
export const engineAsset =
  process.platform === "win32" && process.arch === "x64"
    ? windowsAsset
    : process.platform === "darwin"
      ? macAsset
      : null;

export interface RunRequest {
  executable: string;
  args: string[];
  signal: AbortSignal;
  timeout: number;
  line?: (line: string) => void;
  maxOutput?: number;
}
export type Runner = (request: RunRequest) => Promise<string>;
export class DownloadProcessError extends Error {
  readonly mediaUnavailable: boolean;
  constructor(raw: string) {
    super(downloadError(raw));
    this.name = "DownloadProcessError";
    this.mediaUnavailable = /No video|No formats|not contain any video/i.test(
      raw,
    );
  }
}
export const runDownloader: Runner = ({
  executable,
  args,
  signal,
  timeout,
  line,
  maxOutput = 8 * 1024 * 1024,
}) =>
  new Promise((accept, reject) => {
    if (signal.aborted) {
      reject(new Error("已取消"));
      return;
    }
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      pending = "",
      failure: Error | null = null,
      stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      if (process.platform === "win32" && child.pid) {
        const killer = spawn(
          join(
            process.env.SystemRoot || "C:\\Windows",
            "System32",
            "taskkill.exe",
          ),
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        killer.on("error", () => child.kill());
        killer.on("exit", (code) => {
          if (code !== 0) child.kill();
        });
      } else {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    };
    const timer = setTimeout(() => {
      failure = new Error("连接超时，请检查网络后重试");
      stop();
    }, timeout);
    signal.addEventListener("abort", stop, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      stdout = line ? (stdout + text).slice(-65536) : stdout + text;
      if (Buffer.byteLength(stdout) > maxOutput) {
        failure = new Error("下载组件返回内容过大");
        stop();
        return;
      }
      if (line) {
        pending += text;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || "";
        try {
          lines.forEach(line);
        } catch {
          failure = new Error("下载组件返回了无效信息");
          stop();
        }
      }
    });
    child.stderr.on("data", (text: string) => {
      stderr = (stderr + text).slice(-16000);
    });
    child.once("error", () => {
      failure = new Error("无法启动下载组件，请重新安装组件");
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(new Error("已取消"));
      else if (failure) reject(failure);
      else if (code !== 0) reject(new DownloadProcessError(stderr));
      else {
        try {
          if (pending && line) line(pending);
          accept(stdout);
        } catch {
          reject(new Error("下载组件返回了无效信息"));
        }
      }
    });
  });

interface Options {
  dataDir: string;
  ffmpegPath: string | null;
  ffprobePath: string;
  fetch(
    url: string,
    preferences: DownloadPreferences,
    signal: AbortSignal,
  ): Promise<Response>;
  proxy(preferences: DownloadPreferences): Promise<string>;
  importFile(file: string): Promise<void>;
  changed(snapshot: DownloadSnapshot): void;
  licensesDir?: string;
  runner?: Runner;
  asset?: EngineAsset;
  authentication?: () => DownloadSnapshot["authentication"];
  withCookies?: <T>(
    callback: (file: string | null) => Promise<T>,
  ) => Promise<T>;
}
interface RecordTask {
  task: DownloadTask;
  url: string;
  root: string;
  autoImport: boolean;
  signal: AbortController;
  api: "graphql" | "syndication";
}
interface PreviewRecord {
  preview: DownloadPreview;
  created: number;
  api: "graphql" | "syndication";
}
const active = (task: DownloadTask) =>
  ["queued", "downloading", "processing"].includes(task.status);
export function contained(root: string, file: string): boolean {
  const rel = relative(root, file);
  return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}
export function formatSelector(height: number): string {
  const bound = height ? `[height=${height}]` : "";
  return `b[ext=mp4][protocol=https]${bound}/b[ext=mp4]${bound}/bv*${bound}+ba/b${bound}`;
}
export function progressValues(raw: Record<string, unknown>): {
  progress: number | null;
  speed: number | null;
  eta: number | null;
} {
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  const downloaded = number(raw.downloaded_bytes),
    total = number(raw.total_bytes) || number(raw.total_bytes_estimate);
  return {
    progress:
      downloaded !== null && total
        ? Math.min(100, (100 * downloaded) / total)
        : null,
    speed: number(raw.speed),
    eta: number(raw.eta),
  };
}

export class Downloads {
  private asset: EngineAsset | null;
  private runner: Runner;
  private state: DownloadSnapshot;
  private records: RecordTask[] = [];
  private previews = new Map<string, PreviewRecord>();
  private parseController: AbortController | null = null;
  private installController: AbortController | null = null;
  private pumping = false;
  private closing = false;
  private lastEvent = 0;
  private busyImport = new Set<Promise<void>>();
  private pumpingPromise: Promise<void> | null = null;
  private parsePromise: Promise<DownloadPreview> | null = null;
  private installPromise: Promise<void> | null = null;
  private enqueueChain: Promise<void> = Promise.resolve();
  private settingsChain: Promise<void> = Promise.resolve();
  constructor(private options: Options) {
    this.asset = options.asset ?? engineAsset;
    this.runner = options.runner ?? runDownloader;
    this.state = {
      engine: {
        status: this.asset ? "missing" : "unsupported",
        progress: null,
        error: null,
        version: ENGINE_VERSION,
        size: this.asset?.size ?? 0,
      },
      preferences: {
        directory: "",
        connection: "system",
        proxy: "",
        autoImport: true,
      },
      tasks: [],
      parsing: false,
      authentication: {
        connected: false,
        connecting: false,
        error: null,
        diagnostics: [],
      },
    };
  }
  get enginePath(): string {
    return join(
      this.options.dataDir,
      "download-engine",
      ENGINE_VERSION,
      this.asset?.name ?? "unsupported",
    );
  }
  get busy(): boolean {
    return (
      this.state.parsing ||
      !!this.installController ||
      this.records.some((r) => active(r.task) || r.task.importing)
    );
  }
  snapshot(): DownloadSnapshot {
    return structuredClone({
      ...this.state,
      tasks: this.records.map((record) => record.task),
      authentication:
        this.options.authentication?.() ?? this.state.authentication,
    });
  }
  private emit(force = true): void {
    if (!force && Date.now() - this.lastEvent < 250) return;
    this.lastEvent = Date.now();
    this.options.changed(this.snapshot());
  }
  async init(): Promise<void> {
    try {
      const stored = JSON.parse(
        await readFile(join(this.options.dataDir, "downloads.json"), "utf8"),
      );
      const preferences = validateDownloadPreferences({
        connection: stored.connection,
        proxy: stored.proxy,
        autoImport: stored.autoImport,
      });
      this.state.preferences = {
        ...preferences,
        directory:
          typeof stored.directory === "string" && isAbsolute(stored.directory)
            ? stored.directory
            : "",
      };
    } catch {}
    if (this.asset && (await this.validEngine(this.enginePath)))
      this.state.engine.status = "ready";
  }
  private async validEngine(file: string): Promise<boolean> {
    try {
      const info = await lstat(file);
      if (
        !this.asset ||
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.size !== this.asset.size
      )
        return false;
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      return hash.digest("hex") === this.asset.sha256;
    } catch {
      return false;
    }
  }
  private async save(preferences: DownloadPreferences): Promise<void> {
    const file = join(this.options.dataDir, "downloads.json");
    this.settingsChain = this.settingsChain
      .catch(() => {})
      .then(async () => {
        await writeFile(`${file}.tmp`, JSON.stringify(preferences));
        await rename(`${file}.tmp`, file);
        this.state.preferences = preferences;
        this.emit();
      });
    await this.settingsChain;
  }
  async configure(input: unknown): Promise<void> {
    if (this.busy) throw new Error("请等待当前任务结束，再修改下载设置");
    await this.save({
      ...this.state.preferences,
      ...validateDownloadPreferences(input),
    });
  }
  async setDirectory(directory: string): Promise<void> {
    if (this.busy) throw new Error("请等待当前任务结束，再修改保存位置");
    const actual = await realpath(directory);
    if (!(await stat(actual)).isDirectory())
      throw new Error("请选择保存文件夹");
    await this.save({ ...this.state.preferences, directory: actual });
  }
  install(): Promise<void> {
    if (this.installPromise) return this.installPromise;
    if (!this.asset)
      return Promise.reject(new Error("当前系统或架构暂不支持下载组件"));
    if (this.busy) return Promise.reject(new Error("请等待当前任务结束"));
    this.installController = new AbortController();
    this.state.engine = {
      ...this.state.engine,
      status: "installing",
      progress: 0,
      error: null,
    };
    this.emit();
    this.installPromise = this.performInstall(
      this.installController.signal,
    ).finally(() => {
      this.installController = null;
      this.installPromise = null;
      this.emit();
    });
    return this.installPromise;
  }
  private async performInstall(signal: AbortSignal): Promise<void> {
    const temporary = `${this.enginePath}.download`;
    try {
      await mkdir(dirname(this.enginePath), { recursive: true });
      const response = await this.options.fetch(
        `https://github.com/yt-dlp/yt-dlp/releases/download/${ENGINE_VERSION}/${this.asset!.name}`,
        this.state.preferences,
        signal,
      );
      if (!response.ok || !response.body)
        throw new Error("组件下载失败，请检查网络或代理，也可手动导入官方组件");
      let received = 0;
      await pipeline(
        Readable.fromWeb(
          response.body as import("node:stream/web").ReadableStream,
        ),
        new Transform({
          transform: (chunk, _encoding, callback) => {
            received += chunk.length;
            if (received > this.asset!.size) {
              callback(new Error("组件大小不匹配，已停止安装"));
              return;
            }
            this.state.engine.progress = (100 * received) / this.asset!.size;
            this.emit(false);
            callback(null, chunk);
          },
        }),
        createWriteStream(temporary, { flags: "w" }),
        { signal },
      );
      await this.activateEngine(temporary);
    } catch (error) {
      this.state.engine.status = (await this.validEngine(this.enginePath))
        ? "ready"
        : "error";
      this.state.engine.error =
        error instanceof Error && /组件|校验/.test(error.message)
          ? error.message
          : "组件安装失败，请检查网络或代理后重试";
      throw new Error(this.state.engine.error);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }
  private async activateEngine(file: string): Promise<void> {
    if (!(await this.validEngine(file)))
      throw new Error("组件校验失败，请使用指定版本的官方组件");
    if (this.options.licensesDir) {
      for (const name of [
        "yt-dlp-LICENSE",
        "yt-dlp-THIRD_PARTY_LICENSES.txt",
        "GPL-3.0.txt",
      ]) {
        await writeFile(
          join(dirname(this.enginePath), name),
          await readFile(join(this.options.licensesDir, name)),
        );
      }
    }
    if (process.platform !== "win32") await chmod(file, 0o700);
    await rename(file, this.enginePath);
    this.state.engine = {
      ...this.state.engine,
      status: "ready",
      progress: 100,
      error: null,
    };
  }
  async importEngine(file: string): Promise<void> {
    if (this.busy) throw new Error("请等待当前任务结束");
    if (!this.asset || !(await this.validEngine(file)))
      throw new Error(
        `组件校验失败，请选择官方 ${ENGINE_VERSION} 的 ${this.asset?.name ?? "对应组件"}`,
      );
    await mkdir(dirname(this.enginePath), { recursive: true });
    const temporary = `${this.enginePath}.import`;
    try {
      await copyFile(file, temporary);
      await this.activateEngine(temporary);
      this.emit();
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }
  private ensureEngine(): void {
    if (this.closing) throw new Error("应用正在退出");
    if (this.state.engine.status !== "ready")
      throw new Error("请先安装下载组件");
  }
  private async args(signal: AbortSignal): Promise<string[]> {
    if (!(await this.validEngine(this.enginePath))) {
      this.state.engine.status = "error";
      this.state.engine.error = "下载组件已丢失或损坏，请重新安装组件";
      this.emit();
      throw new Error(this.state.engine.error);
    }
    const proxy = await this.options.proxy(this.state.preferences);
    if (signal.aborted) throw new Error("已取消");
    return [
      "--ignore-config",
      "--no-plugin-dirs",
      "--no-cache-dir",
      "--no-update",
      "--no-colors",
      "--no-exec",
      "--output-na-placeholder",
      "null",
      "--socket-timeout",
      "20",
      "--retries",
      "2",
      "--fragment-retries",
      "2",
      "--use-extractors",
      "twitter.*",
      "--proxy",
      proxy,
    ];
  }
  parse(input: unknown): Promise<DownloadPreview> {
    const link = parseXLink(input);
    this.ensureEngine();
    if (this.state.parsing)
      return Promise.reject(new Error("正在解析，请稍候"));
    this.state.parsing = true;
    this.parseController = new AbortController();
    this.emit();
    this.parsePromise = this.performParse(
      link,
      this.parseController.signal,
    ).finally(() => {
      this.state.parsing = false;
      this.parseController = null;
      this.parsePromise = null;
      this.emit();
    });
    return this.parsePromise;
  }
  private async performParse(
    link: ReturnType<typeof parseXLink>,
    signal: AbortSignal,
  ): Promise<DownloadPreview> {
    const args = await this.args(signal);
    const { stdout, api } = await this.parseMetadata(link.url, args, signal);
    let info: Record<string, unknown>;
    try {
      info = JSON.parse(stdout);
    } catch {
      throw new Error("视频信息读取失败，请重试");
    }
    const entries = (Array.isArray(info.entries) ? info.entries : [info]).slice(
      0,
      4,
    ) as Record<string, unknown>[];
    const videos: DownloadVideo[] = [];
    for (const [index, entry] of entries.entries()) {
      if (
        !entry ||
        !/^\d{1,25}$/.test(String(entry.id)) ||
        !Array.isArray(entry.formats) ||
        !entry.formats.length ||
        entry.is_live ||
        entry.live_status === "is_upcoming"
      )
        continue;
      const formats = entry.formats as Record<string, unknown>[];
      const qualities = [
        ...new Set(
          formats
            .filter(
              (f) =>
                f.vcodec !== "none" &&
                typeof f.height === "number" &&
                Number.isFinite(f.height) &&
                f.height > 0 &&
                f.height <= 16384,
            )
            .map((f) => Number(f.height)),
        ),
      ].sort((a, b) => b - a);
      if (!qualities.length && !formats.some((f) => f.vcodec !== "none"))
        continue;
      videos.push({
        id: String(entry.id),
        index: index + 1,
        title: String(entry.title || "X 视频").slice(0, 250),
        author: String(entry.uploader || entry.uploader_id || "X").slice(
          0,
          100,
        ),
        duration:
          typeof entry.duration === "number" &&
          Number.isFinite(entry.duration) &&
          entry.duration >= 0
            ? entry.duration
            : null,
        thumbnail: await this.thumbnail(entry.thumbnail, signal),
        qualities,
      });
    }
    if (!videos.length)
      throw new Error(
        "未找到支持的视频轨道；可能访问受限，暂不支持直播、语音或外站视频",
      );
    const preview: DownloadPreview = {
      id: randomUUID(),
      url: link.url,
      selectedIndex: link.index,
      videos,
    };
    for (const [id, record] of this.previews)
      if (
        Date.now() - record.created > 15 * 60 * 1000 ||
        this.previews.size >= 8
      )
        this.previews.delete(id);
    this.previews.set(preview.id, { preview, created: Date.now(), api });
    return structuredClone(preview);
  }
  private async runWithCookies(request: RunRequest): Promise<string> {
    if (!this.options.withCookies) return this.runner(request);
    return this.options.withCookies((file) =>
      this.runner(
        file
          ? { ...request, args: ["--cookies", file, ...request.args] }
          : request,
      ),
    );
  }
  private async parseMetadata(
    url: string,
    args: string[],
    signal: AbortSignal,
  ): Promise<{ stdout: string; api: "graphql" | "syndication" }> {
    for (const api of ["graphql", "syndication"] as const) {
      try {
        const stdout = await this.runWithCookies({
          executable: this.enginePath,
          args: [
            ...args,
            "--extractor-args",
            `twitter:api=${api}`,
            "--dump-single-json",
            "--skip-download",
            "--playlist-end",
            "4",
            "--",
            url,
          ],
          signal,
          timeout: api === "graphql" ? 90000 : 45000,
        });
        return { stdout, api };
      } catch (error) {
        if (
          signal.aborted ||
          !(error instanceof DownloadProcessError) ||
          !error.mediaUnavailable ||
          api === "syndication"
        )
          throw error;
      }
    }
    throw new Error("未能获取视频信息，请连接 X 登录后重试");
  }
  private async thumbnail(
    input: unknown,
    signal: AbortSignal,
  ): Promise<string | null> {
    if (typeof input !== "string") return null;
    try {
      const url = new URL(input);
      if (
        url.protocol !== "https:" ||
        !["pbs.twimg.com", "video.twimg.com"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.port
      )
        return null;
      if (url.hostname === "pbs.twimg.com")
        url.searchParams.set("name", "small");
      const response = await this.options.fetch(
        url.href,
        this.state.preferences,
        signal,
      );
      const mime = response.headers.get("content-type")?.split(";")[0];
      if (
        !response.ok ||
        !response.body ||
        !["image/jpeg", "image/png", "image/webp"].includes(mime || "")
      )
        return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 256000) {
            await reader.cancel();
            return null;
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
    } catch {
      return null;
    }
  }
  enqueue(input: unknown): Promise<void> {
    const request = this.enqueueChain
      .catch(() => {})
      .then(() => this.performEnqueue(input));
    this.enqueueChain = request;
    return request;
  }
  private async performEnqueue(input: unknown): Promise<void> {
    this.ensureEngine();
    const value = input as { previewId?: unknown; selections?: unknown };
    const record =
      value && typeof value.previewId === "string"
        ? this.previews.get(value.previewId)
        : undefined;
    if (!record || Date.now() - record.created > 15 * 60 * 1000)
      throw new Error("解析结果已过期，请重新解析链接");
    if (
      !Array.isArray(value.selections) ||
      !value.selections.length ||
      value.selections.length > 4
    )
      throw new Error("请选择要下载的视频");
    if (this.records.length + value.selections.length > 50)
      throw new Error("任务列表已满，请先清除已结束记录");
    if (!this.state.preferences.directory)
      throw new Error("请先选择保存文件夹");
    const root = await realpath(this.state.preferences.directory);
    const chosen = new Set<string>();
    const selections = value.selections.map(
      (selection: { id?: unknown; quality?: unknown }) => {
        const video = record.preview.videos.find((v) => v.id === selection?.id);
        const quality = selection?.quality;
        if (
          !video ||
          chosen.has(video.id) ||
          typeof quality !== "number" ||
          (quality !== 0 && !video.qualities.includes(quality))
        )
          throw new Error("视频或清晰度无效，请重新解析");
        chosen.add(video.id);
        return { video, quality };
      },
    );
    for (const { video, quality } of selections) {
      const duplicate = this.records.find(
        (r) =>
          r.url === record.preview.url &&
          r.task.video.id === video.id &&
          r.task.quality === quality &&
          (active(r.task) || r.task.status === "complete"),
      );
      if (duplicate) {
        if (
          duplicate.task.status !== "complete" ||
          (duplicate.task.file &&
            (await stat(duplicate.task.file).catch(() => null)))
        )
          throw new Error("列表中已有该视频和画质，请查看现有任务");
      }
    }
    for (const { video, quality } of selections)
      this.records.push({
        task: {
          id: randomUUID(),
          video: structuredClone(video),
          quality,
          status: "queued",
          progress: null,
          speed: null,
          eta: null,
          error: null,
          file: null,
          imported: false,
          importing: false,
          importError: null,
        },
        url: record.preview.url,
        root,
        autoImport: this.state.preferences.autoImport,
        signal: new AbortController(),
        api: record.api,
      });
    this.emit();
    this.pump();
  }
  private pump(): void {
    if (this.pumping || this.closing) return;
    this.pumping = true;
    this.pumpingPromise = (async () => {
      try {
        for (;;) {
          const record = this.records.find((r) => r.task.status === "queued");
          if (!record || this.closing) break;
          await this.download(record);
        }
      } finally {
        this.pumping = false;
        this.pumpingPromise = null;
        this.emit();
      }
    })();
  }
  private async download(record: RecordTask): Promise<void> {
    const { task, signal } = record;
    let stage: string | null = null;
    task.status = "downloading";
    this.emit();
    try {
      this.ensureEngine();
      const root = await realpath(record.root);
      if (root !== record.root)
        throw new Error("保存文件夹已变化，请重新选择目录");
      const stageRoot = join(root, ".vexa-downloads");
      await mkdir(stageRoot, { recursive: true });
      if ((await realpath(stageRoot)) !== stageRoot)
        throw new Error("下载临时目录异常，请更换保存位置");
      stage = join(stageRoot, task.id);
      await mkdir(stage);
      const postId = parseXLink(record.url).postId;
      let resultFile: string | null = null;
      const args = await this.args(signal.signal);
      await this.runWithCookies({
        executable: this.enginePath,
        args: [
          ...args,
          "--extractor-args",
          `twitter:api=${record.api}`,
          "--newline",
          "--progress",
          "--progress-delta",
          "0.25",
          "--progress-template",
          PROGRESS_TEMPLATE,
          "--progress-template",
          "postprocess:VEXA_PROCESSING",
          "--print",
          "after_move:VEXA_FILE:%(filepath)j",
          "--no-simulate",
          "--no-overwrites",
          "--windows-filenames",
          "--downloader",
          "m3u8:native",
          ...(this.options.ffmpegPath
            ? ["--ffmpeg-location", this.options.ffmpegPath]
            : []),
          "--format",
          formatSelector(task.quality || task.video.qualities[0] || 0),
          "--merge-output-format",
          "mp4/mkv",
          "--output",
          join(
            stage,
            `${postId}_${task.video.id}_${task.quality || "best"}.%(ext)s`,
          ),
          "--",
          `${record.url}/video/${task.video.index}`,
        ],
        signal: signal.signal,
        timeout: 2 * 60 * 60 * 1000,
        line: (line) => {
          if (signal.signal.aborted) return;
          if (line.startsWith("VEXA_PROGRESS:")) {
            const progress = JSON.parse(line.slice(14));
            Object.assign(task, progressValues(progress));
            if (progress.status === "finished") task.status = "processing";
            this.emit(false);
          } else if (line.startsWith("VEXA_PROCESSING")) {
            task.status = "processing";
            this.emit();
          } else if (line.startsWith("VEXA_FILE:"))
            resultFile = JSON.parse(line.slice(10));
        },
      });
      if (signal.signal.aborted) throw new Error("已取消");
      if (!resultFile || !contained(stage, resultFile))
        throw new Error("下载组件未返回有效文件");
      const file = await realpath(resultFile);
      if (
        !contained(stage, file) ||
        (await lstat(resultFile)).isSymbolicLink() ||
        ![".mp4", ".mkv", ".webm", ".mov"].includes(
          extname(file).toLowerCase(),
        ) ||
        !(await stat(file)).size
      )
        throw new Error("下载文件校验失败");
      const metadata = JSON.parse(
        await this.runner({
          executable: this.options.ffprobePath,
          args: [
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_streams",
            "-of",
            "json",
            file,
          ],
          signal: signal.signal,
          timeout: 20000,
          maxOutput: 1024 * 1024,
        }),
      );
      if (
        !Array.isArray(metadata.streams) ||
        !metadata.streams.some(
          (stream: Record<string, unknown>) => stream.codec_type === "video",
        )
      )
        throw new Error("下载文件没有可读取的视频轨道");
      if (signal.signal.aborted) throw new Error("已取消");
      let destination = join(root, basename(file));
      try {
        await link(file, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        destination = join(
          root,
          `${basename(file, extname(file))}_${task.id.slice(0, 8)}${extname(file)}`,
        );
        await link(file, destination);
      }
      if (signal.signal.aborted) {
        await unlink(destination);
        throw new Error("已取消");
      }
      task.file = destination;
      task.status = "complete";
      task.progress = 100;
      task.speed = null;
      task.eta = null;
      this.emit();
      if (record.autoImport && !this.closing) await this.importFile(task.id);
    } catch (error) {
      if (!task.file) {
        task.status = signal.signal.aborted ? "cancelled" : "failed";
        task.speed = null;
        task.eta = null;
        const message =
          error instanceof Error ? error.message : "下载失败，请重试";
        task.error = signal.signal.aborted
          ? null
          : /ENOSPC|EACCES|EPERM/.test(message)
            ? downloadError(message)
            : message;
      }
    } finally {
      if (stage && contained(join(record.root, ".vexa-downloads"), stage))
        await rm(stage, { recursive: true, force: true }).catch(() => {});
      this.emit();
    }
  }
  private find(id: unknown): RecordTask {
    const record =
      typeof id === "string"
        ? this.records.find((r) => r.task.id === id)
        : undefined;
    if (!record) throw new Error("下载任务不存在");
    return record;
  }
  cancel(id: unknown): void {
    const record = this.find(id);
    if (active(record.task)) {
      record.signal.abort();
      if (record.task.status === "queued") record.task.status = "cancelled";
      this.emit();
    }
  }
  retry(id: unknown): void {
    this.ensureEngine();
    const record = this.find(id);
    if (!["failed", "cancelled"].includes(record.task.status))
      throw new Error("该任务不能重试");
    if (
      this.records.some(
        (r) =>
          r !== record &&
          r.url === record.url &&
          r.task.video.id === record.task.video.id &&
          r.task.quality === record.task.quality &&
          (active(r.task) || r.task.status === "complete"),
      )
    )
      throw new Error("已有相同视频的任务，请查看现有记录");
    record.signal = new AbortController();
    Object.assign(record.task, {
      status: "queued",
      error: null,
      progress: null,
      speed: null,
      eta: null,
    });
    this.emit();
    this.pump();
  }
  async completedFile(id: unknown): Promise<string> {
    const record = this.find(id),
      file = record.task.file;
    if (
      record.task.status !== "complete" ||
      !file ||
      !contained(record.root, file) ||
      (await realpath(file)) !== file ||
      !(await stat(file)).isFile()
    )
      throw new Error("下载文件不存在或已移动");
    return file;
  }
  async importFile(id: unknown): Promise<void> {
    const record = this.find(id);
    if (record.task.importing || record.task.imported) return;
    record.task.importing = true;
    record.task.importError = null;
    this.emit();
    const job = (async () => {
      try {
        await this.options.importFile(await this.completedFile(id));
        record.task.imported = true;
      } catch {
        record.task.importError =
          "视频已下载，入库暂未完成；请等待扫描结束后点击重试入库";
      } finally {
        record.task.importing = false;
        this.emit();
      }
    })();
    this.busyImport.add(job);
    try {
      await job;
    } finally {
      this.busyImport.delete(job);
    }
  }
  clearFinished(): void {
    this.records = this.records.filter(
      (r) => active(r.task) || r.task.importing,
    );
    this.emit();
  }
  async close(): Promise<void> {
    this.closing = true;
    this.installController?.abort();
    this.parseController?.abort();
    for (const record of this.records)
      if (active(record.task)) this.cancel(record.task.id);
    await Promise.allSettled([
      this.pumpingPromise,
      this.parsePromise,
      this.installPromise,
      this.settingsChain,
      this.enqueueChain,
      ...this.busyImport,
    ]);
  }
}
