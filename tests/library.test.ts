import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import ffmpeg from "ffmpeg-static";
import ffprobe from "@ffprobe-installer/ffprobe";
import { Library } from "../electron/library";
import type { ScanProgress } from "../src/shared/contracts";
let folder: string, source: string, library: Library;
let events: ScanProgress[] = [];
async function scan(paths: string[], recursive = true): Promise<ScanProgress> {
  events = [];
  library.start({ paths, recursive });
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    const last = events.at(-1);
    if (last && ["done", "cancelled"].includes(last.phase)) return last;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("scan timed out");
}
function createLibrary(cacheEnabled = true): Library {
  return new Library(
    {
      dataDir: join(folder, "data"),
      wasmPath: resolve("node_modules/sql.js/dist/sql-wasm.wasm"),
      ffmpegPath: ffmpeg,
      ffprobePath: ffprobe.path,
      cacheEnabled,
    },
    (p) => events.push(p),
  );
}
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "vexa-test-"));
  source = join(folder, "视频 with spaces");
  await mkdir(join(source, "nested"), { recursive: true });
  const result = spawnSync(
    ffmpeg!,
    [
      "-nostdin",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=purple:s=320x180:r=24",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      join(source, "one.mp4"),
    ],
    { windowsHide: true, timeout: 15000 },
  );
  if (result.status !== 0)
    throw new Error("Unable to create real video fixture");
  await writeFile(
    join(source, "nested", "two.mp4"),
    await readFile(join(source, "one.mp4")),
  );
  await writeFile(join(source, "broken.mp4"), "not a video");
  await writeFile(join(source, "notes.txt"), "not media");
  library = createLibrary();
  await library.init();
});
afterAll(async () => {
  await library?.close();
  const absolute = resolve(folder),
    prefix = resolve(tmpdir()) + "\\";
  if (process.platform === "win32" && !absolute.startsWith(prefix))
    throw new Error("Unsafe cleanup path");
  if (!absolute.includes("vexa-test-")) throw new Error("Unsafe cleanup path");
  await rm(absolute, { recursive: true, force: true });
});
describe("real library pipeline", () => {
  it("scans real nested videos, generates thumbnails and isolates corrupt files", async () => {
    const progress = await scan([source]);
    expect(progress.discovered).toBe(3);
    expect(progress.failed).toBe(1);
    const page = library.query();
    expect(page.total).toBe(3);
    const video = page.items.find((m) => m.name === "one.mp4")!;
    expect(video.duration).toBeGreaterThan(0);
    expect(video.width).toBe(320);
    expect(video.codec).toBe("h264");
    expect(video.thumbnail).toBe(true);
    expect(page.items.find((m) => m.name === "broken.mp4")?.status).toBe(
      "error",
    );
    expect(library.roots()).toHaveLength(1);
  });
  it("deduplicates overlapping folders, supports literal search, favorite and SQLite persistence", async () => {
    await scan([source, join(source, "nested")]);
    expect(library.query().total).toBe(3);
    const media = library.query({ search: "one" }).items[0]!;
    await library.favorite(media.id, true);
    expect(library.query({ favorites: true }).total).toBe(1);
    expect(library.query({ search: "%" }).total).toBe(0);
    await library.close();
    const bytes = await readFile(join(folder, "data", "library.sqlite"));
    expect(bytes.subarray(0, 15).toString()).toBe("SQLite format 3");
    library = createLibrary();
    await library.init();
    expect(library.query({ favorites: true }).items[0]?.id).toBe(media.id);
  });
  it("combines real metadata filters and excludes unknown values", () => {
    expect(
      library.query({
        resolution: "sd",
        orientation: "landscape",
        status: "ready",
        minDuration: 0.5,
        maxDuration: 2,
      }).total,
    ).toBe(2);
    expect(library.query({ status: "error" }).total).toBe(1);
    expect(library.query({ status: "error", resolution: "sd" }).total).toBe(0);
    expect(
      library.query({
        favorites: true,
        resolution: "sd",
        orientation: "landscape",
        status: "ready",
      }).total,
    ).toBe(1);
    expect(library.query({ orientation: "portrait" }).total).toBe(0);
    expect(library.query({ minDuration: 10 }).total).toBe(0);
  });
  it("marks missing files after a complete refresh and preserves index records", async () => {
    await unlink(join(source, "nested", "two.mp4"));
    await scan([source]);
    expect(library.query().total).toBe(3);
    expect(
      library.query().items.find((m) => m.name === "two.mp4")?.status,
    ).toBe("missing");
  });
  it("clears generated cache and does not regenerate while disabled", async () => {
    expect(await library.cacheSize()).toBeGreaterThan(0);
    await library.configure(false);
    await library.clearCache();
    expect(await library.cacheSize()).toBe(0);
    expect(library.query().items.every((m) => !m.thumbnail)).toBe(true);
    await scan([source]);
    expect(await library.cacheSize()).toBe(0);
  });
  it("cancels scanning without discarding already indexed media", async () => {
    events = [];
    library.start({ paths: [source], recursive: true });
    library.cancel();
    const deadline = Date.now() + 5000;
    while (events.at(-1)?.phase !== "cancelled" && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
    expect(events.at(-1)?.phase).toBe("cancelled");
    expect(library.query().total).toBe(3);
  });
  it("does not fetch network segments hidden inside a local media file", async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("No test port");
      const file = join(source, "network-disguised.mp4");
      await writeFile(
        file,
        `#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nhttp://127.0.0.1:${address.port}/hidden.ts\n#EXT-X-ENDLIST\n`,
      );
      await scan([file]);
      expect(
        library.query({ search: "network-disguised" }).items[0]?.status,
      ).toBe("error");
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
