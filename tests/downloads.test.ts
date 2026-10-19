import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  Downloads,
  contained,
  formatSelector,
  progressValues,
  runDownloader,
  DownloadProcessError,
  type RunRequest,
  type Runner,
} from "../electron/downloads";
import {
  downloadError,
  parseXLink,
  validateDownloadPreferences,
} from "../src/shared/downloads";

describe("X download input boundaries", () => {
  it("normalizes supported post links and preserves the selected video", () => {
    expect(
      parseXLink(" https://twitter.com/Test/status/12345/video/2?s=20 "),
    ).toEqual({
      url: "https://x.com/i/web/status/12345",
      postId: "12345",
      index: 2,
    });
    expect(parseXLink("https://mobile.x.com/i/web/status/12345").postId).toBe(
      "12345",
    );
  });
  it.each([
    "http://x.com/a/status/1",
    "file:///video.mp4",
    "https://x.com.evil.test/a/status/1",
    "https://x.com@evil.test/a/status/1",
    "https://a:x@x.com/a/status/1",
    "https://x.com:444/a/status/1",
    "https://x.com/user",
    "https://t.co/test",
    "https://x.com/a/status/1/video/999",
    "--exec calc.exe",
    null,
  ])("rejects unsupported URL %s", (input) => {
    expect(() => parseXLink(input)).toThrow();
  });
  it("validates proxy configuration and prevents arbitrary settings", () => {
    expect(
      validateDownloadPreferences({
        connection: "manual",
        proxy: "socks5://127.0.0.1:1080",
        autoImport: true,
      }).proxy,
    ).toBe("socks5://127.0.0.1:1080");
    for (const input of [
      { connection: "manual", proxy: "", autoImport: true },
      { connection: "manual", proxy: "http://a:b@127.0.0.1", autoImport: true },
      { connection: "manual", proxy: "file:///tmp", autoImport: true },
      { connection: "direct", proxy: "", autoImport: "yes" },
      {
        connection: "system",
        proxy: "",
        autoImport: true,
        directory: "C:\\private",
      },
    ])
      expect(() => validateDownloadPreferences(input)).toThrow();
  });
  it("handles unknown/estimated progress and removes signed URLs from errors", () => {
    expect(
      progressValues({
        downloaded_bytes: 50,
        total_bytes_estimate: 100,
        speed: 0,
        eta: 3,
      }),
    ).toEqual({ progress: 50, speed: 0, eta: 3 });
    expect(
      progressValues({
        downloaded_bytes: Infinity,
        total_bytes: 0,
        speed: "NA",
        eta: -1,
      }),
    ).toEqual({ progress: null, speed: null, eta: null });
    expect(
      downloadError(
        "HTTP Error 403 https://video.twimg.com/private?token=secret",
      ),
    ).not.toContain("secret");
    expect(downloadError("429 rate limit")).toContain("限制");
    expect(
      downloadError("No video could be found in this tweet"),
    ).not.toContain("没有可下载");
    expect(downloadError("No video could be found in this tweet")).toContain(
      "登录",
    );
  });
  it("requires the selected resolution for every format alternative without silent fallback", () => {
    expect(formatSelector(720)).toBe(
      "b[ext=mp4][protocol=https][height=720]/b[ext=mp4][height=720]/bv*[height=720]+ba/b[height=720]",
    );
    expect(contained(resolve("/root"), resolve("/root/../secret.mp4"))).toBe(
      false,
    );
  });
});

let folder: string, service: Downloads;
const engineBytes = Buffer.from("trusted test engine"),
  fixtureId = "1001";
const video = (id = fixtureId) => ({
  id,
  title: "测试视频",
  uploader: "Sample",
  duration: 5,
  formats: [
    { height: 720, vcodec: "h264" },
    { height: 360, vcodec: "h264" },
  ],
});
let executeDownload: (request: RunRequest) => Promise<string>;
let importFile = vi.fn(async (_file: string): Promise<void> => {});
let fetchComponent = vi.fn(
  async (): Promise<Response> => new Response(engineBytes),
);
const run: Runner = async (request) => {
  if (request.executable === "probe")
    return JSON.stringify({ streams: [{ codec_type: "video" }] });
  if (request.args.includes("--dump-single-json"))
    return JSON.stringify({ entries: [video(), video("1002")] });
  return executeDownload(request);
};
async function succeed(request: RunRequest): Promise<string> {
  const path = request.args[request.args.indexOf("--output") + 1]!.replace(
    "%(ext)s",
    "mp4",
  );
  await writeFile(path, "actual downloaded bytes");
  request.line?.(
    'VEXA_PROGRESS:{"downloaded_bytes":10,"total_bytes":10,"status":"finished"}',
  );
  request.line?.(`VEXA_FILE:${JSON.stringify(path)}`);
  return "";
}
async function until(predicate: () => boolean): Promise<void> {
  await vi.waitFor(() => expect(predicate()).toBe(true), {
    interval: 10,
    timeout: 3000,
  });
}
async function add(
  selections = [{ id: fixtureId, quality: 0 }],
): Promise<void> {
  const preview = await service.parse("https://x.com/user/status/12345");
  await service.enqueue({ previewId: preview.id, selections });
}
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "vexa-download-test-"));
  await mkdir(join(folder, "videos"));
  executeDownload = succeed;
  importFile = vi.fn(async (_file: string): Promise<void> => {});
  fetchComponent = vi.fn(async () => new Response(engineBytes));
  service = new Downloads({
    dataDir: folder,
    ffmpegPath: "ffmpeg",
    ffprobePath: "probe",
    runner: run,
    asset: {
      name: "engine",
      size: engineBytes.length,
      sha256: createHash("sha256").update(engineBytes).digest("hex"),
    },
    fetch: fetchComponent,
    proxy: async () => "",
    importFile,
    changed: () => {},
  });
  await service.init();
  await service.install();
  await service.setDirectory(join(folder, "videos"));
  await service.configure({
    connection: "direct",
    proxy: "",
    autoImport: false,
  });
});
afterEach(async () => {
  await service?.close();
  if (folder.startsWith(join(tmpdir(), "vexa-download-test-")))
    await rm(folder, { recursive: true, force: true });
});

describe("download task lifecycle", () => {
  it("tries the alternate X endpoint for ambiguous no-media responses and retains it for downloading", async () => {
    const original = (service as unknown as { runner: Runner }).runner;
    const calls: string[][] = [];
    (service as unknown as { runner: Runner }).runner = async (request) => {
      calls.push(request.args);
      if (
        request.args.includes("--dump-single-json") &&
        request.args.includes("twitter:api=graphql")
      )
        throw new DownloadProcessError("No video could be found in this tweet");
      return original(request);
    };
    await add();
    await until(() => service.snapshot().tasks[0]?.status === "complete");
    expect(
      calls.filter((args) => args.includes("--dump-single-json")),
    ).toHaveLength(2);
    expect(calls.find((args) => args.includes("--output"))).toContain(
      "twitter:api=syndication",
    );
  });
  it("does not repeatedly retry authentication failures or rate limits through alternate endpoints", async () => {
    const runner = vi.fn(async () => {
      throw new DownloadProcessError("HTTP Error 429 rate limit");
    });
    (service as unknown as { runner: Runner }).runner = runner;
    await expect(
      service.parse("https://x.com/user/status/12345"),
    ).rejects.toThrow("限制");
    expect(runner).toHaveBeenCalledTimes(1);
  });
  it("keeps login cookies scoped to engine calls and out of task snapshots", async () => {
    const options = (
      service as unknown as {
        options: {
          withCookies: <T>(
            callback: (file: string | null) => Promise<T>,
          ) => Promise<T>;
        };
      }
    ).options;
    options.withCookies = async (callback) =>
      callback("local-authorized-cookies.txt");
    const spy = vi.spyOn(service as unknown as { runner: Runner }, "runner");
    await add();
    await until(() => service.snapshot().tasks[0]?.status === "complete");
    expect(
      spy.mock.calls.find(([request]) =>
        request.args.includes("--dump-single-json"),
      )![0].args,
    ).toContain("--cookies");
    expect(
      spy.mock.calls.find(([request]) => request.executable === "probe")![0]
        .args,
    ).not.toContain("--cookies");
    expect(JSON.stringify(service.snapshot())).not.toContain(
      "local-authorized-cookies.txt",
    );
  });
  it("only activates a component with the trusted size and hash", async () => {
    expect(service.snapshot().engine.status).toBe("ready");
    const wrong = join(folder, "wrong-engine");
    await writeFile(wrong, "untrusted");
    await expect(service.importEngine(wrong)).rejects.toThrow("校验");
    expect(await readFile(service.enginePath)).toEqual(engineBytes);
  });
  it("rechecks the component before execution and offers reinstall when it is damaged", async () => {
    await writeFile(service.enginePath, Buffer.alloc(engineBytes.length, 0));
    await expect(
      service.parse("https://x.com/user/status/12345"),
    ).rejects.toThrow("重新安装");
    expect(service.snapshot().engine.status).toBe("error");
  });
  it("preserves the working engine when a replacement download fails its checksum", async () => {
    fetchComponent.mockResolvedValueOnce(
      new Response(Buffer.alloc(engineBytes.length, 42)),
    );
    await expect(service.install()).rejects.toThrow("校验");
    expect(service.snapshot().engine.status).toBe("ready");
    expect(await readFile(service.enginePath)).toEqual(engineBytes);
  });
  it("ignores external configuration, runs only the X extractor and uses argument arrays", async () => {
    const runner = vi.spyOn(service as unknown as { runner: Runner }, "runner");
    const preview = await service.parse(
      "https://x.com/user/status/12345/video/2?s=20",
    );
    expect(preview.videos.length).toBe(2);
    expect(preview.selectedIndex).toBe(2);
    const args = runner.mock.calls[0]![0].args;
    expect(args).toContain("--ignore-config");
    expect(args).toContain("--no-plugin-dirs");
    expect(args.at(-1)).toBe("https://x.com/i/web/status/12345");
  });
  it("downloads, checks and publishes a complete file before importing", async () => {
    await service.configure({
      connection: "direct",
      proxy: "",
      autoImport: true,
    });
    await add();
    await until(() => service.snapshot().tasks[0]?.imported === true);
    const task = service.snapshot().tasks[0]!;
    expect(task.status).toBe("complete");
    expect(await readFile(task.file!, "utf8")).toBe("actual downloaded bytes");
    expect(importFile).toHaveBeenCalledWith(task.file);
    expect(await readdir(join(folder, "videos", ".vexa-downloads"))).toEqual(
      [],
    );
  });
  it("keeps a successful download when indexing fails and retries indexing independently", async () => {
    await service.configure({
      connection: "direct",
      proxy: "",
      autoImport: true,
    });
    importFile.mockRejectedValueOnce(new Error("scan busy"));
    await add();
    await until(() => !!service.snapshot().tasks[0]?.importError);
    const task = service.snapshot().tasks[0]!;
    expect(task.status).toBe("complete");
    await service.importFile(task.id);
    expect(service.snapshot().tasks[0]!.imported).toBe(true);
    expect(importFile).toHaveBeenCalledTimes(2);
  });
  it("queues one active download, cancels its process and continues with the next", async () => {
    let first = true,
      running = 0,
      maximum = 0;
    executeDownload = async (request) => {
      running++;
      maximum = Math.max(maximum, running);
      try {
        if (first) {
          first = false;
          await new Promise<void>((_resolve, reject) => {
            request.signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          });
        }
        return await succeed(request);
      } finally {
        running--;
      }
    };
    await add([
      { id: fixtureId, quality: 0 },
      { id: "1002", quality: 360 },
    ]);
    await until(() => running === 1);
    service.cancel(service.snapshot().tasks[0]!.id);
    await until(() => service.snapshot().tasks[1]?.status === "complete");
    expect(service.snapshot().tasks[0]!.status).toBe("cancelled");
    expect(maximum).toBe(1);
  });
  it("serializes duplicate requests even when they arrive concurrently", async () => {
    const preview = await service.parse("https://x.com/user/status/12345");
    const input = {
      previewId: preview.id,
      selections: [{ id: fixtureId, quality: 0 }],
    };
    const result = await Promise.allSettled([
      service.enqueue(input),
      service.enqueue(input),
    ]);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(service.snapshot().tasks).toHaveLength(1);
  });
  it("rejects manipulated video IDs, qualities and preview tokens", async () => {
    const preview = await service.parse("https://x.com/user/status/12345");
    for (const input of [
      { previewId: "fake", selections: [{ id: fixtureId, quality: 0 }] },
      { previewId: preview.id, selections: [{ id: "../secret", quality: 0 }] },
      { previewId: preview.id, selections: [{ id: fixtureId, quality: 9999 }] },
      { previewId: preview.id, selections: [null] },
    ])
      await expect(service.enqueue(input)).rejects.toThrow();
    expect(service.snapshot().tasks).toHaveLength(0);
  });
  it("does not overwrite an existing file or delete files when records are cleared", async () => {
    const existing = join(folder, "videos", "12345_1001_best.mp4");
    await writeFile(existing, "keep me");
    await add();
    await until(() => service.snapshot().tasks[0]?.status === "complete");
    const saved = service.snapshot().tasks[0]!.file!;
    expect(saved).not.toBe(existing);
    expect(await readFile(existing, "utf8")).toBe("keep me");
    service.clearFinished();
    expect(service.snapshot().tasks).toHaveLength(0);
    expect(await readFile(saved, "utf8")).toBe("actual downloaded bytes");
  });
  it("rejects a downloader result outside its private temporary directory", async () => {
    const outside = join(folder, "outside.mp4");
    await writeFile(outside, "unrelated");
    executeDownload = async (request) => {
      request.line?.(`VEXA_FILE:${JSON.stringify(outside)}`);
      return "";
    };
    await add();
    await until(() => service.snapshot().tasks[0]?.status === "failed");
    expect(await readFile(outside, "utf8")).toBe("unrelated");
    expect(importFile).not.toHaveBeenCalled();
  });
  it("reports storage failures without marking the task complete or indexing partial files", async () => {
    executeDownload = async () => {
      throw new Error("ENOSPC: no space left on device, open private-path");
    };
    await add();
    await until(() => service.snapshot().tasks[0]?.status === "failed");
    const task = service.snapshot().tasks[0]!;
    expect(task.error).toContain("磁盘空间不足");
    expect(task.error).not.toContain("private-path");
    expect(task.file).toBeNull();
    expect(importFile).not.toHaveBeenCalled();
  });
  it("stops and cleans an active partial download on application exit", async () => {
    let started = false;
    executeDownload = async (request) => {
      const path = request.args[request.args.indexOf("--output") + 1]!.replace(
        "%(ext)s",
        "mp4.part",
      );
      await writeFile(path, "partial");
      started = true;
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
    };
    await add();
    await until(() => started);
    await service.close();
    expect(service.snapshot().tasks[0]!.status).toBe("cancelled");
    expect(await readdir(join(folder, "videos", ".vexa-downloads"))).toEqual(
      [],
    );
  });
  it("does not use the network until the user installs or parses", async () => {
    fetchComponent.mockClear();
    await service.init();
    service.snapshot();
    expect(fetchComponent).not.toHaveBeenCalled();
  });
  it("terminates the real child process tree when cancellation is requested", async () => {
    const heartbeat = join(folder, "heartbeat.txt");
    const controller = new AbortController();
    const childSource = `const fs=require('node:fs');setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'.'),40);`;
    const parentSource = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:'ignore',windowsHide:true});setInterval(()=>{},1000);`;
    const pending = runDownloader({
      executable: process.execPath,
      args: ["-e", parentSource],
      signal: controller.signal,
      timeout: 5000,
    });
    const rejected = expect(pending).rejects.toThrow("已取消");
    try {
      await vi.waitFor(
        async () =>
          expect((await readFile(heartbeat)).length).toBeGreaterThan(1),
        { timeout: 3000, interval: 30 },
      );
    } finally {
      controller.abort();
    }
    await rejected;
    const size = (await readFile(heartbeat)).length;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await readFile(heartbeat)).length).toBe(size);
  });
});
