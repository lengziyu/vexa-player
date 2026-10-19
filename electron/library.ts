import initSqlJs, { type Database, type SqlValue } from "sql.js";
import {
  readFile,
  writeFile,
  rename,
  mkdir,
  readdir,
  stat,
  realpath,
  unlink,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, extname, basename } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  validateLibraryQuery,
  resolutionBounds,
} from "../src/shared/library-query";
import type {
  LibraryPage,
  LibraryQuery,
  LibraryRoot,
  MediaItem,
  ScanProgress,
  ScanRequest,
} from "../src/shared/contracts";

export const extensions = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".webm",
  ".m4v",
  ".mpg",
  ".mpeg",
  ".ts",
  ".m2ts",
  ".flv",
  ".ogv",
]);
interface LibraryOptions {
  dataDir: string;
  wasmPath: string;
  ffmpegPath: string | null;
  ffprobePath: string;
  cacheEnabled: boolean;
}
type Row = Record<string, SqlValue>;
export class Library {
  private db!: Database;
  private task: ScanProgress | null = null;
  private running = false;
  private children = new Set<ChildProcess>();
  private thumbnailChildren = new Set<ChildProcess>();
  private lastEvent = 0;
  private cacheEpoch = 0;
  private writeChain: Promise<void> = Promise.resolve();
  constructor(
    private options: LibraryOptions,
    private emit: (progress: ScanProgress) => void,
  ) {}
  async init(): Promise<void> {
    await mkdir(this.options.dataDir, { recursive: true });
    await mkdir(this.cacheDir, { recursive: true });
    const SQL = await initSqlJs({
      wasmBinary: new Uint8Array(await readFile(this.options.wasmPath)).buffer,
    });
    let bytes: Buffer | undefined;
    try {
      bytes = await readFile(this.dbPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.db.run(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS roots(id TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL,recursive INTEGER NOT NULL,available INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,path TEXT UNIQUE NOT NULL,name TEXT NOT NULL,size REAL NOT NULL,mtime REAL NOT NULL,duration REAL,width INTEGER,height INTEGER,fps REAL,codec TEXT,audioCodec TEXT,status TEXT NOT NULL,thumbnail INTEGER NOT NULL DEFAULT 0,favorite INTEGER NOT NULL DEFAULT 0,error TEXT);
      CREATE TABLE IF NOT EXISTS media_roots(media_id TEXT REFERENCES media(id) ON DELETE CASCADE,root_id TEXT REFERENCES roots(id) ON DELETE CASCADE,PRIMARY KEY(media_id,root_id));
      CREATE INDEX IF NOT EXISTS idx_media_name ON media(name); CREATE INDEX IF NOT EXISTS idx_media_roots_root ON media_roots(root_id);
      PRAGMA user_version=1;`);
    await this.persist();
  }
  private get cacheDir(): string {
    return join(this.options.dataDir, "thumbnails");
  }
  private get dbPath(): string {
    return join(this.options.dataDir, "library.sqlite");
  }
  private rows(sql: string, params: SqlValue[] = []): Row[] {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params);
      const rows: Row[] = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }
  private id(path: string): string {
    return createHash("sha256")
      .update(process.platform === "win32" ? path.toLowerCase() : path)
      .digest("hex")
      .slice(0, 32);
  }
  private media(row: Row): MediaItem {
    return {
      ...row,
      size: Number(row.size),
      mtime: Number(row.mtime),
      favorite: !!row.favorite,
      thumbnail: !!row.thumbnail,
    } as unknown as MediaItem;
  }
  query(query: LibraryQuery = {}): LibraryPage {
    query = validateLibraryQuery(query);
    const conditions: string[] = [],
      params: SqlValue[] = [];
    if (query.search) {
      conditions.push("(name LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\')");
      const term = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
      params.push(term, term);
    }
    if (query.rootId) {
      conditions.push(
        "id IN (SELECT media_id FROM media_roots WHERE root_id=?)",
      );
      params.push(query.rootId);
    }
    if (query.favorites) conditions.push("favorite=1");
    if (query.minDuration !== undefined) {
      conditions.push("duration >= ?");
      params.push(query.minDuration);
    }
    if (query.maxDuration !== undefined) {
      conditions.push("duration <= ?");
      params.push(query.maxDuration);
    }
    if (query.status && query.status !== "all") {
      conditions.push("status=?");
      params.push(query.status);
    }
    if (query.orientation && query.orientation !== "all") {
      conditions.push("width > 0 AND height > 0");
      conditions.push(
        {
          landscape: "width > height",
          portrait: "width < height",
          square: "width = height",
        }[query.orientation],
      );
    }
    if (query.resolution && query.resolution !== "all") {
      const [min, max] = resolutionBounds[query.resolution]!;
      conditions.push("width > 0 AND height > 0 AND MIN(width,height) >= ?");
      params.push(min);
      if (max !== null) {
        conditions.push("MIN(width,height) <= ?");
        params.push(max);
      }
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const sort = ["name", "duration", "size", "width", "path"].includes(
      query.sort || "",
    )
      ? query.sort
      : "name";
    const direction = query.direction === "desc" ? "DESC" : "ASC";
    const total = Number(
      this.rows(`SELECT COUNT(*) AS count FROM media${where}`, params)[0]
        ?.count || 0,
    );
    const limit = Math.min(200, Math.max(1, Math.floor(query.limit || 100))),
      offset = Math.max(0, Math.floor(query.offset || 0));
    return {
      total,
      items: this.rows(
        `SELECT * FROM media${where} ORDER BY ${sort} COLLATE NOCASE ${direction},id ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ).map((r) => this.media(r)),
    };
  }
  roots(): LibraryRoot[] {
    return this.rows("SELECT * FROM roots ORDER BY path").map(
      (r) =>
        ({
          ...r,
          recursive: !!r.recursive,
          available: !!r.available,
        }) as unknown as LibraryRoot,
    );
  }
  getMedia(id: string): MediaItem | null {
    const row = this.rows("SELECT * FROM media WHERE id=?", [id])[0];
    return row ? this.media(row) : null;
  }
  async favorite(id: string, value: boolean): Promise<void> {
    this.db.run("UPDATE media SET favorite=? WHERE id=?", [Number(value), id]);
    await this.persist();
  }
  async removeRoot(id: string): Promise<void> {
    if (this.running) throw new Error("扫描期间请先取消任务");
    this.db.run("DELETE FROM roots WHERE id=?", [id]);
    await this.persist();
  }
  async persist(): Promise<void> {
    const bytes = this.db.export();
    this.db.run("PRAGMA foreign_keys=ON");
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        const temp = `${this.dbPath}.tmp`;
        await writeFile(temp, bytes);
        await rename(temp, this.dbPath);
      });
    return this.writeChain;
  }
  async cacheSize(): Promise<number> {
    let total = 0;
    for (const name of await readdir(this.cacheDir)) {
      const s = await stat(join(this.cacheDir, name)).catch(() => null);
      if (s?.isFile()) total += s.size;
    }
    return total;
  }
  private async stopThumbnails(): Promise<void> {
    this.cacheEpoch++;
    await Promise.all(
      [...this.thumbnailChildren].map(
        (child) =>
          new Promise<void>((resolve) => {
            child.once("close", () => resolve());
            child.kill();
            setTimeout(resolve, 1000);
          }),
      ),
    );
  }
  async clearCache(): Promise<void> {
    await this.stopThumbnails();
    for (const name of await readdir(this.cacheDir))
      await unlink(join(this.cacheDir, name)).catch(() => {});
    this.db.run("UPDATE media SET thumbnail=0");
    await this.persist();
    this.progress(true);
  }
  async configure(cacheEnabled: boolean): Promise<void> {
    this.options.cacheEnabled = cacheEnabled;
    if (!cacheEnabled) await this.stopThumbnails();
  }
  cancel(): void {
    if (this.task) this.task.cancelled = true;
    for (const child of this.children) child.kill();
  }
  private progress(force = false): void {
    if (this.task && (force || Date.now() - this.lastEvent > 150)) {
      this.lastEvent = Date.now();
      this.emit({ ...this.task });
    }
  }
  start(request: ScanRequest): string {
    if (this.running) throw new Error("已有扫描任务，请等待或取消");
    this.running = true;
    this.task = {
      id: randomUUID(),
      phase: "scan",
      discovered: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      cancelled: false,
    };
    this.progress(true);
    void this.performScan(request)
      .catch(() => {
        if (this.task) this.task.failed++;
      })
      .finally(async () => {
        try {
          await this.persist();
        } catch {
          if (this.task) this.task.failed++;
        }
        if (this.task) {
          this.task.phase = this.task.cancelled ? "cancelled" : "done";
          this.progress(true);
        }
        this.running = false;
      });
    return this.task.id;
  }
  refresh(): string {
    const roots = this.roots();
    return this.start({ paths: roots.map((r) => r.path), recursive: true });
  }
  private async run(
    binary: string,
    args: string[],
    timeout = 20000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, {
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.children.add(child);
      if (binary === this.options.ffmpegPath) this.thumbnailChildren.add(child);
      let output = "",
        settled = false;
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error("媒体处理超时"));
      }, timeout);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.children.delete(child);
        this.thumbnailChildren.delete(child);
        error ? reject(error) : resolve(output);
      };
      child.stdout?.on("data", (data: Buffer) => {
        if (output.length < 2_000_000) output += data.toString();
      });
      child.stderr?.resume();
      child.on("error", () => finish(new Error("无法启动媒体分析工具")));
      child.on("close", (code) =>
        finish(code === 0 ? undefined : new Error("媒体分析失败或已取消")),
      );
    });
  }
  private async performScan(request: ScanRequest): Promise<void> {
    const scanCacheEpoch = this.cacheEpoch;
    const pending = new Set<string>(),
      seenGlobal = new Set<string>();
    for (const input of request.paths) {
      if (this.task!.cancelled) break;
      let canonical: string, info: Awaited<ReturnType<typeof stat>>;
      try {
        canonical = await realpath(input);
        info = await stat(canonical);
      } catch {
        this.db.run("UPDATE roots SET available=0 WHERE path=?", [input]);
        this.task!.failed++;
        continue;
      }
      if (info.isDirectory()) {
        const rootId = this.id(canonical),
          old = this.roots().find((r) => r.id === rootId),
          recursive = old?.recursive ?? request.recursive;
        this.db.run(
          "INSERT INTO roots(id,path,recursive,available) VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET available=1",
          [rootId, canonical, Number(recursive)],
        );
        const seen = new Set<string>();
        let complete = true;
        const walk = async (dir: string): Promise<void> => {
          try {
            const directory = await import("node:fs/promises").then((fs) =>
              fs.opendir(dir),
            );
            for await (const entry of directory) {
              if (this.task!.cancelled) break;
              const file = join(dir, entry.name);
              if (entry.isDirectory()) {
                if (recursive && entry.name !== ".vexa-downloads") await walk(file);
              } else if (entry.isFile())
                await this.discover(file, rootId, seen, pending, seenGlobal);
              else this.task!.skipped++;
            }
          } catch {
            complete = false;
            this.task!.failed++;
          }
        };
        await walk(canonical);
        if (!this.task!.cancelled && complete) {
          for (const row of this.rows(
            "SELECT media_id FROM media_roots WHERE root_id=?",
            [rootId],
          ))
            if (!seen.has(String(row.media_id)))
              this.db.run("UPDATE media SET status='missing' WHERE id=?", [
                row.media_id!,
              ]);
        }
      } else if (info.isFile())
        await this.discover(canonical, null, new Set(), pending, seenGlobal);
      this.progress();
    }
    await this.persist();
    this.task!.phase = "probe";
    this.progress(true);
    const queue = [...pending];
    let cursor = 0;
    const consume = async (): Promise<void> => {
      while (cursor < queue.length && !this.task!.cancelled) {
        const id = queue[cursor++]!;
        await this.analyze(id, scanCacheEpoch);
        this.task!.completed++;
        this.progress();
        if (this.task!.completed % 20 === 0) await this.persist();
      }
    };
    await Promise.all([consume(), consume()]);
    await this.trimCache();
  }
  private async discover(
    file: string,
    rootId: string | null,
    seen: Set<string>,
    pending: Set<string>,
    global: Set<string>,
  ): Promise<void> {
    if (!extensions.has(extname(file).toLowerCase())) {
      this.task!.skipped++;
      return;
    }
    try {
      const canonical = await realpath(file),
        id = this.id(canonical);
      seen.add(id);
      if (rootId)
        this.db.run(
          "INSERT OR IGNORE INTO media_roots(media_id,root_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM media WHERE id=?)",
          [id, rootId, id],
        );
      if (global.has(id)) return;
      global.add(id);
      const info = await stat(canonical),
        old = this.getMedia(id),
        changed = !old || old.size !== info.size || old.mtime !== info.mtimeMs;
      this.task!.discovered++;
      if (changed) {
        this.db.run(
          `INSERT INTO media(id,path,name,size,mtime,status) VALUES(?,?,?,?,?,'pending') ON CONFLICT(id) DO UPDATE SET name=excluded.name,size=excluded.size,mtime=excluded.mtime,status='pending',thumbnail=0,error=NULL`,
          [id, canonical, basename(canonical), info.size, info.mtimeMs],
        );
        await unlink(join(this.cacheDir, `${id}.jpg`)).catch(() => {});
      } else if (old.status === "missing")
        this.db.run("UPDATE media SET status='ready' WHERE id=?", [id]);
      if (
        changed ||
        old?.status === "error" ||
        old?.status === "pending" ||
        (this.options.cacheEnabled && !old?.thumbnail)
      )
        pending.add(id);
      else this.task!.completed++;
      if (rootId)
        this.db.run(
          "INSERT OR IGNORE INTO media_roots(media_id,root_id) VALUES(?,?)",
          [id, rootId],
        );
      if (this.task!.discovered % 100 === 0) await this.persist();
      this.progress();
    } catch {
      this.task!.failed++;
    }
  }
  private async analyze(id: string, scanCacheEpoch: number): Promise<void> {
    const media = this.getMedia(id);
    if (!media) return;
    try {
      const text = await this.run(this.options.ffprobePath, [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        "-i",
        media.path,
      ]);
      const data = JSON.parse(text) as {
        format?: { duration?: string };
        streams?: Array<{
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
          duration?: string;
          avg_frame_rate?: string;
          tags?: { rotate?: string };
          side_data_list?: Array<{ rotation?: number }>;
        }>;
      };
      const video = data.streams?.find((s) => s.codec_type === "video"),
        audio = data.streams?.find((s) => s.codec_type === "audio");
      if (!video) throw new Error("文件没有可识别的视频轨道");
      const duration = Number(data.format?.duration || video.duration),
        rate = (video.avg_frame_rate || "0/1").split("/").map(Number),
        fps = rate[1] ? rate[0]! / rate[1] : 0;
      const rotation =
        Math.abs(
          Number(
            video.tags?.rotate ||
              video.side_data_list?.find((s) => s.rotation !== undefined)
                ?.rotation ||
              0,
          ),
        ) % 180;
      const width = rotation === 90 ? video.height : video.width,
        height = rotation === 90 ? video.width : video.height;
      this.db.run(
        "UPDATE media SET duration=?,width=?,height=?,fps=?,codec=?,audioCodec=?,status='ready',error=NULL WHERE id=?",
        [
          Number.isFinite(duration) ? duration : null,
          width || null,
          height || null,
          Number.isFinite(fps) ? fps : null,
          video.codec_name || null,
          audio?.codec_name || null,
          id,
        ],
      );
      if (
        this.options.cacheEnabled &&
        this.options.ffmpegPath &&
        !this.task!.cancelled &&
        scanCacheEpoch === this.cacheEpoch
      ) {
        const epoch = this.cacheEpoch,
          thumb = join(this.cacheDir, `${id}.jpg`),
          temp = join(this.cacheDir, `${id}.tmp.jpg`);
        try {
          await this.run(
            this.options.ffmpegPath,
            [
              "-nostdin",
              "-v",
              "error",
              "-ss",
              String(
                Number.isFinite(duration) ? Math.min(duration * 0.1, 30) : 0,
              ),
              "-protocol_whitelist",
              "file,pipe",
              "-i",
              media.path,
              "-frames:v",
              "1",
              "-vf",
              "scale=480:-2",
              "-an",
              "-threads",
              "1",
              "-y",
              temp,
            ],
            30000,
          );
          if (
            epoch === this.cacheEpoch &&
            this.options.cacheEnabled &&
            !this.task!.cancelled
          ) {
            await rename(temp, thumb);
            this.db.run("UPDATE media SET thumbnail=1 WHERE id=?", [id]);
          } else await unlink(temp).catch(() => {});
        } catch {
          await unlink(temp).catch(() => {});
        }
      }
    } catch (error) {
      if (!this.task!.cancelled) {
        this.db.run("UPDATE media SET status='error',error=? WHERE id=?", [
          (error as Error).message,
          id,
        ]);
        this.task!.failed++;
      }
    }
  }
  private async trimCache(): Promise<void> {
    const files: Array<{ name: string; size: number; mtime: number }> = [];
    for (const name of await readdir(this.cacheDir)) {
      const s = await stat(join(this.cacheDir, name)).catch(() => null);
      if (s?.isFile()) files.push({ name, size: s.size, mtime: s.mtimeMs });
    }
    let size = files.reduce((n, f) => n + f.size, 0);
    for (const file of files.sort((a, b) => a.mtime - b.mtime)) {
      if (size <= 2 * 1024 ** 3) break;
      await unlink(join(this.cacheDir, file.name)).catch(() => {});
      size -= file.size;
      this.db.run("UPDATE media SET thumbnail=0 WHERE id=?", [
        file.name.replace(".jpg", ""),
      ]);
    }
  }
  async close(): Promise<void> {
    this.cancel();
    const deadline = Date.now() + 3000;
    while (this.running && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    await this.persist();
  }
}
