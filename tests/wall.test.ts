import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useWall } from "../src/stores/wall";
import { useSettings } from "../src/stores/settings";
import type { MediaItem } from "../src/shared/contracts";
import type { PlayerEngine } from "../src/player/engine";
const media = (id: string): MediaItem => ({
  id: id.repeat(32),
  path: `${id}.mp4`,
  name: `${id}.mp4`,
  size: 100,
  mtime: 0,
  duration: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  codec: "h264",
  audioCodec: null,
  status: "ready",
  thumbnail: false,
  favorite: false,
  error: null,
});
function engine(): PlayerEngine {
  const element = { paused: true, error: null } as unknown as HTMLVideoElement;
  return {
    element,
    play: vi.fn(async () => {
      Object.assign(element, { paused: false });
    }),
    pause: vi.fn(() => Object.assign(element, { paused: true })),
    seek: vi.fn(),
    configure: vi.fn(),
    destroy: vi.fn(),
  };
}
beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => {},
  }));
  vi.stubGlobal("localStorage", { setItem: () => {} });
  vi.stubGlobal("document", {
    documentElement: { dataset: {}, classList: { toggle: () => {} } },
  });
  setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());
describe("playback resource controls", () => {
  it("applies percentage seeking to different durations while preserving pause and lock state", () => {
    const w = useWall();
    w.newWall([media("a"), { ...media("b"), duration: 120 }]);
    const first = engine(),
      second = engine();
    w.register(w.tiles[0]!.id, first);
    w.register(w.tiles[1]!.id, second);
    w.tiles[0]!.locked = true;
    w.toggle(w.tiles[1]!.id);
    w.seekPercent(25);
    expect(first.seek).toHaveBeenLastCalledWith(15);
    expect(second.seek).toHaveBeenLastCalledWith(30);
    expect(w.tiles.map((t) => t.paused)).toEqual([false, true]);
    expect(w.tiles[0]!.locked).toBe(true);
    w.seekPercent(NaN);
    expect(w.tiles.map((t) => t.progress)).toEqual([15, 30]);
    w.seekPercent(150);
    expect(w.tiles.map((t) => t.progress)).toEqual([60, 120]);
  });
  it("seeks back from ended state without losing the selected replay position", () => {
    const w = useWall();
    w.newWall([media("a")]);
    const tile = w.tiles[0]!,
      e = engine();
    w.register(tile.id, e);
    w.ended(tile.id);
    w.seekPercent(50);
    expect(tile.status).toBe("paused");
    expect(tile.paused).toBe(true);
    w.toggle(tile.id);
    expect(e.seek).toHaveBeenLastCalledWith(30);
    expect(tile.paused).toBe(false);
  });
  it("applies unified speed to current and new tiles without resuming paused streams", () => {
    const w = useWall();
    w.newWall([media("a"), media("b")]);
    const e = engine();
    w.register(w.tiles[0]!.id, e);
    w.toggleAll(false);
    w.setSpeed(1.5);
    w.add(media("c"));
    expect(w.tiles.every((t) => t.speed === 1.5 && t.paused)).toBe(true);
    expect(e.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ speed: 1.5 }),
    );
    w.tiles[0]!.speed = 2;
    w.replace(w.tiles[0]!.id, media("d"));
    expect(w.tiles[0]!.speed).toBe(2);
    w.setSpeed(Infinity);
    expect(w.tiles[0]!.speed).toBe(2);
    w.newWall([media("a")]);
    expect(w.tiles[0]!.speed).toBe(1.5);
  });
  it("adjusts master volume while retaining individual levels, focus routing and privacy", () => {
    const w = useWall();
    w.newWall([media("a"), media("b")]);
    const first = engine(),
      second = engine();
    w.register(w.tiles[0]!.id, first);
    w.register(w.tiles[1]!.id, second);
    w.tiles[0]!.volume = 0.5;
    w.setVolume(0.4);
    expect(first.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ volume: 0.2, muted: false }),
    );
    expect(second.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ volume: 0.4, muted: true }),
    );
    w.setVolume(0);
    expect(w.muted).toBe(true);
    w.hide();
    w.setVolume(0.7);
    expect(first.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ muted: true }),
    );
    expect(w.tiles.every((t) => t.paused)).toBe(true);
  });
  it("does not downgrade an already playing stream when play-all is requested", () => {
    const w = useWall();
    w.newWall([media("a")]);
    const tile = w.tiles[0]!,
      e = engine();
    w.register(tile.id, e);
    tile.status = "playing";
    w.toggleAll(true);
    expect(tile.status).toBe("playing");
  });
  it("restores only automatically paused tiles, preserves user pauses and global pause", () => {
    const w = useWall();
    w.newWall([media("a"), media("b"), media("c")]);
    w.toggle(w.tiles[2]!.id);
    w.toggleResource();
    expect(w.tiles.map((t) => t.paused)).toEqual([false, true, true]);
    w.toggleResource();
    expect(w.tiles.map((t) => t.paused)).toEqual([false, false, true]);
    w.toggleResource();
    w.toggleAll(false);
    w.toggleResource();
    expect(w.tiles.every((t) => t.paused)).toBe(true);
  });
  it("combines zoom and resource suspensions without resuming hidden tiles", async () => {
    const w = useWall(),
      s = useSettings();
    w.newWall([media("a"), media("b"), media("c")]);
    s.values.pauseHidden = true;
    w.zoomed = w.tiles[1]!.id;
    await nextTick();
    expect(w.tiles.map((t) => t.paused)).toEqual([true, false, true]);
    w.toggleResource();
    expect(w.tiles.every((t) => t.paused)).toBe(true);
    w.zoomed = null;
    await nextTick();
    expect(w.tiles.map((t) => t.paused)).toEqual([false, true, true]);
    w.hide();
    w.privacy = false;
    w.toggleResource();
    expect(w.tiles.every((t) => t.paused)).toBe(true);
  });
  it("keeps the main tile playing after reordering in resource mode", async () => {
    const w = useWall();
    w.newWall([media("a"), media("b")]);
    w.toggleResource();
    w.main(w.tiles[1]!.id);
    await nextTick();
    expect(w.tiles.map((t) => t.paused)).toEqual([false, true]);
  });
  it("keeps replaced and newly added tiles suspended until restored", () => {
    const w = useWall();
    w.newWall([media("a"), media("b")]);
    w.toggleResource();
    const id = w.tiles[1]!.id;
    w.replace(id, media("c"));
    w.sync();
    w.add(media("d"));
    w.sync();
    expect(w.tiles.map((t) => t.paused)).toEqual([false, true, true]);
    w.toggleResource();
    expect(w.tiles.every((t) => !t.paused)).toBe(true);
  });
  it("preserves ended state across global pause and seeks to zero on replay", () => {
    const w = useWall();
    w.newWall([media("a")]);
    const tile = w.tiles[0]!,
      e = engine();
    w.register(tile.id, e);
    w.ended(tile.id);
    w.toggleAll(false);
    expect(tile.status).toBe("ended");
    w.toggleAll(true);
    expect(e.seek).toHaveBeenCalledWith(0);
    expect(tile.paused).toBe(false);
  });
  it("ignores obsolete play failures after media replacement and preserves specific errors", async () => {
    const w = useWall();
    w.newWall([media("a")]);
    const tile = w.tiles[0]!,
      e = engine();
    let reject!: (error: Error) => void;
    e.play = () => new Promise<void>((_, r) => (reject = r));
    w.register(tile.id, e);
    w.replace(tile.id, media("b"));
    reject(Object.assign(new Error("old"), { name: "NotAllowedError" }));
    await nextTick();
    await nextTick();
    expect(tile.paused).toBe(false);
    e.play = async () => {
      throw new Error("generic");
    };
    w.sync();
    w.markError(tile.id, "具体的编码错误");
    await nextTick();
    expect(tile.error).toBe("具体的编码错误");
  });
  it("does not count explicit small seeks as playback time", () => {
    const w = useWall();
    w.newWall([media("a")]);
    const id = w.tiles[0]!.id;
    w.tick(id, 1, 60);
    w.seek(id, 2.5);
    w.tick(id, 2.6, 60);
    expect(w.tiles[0]!.playedSeconds).toBeCloseTo(1.1);
  });
});
