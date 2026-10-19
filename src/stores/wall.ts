import { defineStore } from "pinia";
import { computed, onScopeDispose, ref, watch } from "vue";
import type { MediaItem, TileState } from "../shared/contracts";
import { MAX_WALL_TILES, PLAYBACK_SPEEDS } from "../shared/contracts";
import type { PlayerEngine } from "../player/engine";
import { chooseRandom, randomStart } from "../core/random";
import { useSettings } from "./settings";

export const useWall = defineStore("wall", () => {
  const settings = useSettings(),
    tiles = ref<TileState[]>([]),
    focused = ref<string | null>(null),
    zoomed = ref<string | null>(null),
    muted = ref(true),
    volume = ref(0.65),
    unifiedSpeed = ref(1),
    mixedAudio = ref(false),
    privacy = ref(false),
    hovered = ref<string | null>(null),
    resourceMode = ref(false),
    quality = ref<
      Record<
        string,
        { frames: number; dropped: number; ratio: number; struggling: boolean }
      >
    >({});
  const recent: string[] = [],
    engines = new Map<string, PlayerEngine>(),
    knownFailures = new Set<string>(),
    manualPaused = new Map<string, boolean>(),
    pendingPlay = new Map<
      string,
      { mediaId: string; engine: PlayerEngine; task: Promise<void> }
    >();
  const playing = computed(() =>
    tiles.value.some(
      (t) => !t.paused && t.status !== "error" && t.status !== "ended",
    ),
  );
  const pausedByAll = ref(false),
    randomPool = ref<MediaItem[]>([]);
  const removed = ref<{ tile: TileState; index: number; paused: boolean } | null>(null);
  let removalTimer: ReturnType<typeof setTimeout> | undefined;
  function dismissRemoval(): void {
    clearTimeout(removalTimer);
    removalTimer = undefined;
    removed.value = null;
  }
  onScopeDispose(dismissRemoval);
  let count = 0;
  function create(media: MediaItem, paused = false): TileState {
    const id = `tile-${++count}`;
    manualPaused.set(id, paused);
    return {
      id,
      media,
      paused,
      muted: false,
      volume: 1,
      speed: unifiedSpeed.value,
      locked: false,
      loop: false,
      progress: 0,
      duration: media.duration || 0,
      playedSeconds: 0,
      status: "loading",
      error: null,
      startAt: randomStart(media.duration || 0, settings.values.randomStart),
    };
  }
  function suspended(id: string): boolean {
    return (
      (resourceMode.value && id !== tiles.value[0]?.id) ||
      (settings.values.pauseHidden && !!zoomed.value && id !== zoomed.value)
    );
  }
  function applyPauses(): void {
    for (const tile of tiles.value) {
      tile.paused =
        !!manualPaused.get(tile.id) ||
        suspended(tile.id) ||
        privacy.value ||
        tile.status === "error" ||
        tile.status === "ended";
      if (tile.paused && tile.status === "playing") tile.status = "paused";
    }
  }
  function sync(): void {
    applyPauses();
    for (const tile of tiles.value) {
      const engine = engines.get(tile.id);
      if (!engine) continue;
      engine.configure({
        muted:
          privacy.value ||
          muted.value ||
          tile.muted ||
          (!mixedAudio.value && tile.id !== focused.value),
        volume: tile.volume * volume.value,
        speed: tile.speed,
        loop: tile.loop,
      });
      if (tile.paused || privacy.value) engine.pause();
      else if (
        engine.element.paused &&
        !(
          pendingPlay.get(tile.id)?.engine === engine &&
          pendingPlay.get(tile.id)?.mediaId === tile.media.id
        )
      ) {
        const mediaId = tile.media.id;
        const task = engine.play();
        pendingPlay.set(tile.id, { mediaId, engine, task });
        void task
          .catch((error) => {
            if (
              pendingPlay.get(tile.id)?.task !== task ||
              engines.get(tile.id) !== engine ||
              tile.media.id !== mediaId ||
              tile.status === "error" ||
              tile.paused
            )
              return;
            if ((error as DOMException).name === "NotAllowedError") {
              manualPaused.set(tile.id, true);
              tile.paused = true;
              tile.status = "paused";
            } else if (
              (error as DOMException).name !== "AbortError" &&
              engine.element.error
            ) {
              markError(tile.id, "无法播放此视频，请检查编码或文件状态");
            }
          })
          .finally(() => {
            if (pendingPlay.get(tile.id)?.task === task)
              pendingPlay.delete(tile.id);
          });
      }
    }
  }
  watch(
    () => [
      resourceMode.value,
      zoomed.value,
      settings.values.pauseHidden,
      ...tiles.value.map((t) => t.id),
    ],
    sync,
  );
  function toggleResource(): void {
    resourceMode.value = !resourceMode.value;
    sync();
  }
  function register(id: string, engine: PlayerEngine): void {
    engines.set(id, engine);
    sync();
  }
  function unregister(id: string, engine: PlayerEngine): void {
    if (engines.get(id) === engine) engines.delete(id);
    engine.destroy();
  }
  function add(media: MediaItem): string | null {
    if (tiles.value.length >= MAX_WALL_TILES)
      return `最多同时播放 ${MAX_WALL_TILES} 个画面`;
    tiles.value.push(create(media, pausedByAll.value || privacy.value));
    focused.value ??= tiles.value[0]!.id;
    return null;
  }
  function newWall(media: MediaItem[]): void {
    if (media.length > MAX_WALL_TILES)
      throw new Error(`最多同时播放 ${MAX_WALL_TILES} 个画面，请减少选择`);
    dismissRemoval();
    manualPaused.clear();
    quality.value = {};
    pendingPlay.clear();
    resourceMode.value = false;
    tiles.value = media.map((m) => create(m, privacy.value));
    focused.value = tiles.value[0]?.id ?? null;
    zoomed.value = null;
    pausedByAll.value = false;
    recent.splice(0);
  }
  function remove(id: string, undoable = false): void {
    const index = tiles.value.findIndex((t) => t.id === id);
    const tile = tiles.value[index];
    if (!tile) return;
    if (undoable) {
      dismissRemoval();
      removed.value = { tile: { ...tile }, index, paused: !!manualPaused.get(id) };
      removalTimer = setTimeout(dismissRemoval, 8000);
    }
    manualPaused.delete(id);
    pendingPlay.delete(id);
    delete quality.value[id];
    tiles.value = tiles.value.filter((t) => t.id !== id);
    if (focused.value === id)
      focused.value =
        tiles.value[Math.min(index, tiles.value.length - 1)]?.id ?? null;
    if (zoomed.value === id) zoomed.value = null;
    sync();
  }
  function restoreRemoved(): string | null {
    const entry = removed.value;
    if (!entry) return "撤销已过期";
    if (tiles.value.length >= MAX_WALL_TILES)
      return `播放墙已满，最多 ${MAX_WALL_TILES} 个画面`;
    const tile = { ...entry.tile, startAt: entry.tile.progress };
    manualPaused.set(tile.id, entry.paused || pausedByAll.value || privacy.value);
    tiles.value.splice(Math.min(entry.index, tiles.value.length), 0, tile);
    focused.value ??= tile.id;
    dismissRemoval();
    sync();
    return null;
  }
  function toggleAll(force?: boolean): void {
    const next = force ?? !playing.value;
    pausedByAll.value = !next;
    if (next) resourceMode.value = false;
    tiles.value.forEach((t) => {
      if (t.status === "error") return;
      manualPaused.set(t.id, !next);
      t.paused = !next;
      if (next && t.status === "ended") {
        engines.get(t.id)?.seek(0);
        t.progress = 0;
        t.playedSeconds = 0;
        t.status = "paused";
      } else if (!next && t.status !== "ended" && t.status !== "loading")
        t.status = "paused";
    });
    sync();
  }
  function toggle(id: string): void {
    const tile = tiles.value.find((t) => t.id === id);
    if (tile) {
      const play = tile.paused;
      manualPaused.set(id, !play);
      if (play) {
        if (suspended(id)) {
          resourceMode.value = false;
          zoomed.value = null;
        }
        if (tile.status === "ended") {
          engines.get(id)?.seek(0);
          tile.progress = 0;
          tile.playedSeconds = 0;
          tile.status = "paused";
        }
      }
      sync();
    }
  }
  function replace(id: string, media: MediaItem): void {
    const tile = tiles.value.find((t) => t.id === id);
    if (!tile) return;
    const replacement = create(
      media,
      !!manualPaused.get(id) || pausedByAll.value || privacy.value,
    );
    manualPaused.set(id, !!manualPaused.get(replacement.id));
    manualPaused.delete(replacement.id);
    delete quality.value[id];
    Object.assign(tile, {
      ...replacement,
      id: tile.id,
      locked: tile.locked,
      volume: tile.volume,
      muted: tile.muted,
      speed: tile.speed,
      loop: tile.loop,
    });
    recent.push(media.id);
    if (recent.length > 20) recent.shift();
  }
  function retry(id: string): void {
    const tile = tiles.value.find((t) => t.id === id);
    if (!tile) return;
    tile.error = null;
    tile.status = "loading";
    pendingPlay.delete(id);
    manualPaused.set(id, false);
    if (suspended(id)) {
      resourceMode.value = false;
      zoomed.value = null;
    }
    knownFailures.delete(tile.media.id);
  }
  function shuffle(pool: MediaItem[], only?: string): number {
    randomPool.value = pool;
    const occupied = new Set(tiles.value.map((t) => t.media.id));
    let replaced = 0;
    for (const tile of tiles.value) {
      if (tile.locked || (only && tile.id !== only)) continue;
      const candidate = chooseRandom(
        pool.filter((m) => !knownFailures.has(m.id)),
        occupied,
        recent,
      );
      if (!candidate) continue;
      occupied.add(candidate.id);
      replace(tile.id, candidate);
      replaced++;
    }
    return replaced;
  }
  function resize(amount: number, pool: MediaItem[]): number {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_WALL_TILES)
      throw new Error(`画面数量应为 1～${MAX_WALL_TILES} 个`);
    if (tiles.value.filter((t) => t.locked).length > amount)
      throw new Error("请先解锁需要关闭的画面");
    while (tiles.value.length > amount) {
      const tile = tiles.value.findLast((t) => !t.locked);
      if (tile) remove(tile.id);
    }
    const used = new Set(tiles.value.map((t) => t.media.id));
    while (tiles.value.length < amount) {
      const candidate = chooseRandom(pool, used, recent);
      if (!candidate) break;
      used.add(candidate.id);
      add(candidate);
    }
    randomPool.value = pool;
    return tiles.value.length;
  }
  function seek(id: string, seconds: number): void {
    const tile = tiles.value.find((t) => t.id === id);
    if (tile && Number.isFinite(seconds)) {
      tile.progress = Math.max(0, Math.min(tile.duration, seconds));
      if (tile.status === "ended" && tile.progress < tile.duration)
        tile.status = "paused";
    }
    engines.get(id)?.seek(seconds);
  }
  function seekAll(delta: number): void {
    for (const t of tiles.value) seek(t.id, t.progress + delta);
  }
  function seekPercent(percent: number): void {
    if (!Number.isFinite(percent)) return;
    const ratio = Math.max(0, Math.min(100, percent)) / 100;
    for (const t of tiles.value)
      if (Number.isFinite(t.duration) && t.duration > 0 && t.status !== "error")
        seek(t.id, t.duration * ratio);
  }
  function setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    volume.value = Math.max(0, Math.min(1, value));
    muted.value = volume.value === 0;
    sync();
  }
  function setSpeed(value: number): void {
    if (!(PLAYBACK_SPEEDS as readonly number[]).includes(value)) return;
    unifiedSpeed.value = value;
    for (const tile of tiles.value) tile.speed = value;
    sync();
  }
  function setMixedAudio(value: boolean): void {
    mixedAudio.value = value;
    sync();
  }
  function focus(id: string): void {
    focused.value = id;
    sync();
  }
  async function main(id: string): Promise<void> {
    const tile = tiles.value.find((t) => t.id === id);
    if (tile) {
      tiles.value = [tile, ...tiles.value.filter((t) => t.id !== id)];
      await settings.set({ layout: "focus" });
    }
  }
  function swap(a: string, b: string): void {
    const x = tiles.value.findIndex((t) => t.id === a),
      y = tiles.value.findIndex((t) => t.id === b);
    if (x >= 0 && y >= 0) {
      const next = [...tiles.value];
      [next[x], next[y]] = [next[y]!, next[x]!];
      tiles.value = next;
    }
  }
  function hide(): void {
    privacy.value = true;
    toggleAll(false);
    muted.value = true;
    sync();
  }
  function markError(id: string, message: string): void {
    const tile = tiles.value.find((t) => t.id === id);
    if (tile) {
      manualPaused.set(id, true);
      tile.error = message;
      tile.status = "error";
      tile.paused = true;
      knownFailures.add(tile.media.id);
    }
  }
  function ended(id: string): void {
    const tile = tiles.value.find((t) => t.id === id);
    if (!tile) return;
    if (
      settings.values.autoNext &&
      !tile.locked &&
      !tile.loop &&
      !privacy.value &&
      shuffle(randomPool.value, id)
    )
      return;
    tile.paused = true;
    manualPaused.set(id, true);
    tile.status = "ended";
  }
  function tick(
    id: string,
    current: number,
    duration: number,
    seeking = false,
  ): void {
    const tile = tiles.value.find((t) => t.id === id);
    if (!tile) return;
    const delta = current - tile.progress;
    if (delta > 0 && delta < 3 && !tile.paused && !seeking)
      tile.playedSeconds += delta / tile.speed;
    tile.progress = current;
    if (Number.isFinite(duration)) tile.duration = duration;
    if (
      settings.values.switchInterval > 0 &&
      tile.playedSeconds >= settings.values.switchInterval &&
      !tile.locked &&
      !privacy.value
    ) {
      tile.playedSeconds = 0;
      shuffle(randomPool.value, id);
    }
  }
  return {
    tiles,
    focused,
    zoomed,
    muted,
    volume,
    unifiedSpeed,
    mixedAudio,
    privacy,
    hovered,
    resourceMode,
    quality,
    suspended,
    toggleResource,
    retry,
    playing,
    randomPool,
    register,
    unregister,
    sync,
    add,
    newWall,
    remove,
    removed,
    restoreRemoved,
    toggleAll,
    toggle,
    replace,
    shuffle,
    resize,
    seek,
    seekAll,
    seekPercent,
    setVolume,
    setSpeed,
    setMixedAudio,
    focus,
    main,
    swap,
    hide,
    markError,
    ended,
    tick,
  };
});
