import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLibrary } from "../src/stores/library";
import type {
  LibraryQuery,
  MediaItem,
  ScanProgress,
} from "../src/shared/contracts";
const records: MediaItem[] = Array.from({ length: 3000 }, (_, index) => ({
  id: index.toString(16).padStart(32, "0"),
  path: `${index}.mp4`,
  name: `${index}.mp4`,
  size: 1,
  mtime: 0,
  duration: 30,
  width: 1920,
  height: 1080,
  fps: 30,
  codec: "h264",
  audioCodec: null,
  status: "ready",
  thumbnail: false,
  favorite: index % 2 === 0,
  error: null,
}));
let query: ReturnType<typeof vi.fn>,
  scanListener: (event: ScanProgress) => void;
beforeEach(() => {
  setActivePinia(createPinia());
  query = vi.fn(async (input: LibraryQuery = {}) => {
    const filtered = records.filter(
      (m) =>
        (!input.search || m.name === input.search) &&
        (!input.favorites || m.favorite),
    );
    return {
      total: filtered.length,
      items: filtered
        .slice(input.offset || 0, (input.offset || 0) + (input.limit || 100))
        .map((m) => ({ ...m })),
    };
  });
  vi.stubGlobal("window", {
    vexa: {
      queryLibrary: query,
      roots: async () => [],
      onScan: (callback: typeof scanListener) => {
        scanListener = callback;
        return () => {};
      },
      favorite: async () => {},
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("paged library state", () => {
  it("loads visible ranges beyond the first page with bounded cache", async () => {
    const l = useLibrary();
    await l.load();
    for (let i = 100; i < 2900; i += 100) await l.loadRange(i, i + 30);
    expect(l.itemAt(2800)?.name).toBe("2800.mp4");
    expect(l.cachedCount).toBeLessThanOrEqual(700);
    expect(l.itemAt(0)?.name).toBe("0.mp4");
  });
  it("selects across page boundaries and all filtered records", async () => {
    const l = useLibrary();
    await l.load();
    await l.selectRange(98, 102);
    expect(l.selection.size).toBe(5);
    expect(l.selection.has(records[102]!.id)).toBe(true);
    l.selection.clear();
    l.filters.onlyFavorites = true;
    await l.load();
    await l.selectRange(0, l.total - 1);
    expect(l.selection.size).toBe(1500);
    expect([...l.selection.values()].every((m) => m.favorite)).toBe(true);
  });
  it("ignores obsolete page responses after the query changes", async () => {
    const l = useLibrary();
    let release!: (page: { total: number; items: MediaItem[] }) => void;
    query.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );
    const old = l.load();
    l.search = "10.mp4";
    await l.load();
    release({ total: 3000, items: records.slice(0, 100) });
    await old;
    expect(l.total).toBe(1);
    expect(l.itemAt(0)?.name).toBe("10.mp4");
  });
  it("uses the same combined filters for random candidates and preserves scroll during refresh", async () => {
    const l = useLibrary();
    await l.load();
    await l.loadRange(500, 530);
    const reset = l.resetKey;
    await l.load();
    expect(l.itemAt(500)).toBeDefined();
    expect(l.resetKey).toBe(reset);
    l.filters.resolution = "fhd";
    l.filters.orientation = "portrait";
    l.filters.duration = "medium";
    l.filters.status = "ready";
    l.filters.onlyFavorites = true;
    await l.candidates();
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resolution: "fhd",
        orientation: "portrait",
        minDuration: 600.001,
        maxDuration: 1800,
        status: "ready",
        favorites: true,
      }),
    );
  });
  it("refreshes during a stream of scan progress instead of waiting for it to stop", async () => {
    vi.useFakeTimers();
    const l = useLibrary(),
      stop = l.subscribe(() => {});
    const event = {
      id: "scan",
      phase: "probe",
      discovered: 100,
      completed: 0,
      failed: 0,
      skipped: 0,
      cancelled: false,
    } as ScanProgress;
    scanListener(event);
    await vi.advanceTimersByTimeAsync(200);
    scanListener({ ...event, completed: 5 });
    await vi.advanceTimersByTimeAsync(200);
    expect(query).toHaveBeenCalled();
    stop();
  });
});
