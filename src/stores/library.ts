import { defineStore } from "pinia";
import { computed, reactive, ref, shallowRef } from "vue";
import type {
  LibraryQuery,
  LibraryRoot,
  MediaItem,
  OrientationFilter,
  ResolutionFilter,
  ScanProgress,
} from "../shared/contracts";

const PAGE_SIZE = 100,
  MAX_PAGES = 7;
export interface LibraryFilters {
  duration: "all" | "short" | "medium" | "long" | "feature";
  resolution: ResolutionFilter;
  orientation: OrientationFilter;
  status: NonNullable<LibraryQuery["status"]>;
  onlyFavorites: boolean;
}
const emptyFilters = (): LibraryFilters => ({
  duration: "all",
  resolution: "all",
  orientation: "all",
  status: "all",
  onlyFavorites: false,
});

export const useLibrary = defineStore("library", () => {
  const items = ref<MediaItem[]>([]),
    roots = ref<LibraryRoot[]>([]),
    total = ref(0),
    allTotal = ref(0),
    loading = ref(false),
    selecting = ref(false),
    progress = ref<ScanProgress | null>(null);
  const search = ref(""),
    rootId = ref(""),
    favorites = ref(false),
    sort = ref<NonNullable<LibraryQuery["sort"]>>("name"),
    direction = ref<"asc" | "desc">("asc"),
    selection = ref(new Map<string, MediaItem>()),
    filters = reactive(emptyFilters());
  const pages = shallowRef(new Map<number, MediaItem[]>()),
    revision = ref(0),
    resetKey = ref(0),
    visibleRange = ref({ start: 0, end: 0 });
  const scanning = computed(
    () =>
      !!progress.value && !["done", "cancelled"].includes(progress.value.phase),
  );
  const query = computed<LibraryQuery>(() => {
    const result: LibraryQuery = {
      search: search.value,
      rootId: rootId.value || undefined,
      favorites: favorites.value || filters.onlyFavorites,
      sort: sort.value,
      direction: direction.value,
      resolution: filters.resolution,
      orientation: filters.orientation,
      status: filters.status,
    };
    if (filters.duration === "short") result.maxDuration = 600;
    if (filters.duration === "medium") {
      result.minDuration = 600.001;
      result.maxDuration = 1800;
    }
    if (filters.duration === "long") {
      result.minDuration = 1800.001;
      result.maxDuration = 3600;
    }
    if (filters.duration === "feature") result.minDuration = 3600.001;
    return result;
  });
  const queryKey = computed(() => JSON.stringify(query.value));
  const hasFilters = computed(
    () =>
      !!search.value ||
      !!rootId.value ||
      JSON.stringify(filters) !== JSON.stringify(emptyFilters()),
  );
  const cachedCount = computed(() =>
    [...pages.value.values()].reduce((n, page) => n + page.length, 0),
  );
  const pending = new Map<number, Promise<void>>();
  const validPages = new Set<number>();
  let generation = 0,
    lastQueryKey = "",
    refreshTimer: ReturnType<typeof setTimeout> | undefined;

  function itemAt(index: number): MediaItem | undefined {
    return pages.value.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE];
  }
  function prune(): void {
    const next = new Map(pages.value),
      first = Math.floor(visibleRange.value.start / PAGE_SIZE),
      last = Math.floor(
        Math.max(visibleRange.value.start, visibleRange.value.end - 1) /
          PAGE_SIZE,
      );
    for (const key of next.keys())
      if (next.size > MAX_PAGES && key !== 0 && (key < first || key > last)) {
        next.delete(key);
        validPages.delete(key);
      }
    pages.value = next;
  }
  async function ensurePage(
    index: number,
    epoch: number,
    snapshot: LibraryQuery,
  ): Promise<void> {
    if (
      !window.vexa ||
      epoch !== generation ||
      (pages.value.has(index) && validPages.has(index))
    )
      return;
    if (pending.has(index)) return pending.get(index);
    const task = (async () => {
      const page = await window.vexa!.queryLibrary({
        ...snapshot,
        offset: index * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      if (epoch !== generation) return;
      total.value = page.total;
      const records = page.items.map((media) => reactive(media));
      const next = new Map(pages.value);
      next.set(index, records);
      validPages.add(index);
      pages.value = next;
      if (index === 0) items.value = records;
      prune();
    })();
    pending.set(index, task);
    try {
      await task;
    } finally {
      if (pending.get(index) === task) pending.delete(index);
    }
  }
  async function loadRange(start: number, end: number): Promise<void> {
    visibleRange.value = {
      start: Math.max(0, start),
      end: Math.min(total.value, end),
    };
    if (end <= start) return;
    const epoch = generation,
      snapshot = { ...query.value },
      first = Math.floor(start / PAGE_SIZE),
      last = Math.min(first + 3, Math.floor((end - 1) / PAGE_SIZE));
    await Promise.all(
      Array.from({ length: Math.max(0, last - first + 1) }, (_, i) =>
        ensurePage(first + i, epoch, snapshot),
      ),
    );
    if (epoch === generation) prune();
  }
  async function load(): Promise<void> {
    if (!window.vexa) return;
    const epoch = ++generation,
      snapshot = { ...query.value },
      key = queryKey.value;
    pending.clear();
    validPages.clear();
    revision.value++;
    if (key !== lastQueryKey) {
      pages.value = new Map();
      items.value = [];
      lastQueryKey = key;
      visibleRange.value = { start: 0, end: 0 };
      resetKey.value++;
    }
    loading.value = true;
    try {
      const [, rootRows, count] = await Promise.all([
        ensurePage(0, epoch, snapshot),
        window.vexa.roots(),
        window.vexa.queryLibrary({ limit: 1 }),
      ]);
      if (epoch !== generation) return;
      roots.value = rootRows;
      allTotal.value = count.total;
      await loadRange(visibleRange.value.start, visibleRange.value.end);
    } finally {
      if (epoch === generation) loading.value = false;
    }
  }
  function subscribe(onError: (error: unknown) => void): () => void {
    const stop = window.vexa?.onScan((data) => {
      progress.value = data;
      const done = ["done", "cancelled"].includes(data.phase);
      if (done) {
        clearTimeout(refreshTimer);
        refreshTimer = undefined;
      }
      if (!refreshTimer)
        refreshTimer = setTimeout(
          () => {
            refreshTimer = undefined;
            void load().catch(onError);
          },
          done ? 0 : 350,
        );
    });
    return () => {
      stop?.();
      clearTimeout(refreshTimer);
    };
  }
  async function importPaths(paths: string[], recursive = true): Promise<void> {
    if (!paths.length) return;
    if (!window.vexa) throw new Error("请在桌面应用中导入本地文件");
    await window.vexa.scan({ paths, recursive });
  }
  async function candidates(
    scope: "all" | "current" = "current",
  ): Promise<MediaItem[]> {
    if (!window.vexa) return [];
    const snapshot = scope === "current" ? { ...query.value } : {},
      found: MediaItem[] = [];
    let offset = 0,
      count = Infinity;
    while (offset < count) {
      const page = await window.vexa.queryLibrary({
        ...snapshot,
        offset,
        limit: 200,
      });
      count = page.total;
      found.push(
        ...page.items.filter(
          (m) => m.status !== "missing" && m.status !== "error",
        ),
      );
      offset += page.items.length;
      if (!page.items.length) break;
    }
    return found;
  }
  function select(media: MediaItem): void {
    const next = new Map(selection.value);
    next.has(media.id) ? next.delete(media.id) : next.set(media.id, media);
    selection.value = next;
  }
  async function selectRange(start: number, end: number): Promise<void> {
    if (!window.vexa || selecting.value) return;
    const first = Math.max(0, Math.min(start, end)),
      last = Math.min(total.value - 1, Math.max(start, end));
    if (last < first) return;
    if (scanning.value && last - first >= PAGE_SIZE)
      throw new Error("正在扫描，请等待完成后批量选择");
    const epoch = generation,
      key = queryKey.value,
      snapshot = { ...query.value },
      chosen = new Map(selection.value);
    selecting.value = true;
    try {
      for (let offset = first; offset <= last; offset += 200) {
        const page = await window.vexa.queryLibrary({
          ...snapshot,
          offset,
          limit: Math.min(200, last - offset + 1),
        });
        if (epoch !== generation || key !== queryKey.value)
          throw new Error("列表已变化，请重新选择");
        page.items.forEach((media) => chosen.set(media.id, media));
        if (!page.items.length) break;
      }
      selection.value = chosen;
    } finally {
      selecting.value = false;
    }
  }
  async function favorite(media: MediaItem): Promise<void> {
    const next = !media.favorite;
    await window.vexa?.favorite(media.id, next);
    media.favorite = next;
    for (const page of pages.value.values())
      for (const cached of page)
        if (cached.id === media.id) cached.favorite = next;
    const selected = selection.value.get(media.id);
    if (selected) selected.favorite = next;
    if (query.value.favorites) await load();
  }
  function resetFilters(): void {
    search.value = "";
    rootId.value = "";
    Object.assign(filters, emptyFilters());
  }
  return {
    items,
    roots,
    total,
    allTotal,
    loading,
    selecting,
    progress,
    search,
    rootId,
    favorites,
    sort,
    direction,
    selection,
    filters,
    scanning,
    query,
    queryKey,
    hasFilters,
    cachedCount,
    revision,
    resetKey,
    itemAt,
    load,
    loadRange,
    subscribe,
    importPaths,
    candidates,
    select,
    selectRange,
    favorite,
    resetFilters,
  };
});
