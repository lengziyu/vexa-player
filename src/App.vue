<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import Icon from "./components/Icon.vue";
import VideoTile from "./components/VideoTile.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import LibraryFilters from "./components/LibraryFilters.vue";
import VirtualMediaGrid from "./components/VirtualMediaGrid.vue";
import MediaCard from "./components/MediaCard.vue";
import WallControls from "./components/WallControls.vue";
import WallMediaDrawer from "./components/WallMediaDrawer.vue";
import DownloadsPanel from "./components/DownloadsPanel.vue";
import SelectMenu from "./components/SelectMenu.vue";
import { useDownloads } from "./stores/downloads";
import { useIdleControls } from "./composables/useIdleControls";
import { activeSelectMenu } from "./composables/useSelectMenu";
import { useSettings } from "./stores/settings";
import { useLibrary } from "./stores/library";
import { useWall } from "./stores/wall";
import { createStableLayout } from "./core/layout";
import type { MediaItem, LayoutMode } from "./shared/contracts";
import {
  HIGH_WALL_TILE_COUNT,
  MAX_WALL_TILES,
  WALL_TILE_PRESETS,
} from "./shared/contracts";

const settings = useSettings(),
  downloads = useDownloads(),
  library = useLibrary(),
  wall = useWall();
const desktopApi = window.vexa,
  desktop = !!desktopApi,
  view = ref<"home" | "wall" | "library" | "favorites" | "downloads">("home"),
  modal = ref<"settings" | "import" | "info" | null>(null),
  infoMedia = ref<MediaItem | null>(null),
  ready = ref(false);
const appVersion = __APP_VERSION__;
const toastMessage = ref(""),
  wallElement = ref<HTMLElement>(),
  panelElement = ref<HTMLElement>(),
  searchElement = ref<HTMLInputElement>(),
  modalElement = ref<HTMLElement>(),
  recursive = ref(true),
  countMenu = ref(false),
  scope = ref<"current" | "all">("current"),
  fullscreen = ref(false),
  wallControlsOpen = ref(false),
  wallPickerOpen = ref(false),
  pickerTarget = ref<string | null>(null),
  wallControlsHeight = ref(264),
  pointerHeld = ref(false),
  keyboardNavigation = ref(false),
  controlsFocused = ref(false);
const dimensions = ref({ width: 1000, height: 500 }),
  selectedIndex = ref<number | null>(null);
let resizeObserver: ResizeObserver,
  unsubscribe = () => {},
  unsubscribePrivacy = () => {},
  unsubscribeDownloads = () => {},
  toastTimer: ReturnType<typeof setTimeout>,
  searchTimer: ReturnType<typeof setTimeout>,
  lastFocus: HTMLElement | null = null;
let pickerFocus: HTMLElement | null = null;
const heading = computed(() =>
  view.value === "downloads"
    ? "留住喜欢的片刻"
    : view.value === "home"
      ? "你的私人放映室"
      : view.value === "wall"
        ? "我的视频墙"
        : view.value === "favorites"
          ? "我的收藏"
          : "我的视频库",
);
const subtitle = computed(() =>
  view.value === "downloads"
    ? "从一条链接，到你的本地收藏。"
    : view.value === "home"
      ? "为每一个喜欢的瞬间，留一处刚好的空间。"
      : view.value === "wall"
        ? "把喜欢的片刻，放在同一个世界。"
        : view.value === "favorites"
          ? "反复心动，也是一种浪漫。"
          : "每一次发现，都值得被好好收藏。",
);
const layoutRevision = ref(0),
  planLayout = createStableLayout();
const rects = computed(() =>
  planLayout(
    wall.tiles.map((t) => ({
      id: t.id,
      aspect: (t.media.width || 16) / (t.media.height || 9),
    })),
    dimensions.value.width,
    dimensions.value.height,
    settings.values.layout,
    layoutRevision.value,
  ),
);
const mountedTiles = computed(() =>
  [...wall.tiles].sort((a, b) => Number(a.id.slice(5)) - Number(b.id.slice(5))),
);
const isLibrary = computed(
  () => view.value === "library" || view.value === "favorites",
);
const { idle: controlsIdle, wake: wakeControls } = useIdleControls(
  () =>
    fullscreen.value && view.value === "wall" && wall.playing && !wall.privacy,
  () =>
    wallControlsOpen.value ||
    wallPickerOpen.value ||
    countMenu.value ||
    !!activeSelectMenu.value ||
    !!modal.value ||
    pointerHeld.value ||
    (keyboardNavigation.value && controlsFocused.value),
);
function pointerActivity(): void {
  keyboardNavigation.value = false;
  wakeControls();
}
function keyboardActivity(): void {
  keyboardNavigation.value = true;
}
function pointerStart(): void {
  pointerHeld.value = true;
  pointerActivity();
}
function pointerEnd(): void {
  pointerHeld.value = false;
  wakeControls();
}
function controlFocus(event: FocusEvent): void {
  controlsFocused.value = !!(event.target as HTMLElement).closest(
    "button,input,select",
  );
  wakeControls();
}
const strugglingCount = computed(
  () =>
    wall.tiles.filter((t) => !t.paused && wall.quality[t.id]?.struggling)
      .length,
);
const layouts: Array<{ id: LayoutMode; name: string; icon: string }> = [
  { id: "smart", name: "智能", icon: "sparkles" },
  { id: "focus", name: "主次", icon: "focus" },
  { id: "grid", name: "网格", icon: "grid" },
];
const layoutName = computed(
  () => layouts.find((l) => l.id === settings.values.layout)?.name || "智能",
);
const scanTitle = computed(() =>
  library.progress?.phase === "done"
    ? "导入完成"
    : library.progress?.phase === "cancelled"
      ? "扫描已取消"
      : library.progress?.phase === "probe"
        ? "读取信息与封面"
        : "正在发现视频",
);
function notify(message: string): void {
  toastMessage.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMessage.value = ""), 3500);
}
function error(error: unknown): void {
  const text = error instanceof Error ? error.message : "操作失败，请重试";
  notify(text.replace(/^Error invoking remote method '[^']+': Error: /, ""));
}
async function changeLayout(layout: LayoutMode): Promise<void> {
  try {
    await settings.set({ layout });
  } catch (e) {
    error(e);
  }
}
async function go(destination: typeof view.value, root = ""): Promise<void> {
  view.value = destination;
  if (destination === "library" || destination === "favorites") {
    library.rootId = root;
    library.favorites = destination === "favorites";
  }
  countMenu.value = false;
  if (destination === "library" || destination === "favorites") {
    await nextTick();
    clearTimeout(searchTimer);
    await library.load().catch(error);
  }
  await nextTick();
  measure();
}
function openModal(name: typeof modal.value): void {
  lastFocus = document.activeElement as HTMLElement;
  modal.value = name;
  countMenu.value = false;
  void nextTick(() =>
    modalElement.value
      ?.querySelector<HTMLElement>("button,input,select")
      ?.focus(),
  );
}
function closeModal(): void {
  modal.value = null;
  lastFocus?.focus();
}
function measure(): void {
  if (wallElement.value) {
    const rect = wallElement.value.getBoundingClientRect();
    if (rect.width && rect.height)
      dimensions.value = { width: rect.width, height: rect.height };
  }
}
function tileStyle(id: string): Record<string, string> {
  const rect = rects.value.find((r) => r.id === id);
  return rect
    ? {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }
    : {};
}
async function importFiles(kind: "files" | "folders"): Promise<void> {
  if (!window.vexa) {
    notify("请用桌面版打开，才能导入本地文件与文件夹");
    return;
  }
  try {
    const paths = await (kind === "files"
      ? window.vexa.pickFiles()
      : window.vexa.pickFolders());
    if (!paths.length) return;
    await library.importPaths(paths, recursive.value);
    closeModal();
    await go("library");
    notify("已开始后台导入，可以继续浏览和播放");
  } catch (e) {
    error(e);
  }
}
async function refresh(): Promise<void> {
  if (!window.vexa) return;
  try {
    await window.vexa.refresh();
    notify("正在后台刷新文件夹");
  } catch (e) {
    error(e);
  }
}
async function drop(event: DragEvent): Promise<void> {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  if (!window.vexa) return notify("请在桌面版中拖入文件");
  try {
    const paths = await window.vexa.droppedPaths([...event.dataTransfer.files]);
    await library.importPaths(paths, recursive.value);
    closeModal();
    await go("library");
    notify("拖入的文件正在后台导入");
  } catch (e) {
    error(e);
  }
}
async function pool(): Promise<MediaItem[]> {
  return library.candidates(scope.value);
}
function openPicker(id: string | null = null): void {
  if (!wallPickerOpen.value) pickerFocus = document.activeElement as HTMLElement;
  pickerTarget.value = id;
  wallPickerOpen.value = true;
  wallControlsOpen.value = false;
  countMenu.value = false;
  wakeControls();
}
function closePicker(): void {
  wallPickerOpen.value = false;
  pickerTarget.value = null;
  void nextTick(() => {
    const target = pickerFocus?.isConnected
      ? pickerFocus
      : panelElement.value?.querySelector<HTMLButtonElement>(".wall-add-button");
    target?.focus({ preventScroll: true });
  });
}
function chooseForWall(media: MediaItem): void {
  if (media.status === "missing" || media.status === "error") return;
  if (pickerTarget.value) {
    if (!wall.tiles.some((tile) => tile.id === pickerTarget.value)) return;
    wall.replace(pickerTarget.value, media);
  } else {
    const message = wall.add(media);
    if (message) return notify(message);
  }
  void pool().then((media) => { wall.randomPool = media; }).catch(error);
}
async function importDuringPlayback(): Promise<void> {
  try {
    const paths = await window.vexa?.pickFiles();
    if (paths?.length) await library.importPaths(paths, recursive.value);
  } catch (e) { error(e); }
}
function undoRemove(): void {
  const message = wall.restoreRemoved();
  if (message) notify(message);
}
async function shuffle(id?: string): Promise<void> {
  try {
    const count = wall.shuffle(await pool(), id);
    notify(
      count
        ? `新的片刻已就位 · 已替换 ${count} 个画面`
        : "没有新的可用候选，试试解锁或导入更多视频",
    );
  } catch (e) {
    error(e);
  }
}
async function setCount(count: number): Promise<void> {
  countMenu.value = false;
  try {
    const actual = wall.resize(count, await pool());
    if (!actual) return notify("先导入一些视频，让放映室开始运转");
    await go("wall");
    notify(
      actual < count
        ? `可用视频不足，已保留 ${actual} 个不重复画面`
        : `已调整为 ${count} 个画面`,
    );
  } catch (e) {
    error(e);
  }
}
async function playSelected(replace = false): Promise<void> {
  const chosen = [...library.selection.values()];
  if (!chosen.length) return;
  if (replace) {
    if (chosen.length !== 1) return notify("替换画面时，请只选择一个视频");
    if (!wall.focused) return notify("请先在播放墙选择一个画面");
    wall.replace(wall.focused, chosen[0]!);
  } else {
    if (chosen.length > MAX_WALL_TILES)
      return notify(`最多同时播放 ${MAX_WALL_TILES} 个，请减少选择`);
    if (
      wall.tiles.some((t) => t.locked) &&
      !confirm("创建新墙将结束当前播放，包括锁定的画面。继续吗？")
    )
      return;
    wall.newWall(chosen);
  }
  library.selection.clear();
  wall.randomPool = await pool();
  await go("wall");
}
async function add(media: MediaItem): Promise<void> {
  if (media.status === "missing" || media.status === "error")
    return notify(media.error || "文件当前不可用");
  const message = wall.add(media);
  if (message) return notify(message);
  wall.randomPool = await pool();
  await go("wall");
}
async function select(
  media: MediaItem,
  index: number,
  event: MouseEvent | KeyboardEvent,
): Promise<void> {
  if (event.shiftKey && selectedIndex.value !== null) {
    await library.selectRange(selectedIndex.value, index).catch(error);
  } else library.select(media);
  selectedIndex.value = index;
}
async function selectAll(): Promise<void> {
  try {
    await library.selectRange(0, library.total - 1);
  } catch (e) {
    error(e);
  }
}
async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await panelElement.value?.requestFullscreen();
  } catch {
    notify("当前窗口暂时无法进入全屏");
  }
}
async function privacyHide(): Promise<void> {
  closeModal();
  wallPickerOpen.value = false;
  pickerTarget.value = null;
  wall.hide();
  await nextTick();
  if (window.vexa) await window.vexa.privacyHide().catch(error);
}
function fullscreenChanged(): void {
  fullscreen.value = document.fullscreenElement === panelElement.value;
  void nextTick(measure);
}
function showInfo(id: string): void {
  infoMedia.value = wall.tiles.find((t) => t.id === id)?.media || null;
  openModal("info");
}
async function reveal(media: MediaItem): Promise<void> {
  try {
    await window.vexa?.reveal(media.id);
  } catch {
    notify("文件暂时不可访问，请检查文件或外接盘");
  }
}
function size(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
function time(seconds: number | null): string {
  return seconds === null
    ? "--:--"
    : `${Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0")}:${Math.floor(seconds % 60)
        .toString()
        .padStart(2, "0")}`;
}
function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}
function image(media: MediaItem): string {
  return `vexa-media://thumb/${media.id}?v=${media.mtime}`;
}
async function cycleTheme(): Promise<void> {
  const theme = settings.resolvedTheme === "dark" ? "light" : "dark";
  try {
    await settings.set({ theme });
    notify(theme === "light" ? "已切换到浅色主题" : "已切换到深色主题");
  } catch (e) {
    error(e);
  }
}
async function removeFolder(id: string): Promise<void> {
  if (!confirm("仅移除此文件夹的索引关联，不会删除任何原始视频。继续吗？"))
    return;
  try {
    await window.vexa?.removeRoot(id);
    await library.load();
    notify("文件夹已从侧栏移除，原文件未改动");
  } catch (e) {
    error(e);
  }
}
function keyboard(event: KeyboardEvent): void {
  keyboardNavigation.value = true;
  if (fullscreen.value && controlsIdle.value && event.key === "Tab") {
    event.preventDefault();
    wakeControls();
    void nextTick(() =>
      panelElement.value
        ?.querySelector<HTMLElement>(".wall-toolbar button:not(:disabled)")
        ?.focus(),
    );
    return;
  }
  wakeControls();
  if (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === "h"
  ) {
    event.preventDefault();
    void privacyHide();
    return;
  }
  if (wall.privacy) return;
  if (event.key === "Tab" && modal.value) {
    const elements = [
      ...(modalElement.value?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input,select,[tabindex="0"]',
      ) || []),
    ];
    const first = elements[0],
      last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
    return;
  }
  if (event.key === "Escape") {
    if (modal.value) closeModal();
    else if (wallPickerOpen.value) closePicker();
    else if (wallControlsOpen.value) wallControlsOpen.value = false;
    else if (countMenu.value) countMenu.value = false;
    else if (wall.zoomed) wall.zoomed = null;
    return;
  }
  if (
    modal.value ||
    (event.target as HTMLElement).closest(
      'input,textarea,select,[role="combobox"],[contenteditable="true"]',
    )
  )
    return;
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "a" &&
    isLibrary.value
  ) {
    event.preventDefault();
    selectAll();
    return;
  }
  if (event.key === "/") {
    event.preventDefault();
    searchElement.value?.focus();
    return;
  }
  if (view.value !== "wall") return;
  if (event.key === " ") {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    wall.toggleAll();
  } else if (event.key.toLowerCase() === "r" && !event.repeat && wall.hovered) {
    const tile = wall.tiles.find((t) => t.id === wall.hovered);
    if (tile && !tile.locked) void shuffle(tile.id);
    else notify("这个画面已锁定");
  } else if (event.key.toLowerCase() === "k" && wall.focused)
    wall.toggle(wall.focused);
  else if (event.key.toLowerCase() === "m") {
    wall.muted = !wall.muted;
    wall.sync();
  } else if (event.key.toLowerCase() === "f") void toggleFullscreen();
  else if (
    (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
    wall.focused
  ) {
    event.preventDefault();
    const tile = wall.tiles.find((t) => t.id === wall.focused);
    if (tile)
      wall.seek(
        tile.id,
        tile.progress + (event.key === "ArrowRight" ? 10 : -10),
      );
  }
}
watch(
  () => library.queryKey,
  (key, previous) => {
    selectedIndex.value = null;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(
      () => {
        if (!isLibrary.value && library.search) view.value = "library";
        void library.load().catch(error);
      },
      JSON.parse(key).search !== JSON.parse(previous).search ? 180 : 0,
    );
  },
);
watch(
  () => wall.tiles.length,
  () => {
    if (!wall.tiles.length) wallControlsOpen.value = false;
    return nextTick(measure);
  },
);
watch(wallControlsOpen, (open) => {
  if (open) countMenu.value = false;
});
watch(countMenu, (open) => {
  if (open) wallControlsOpen.value = false;
});
watch([view, modal], () => {
  if (isLibrary.value || modal.value) wallControlsOpen.value = false;
  if (modal.value || (view.value !== "wall" && view.value !== "home")) {
    wallPickerOpen.value = false;
    pickerTarget.value = null;
  }
});
onMounted(async () => {
  try {
    await settings.init();
    await library.load();
    unsubscribe = library.subscribe(error);
    unsubscribeDownloads = await downloads.init();
    unsubscribePrivacy =
      window.vexa?.onPrivacy(() => {
        if (wall.privacy) wall.hide();
      }) || (() => {});
    ready.value = true;
    await nextTick();
    resizeObserver = new ResizeObserver(measure);
    if (wallElement.value) resizeObserver.observe(wallElement.value);
    measure();
  } catch (e) {
    ready.value = true;
    error(e);
  }
  document.addEventListener("keydown", keyboard);
  document.addEventListener("keydown", keyboardActivity, true);
  document.addEventListener("fullscreenchange", fullscreenChanged);
  window.addEventListener("pointerup", pointerEnd);
  window.addEventListener("pointercancel", pointerEnd);
  window.addEventListener("blur", pointerEnd);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  unsubscribe();
  unsubscribePrivacy();
  unsubscribeDownloads();
  document.removeEventListener("keydown", keyboard);
  document.removeEventListener("keydown", keyboardActivity, true);
  document.removeEventListener("fullscreenchange", fullscreenChanged);
  window.removeEventListener("pointerup", pointerEnd);
  window.removeEventListener("pointercancel", pointerEnd);
  window.removeEventListener("blur", pointerEnd);
  clearTimeout(searchTimer);
  clearTimeout(toastTimer);
});
</script>

<template>
  <div class="app-shell" @dragover.prevent @drop="drop">
    <aside class="sidebar">
      <button class="brand" aria-label="Vexa 首页" @click="go('home')">
        <span class="brand-mark"
          ><svg viewBox="0 0 32 32" fill="none">
            <path
              d="m5 7 8.5 18a2.8 2.8 0 0 0 5 0L27 7"
              stroke="currentColor"
              stroke-width="5"
              stroke-linecap="round"
            />
            <path
              d="m17 7 4 8"
              stroke="currentColor"
              stroke-width="4"
              stroke-linecap="round"
              opacity=".5"
            /></svg></span
        ><span>vexa<span class="brand-dot">.</span></span
        ><small>PLAYER</small>
      </button>
      <div class="space-label">
        你的私人放映室<span class="online-dot"></span>
      </div>
      <div class="nav-caption">工作空间</div>
      <nav aria-label="主导航" class="main-nav">
        <button
          class="nav-item"
          :class="{ active: view === 'wall' || view === 'home' }"
          @click="go('wall')"
        >
          <Icon name="wall" />播放墙<span
            v-if="wall.tiles.length"
            class="nav-count"
            >{{ wall.tiles.length }}</span
          ></button
        ><button
          class="nav-item"
          :class="{ active: view === 'library' }"
          @click="go('library')"
        >
          <Icon name="library" />视频库<span class="nav-count">{{
            library.allTotal
          }}</span></button
        ><button
          class="nav-item"
          :class="{ active: view === 'favorites' }"
          @click="go('favorites')"
        >
          <Icon name="heart" />我的收藏
        </button>
        <button
          class="nav-item"
          :class="{ active: view === 'downloads' }"
          @click="go('downloads')"
        >
          <Icon name="download" />下载<span
            v-if="downloads.pending"
            class="nav-count"
            >{{ downloads.pending }}</span
          >
        </button>
      </nav>
      <div class="nav-caption folder-caption">
        我的文件夹<button
          class="icon-button tiny"
          aria-label="添加文件夹"
          @click="importFiles('folders')"
        >
          <Icon name="plus" :size="14" />
        </button>
      </div>
      <div class="folder-list">
        <button
          class="folder-item"
          :class="{ selected: isLibrary && !library.rootId }"
          @click="go('library')"
        >
          <span class="folder-dot"></span><span>全部视频</span
          ><small>{{ library.allTotal }}</small>
        </button>
        <div
          v-for="(root, index) in library.roots"
          :key="root.id"
          class="folder-row"
        >
          <button
            class="folder-item"
            :class="{
              selected: library.rootId === root.id,
              unavailable: !root.available,
            }"
            :title="root.path"
            @click="go('library', root.id)"
          >
            <span
              class="folder-dot"
              :style="{
                background: ['#9fb9a6', '#c3a180', '#899ac1'][index % 3],
              }"
            ></span
            ><span>{{ folderName(root.path) }}</span
            ><Icon v-if="!root.available" name="warning" :size="12" /></button
          ><button
            class="folder-remove"
            title="移除文件夹关联"
            aria-label="移除文件夹关联"
            @click="removeFolder(root.id)"
          >
            <Icon name="close" :size="12" />
          </button>
        </div>
        <p v-if="!library.roots.length" class="folder-empty">
          让喜欢的文件夹，在这里安家。
        </p>
      </div>
      <button class="sidebar-import" @click="openModal('import')">
        <Icon name="plus" :size="15" />导入本地视频
      </button>
      <div class="sidebar-bottom">
        <div class="privacy-card">
          <Icon name="shield" :size="19" />
          <div>
            <strong>只属于你的空间</strong><span>文件留在本地，喜欢也是。</span>
          </div>
          <span class="online-dot"></span>
        </div>
        <button class="settings-link" @click="openModal('settings')">
          <Icon name="settings" :size="17" />偏好设置<Icon
            :name="settings.resolvedTheme === 'dark' ? 'moon' : 'sun'"
            :size="13"
          />
        </button>
        <div class="sidebar-footnote">
          <span>VEXA PLAYER</span><span>v{{ appVersion }}</span>
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb">
          工作空间<span>/</span
          ><strong>{{
            isLibrary
              ? view === "favorites"
                ? "我的收藏"
                : "视频库"
              : view === "downloads"
                ? "下载"
                : "播放墙"
          }}</strong
          ><span class="version-tag">EARLY ACCESS</span>
        </div>
        <label class="search-field"
          ><Icon name="search" :size="14" /><input
            ref="searchElement"
            v-model="library.search"
            placeholder="寻找一个喜欢的画面…"
            aria-label="搜索视频"
          /><kbd>/</kbd></label
        >
        <div class="topbar-actions">
          <button
            class="icon-button theme-shortcut"
            :title="
              settings.resolvedTheme === 'dark'
                ? '切换浅色主题'
                : '切换深色主题'
            "
            :aria-label="
              settings.resolvedTheme === 'dark'
                ? '切换浅色主题'
                : '切换深色主题'
            "
            @click="cycleTheme"
          >
            <Icon
              :name="settings.resolvedTheme === 'dark' ? 'sun' : 'moon'"
            /></button
          ><button
            class="icon-button"
            title="隐藏并静音 Ctrl+Shift+H"
            aria-label="隐藏并静音"
            @click="privacyHide"
          >
            <Icon name="eye" />
          </button>
        </div>
      </header>
      <main>
        <section class="page-heading">
          <div>
            <div class="eyebrow"><span></span>YOUR OWN LITTLE CINEMA</div>
            <h1>{{ heading }}<span class="title-dot">.</span></h1>
            <p>{{ subtitle }}</p>
          </div>
          <div v-if="view !== 'downloads'" class="heading-actions">
            <button
              v-if="isLibrary"
              class="button secondary"
              :disabled="library.scanning || !library.roots.length"
              @click="refresh"
            >
              <Icon name="refresh" :size="15" />刷新文件夹</button
            ><button class="button primary" @click="openModal('import')">
              <Icon name="plus" :size="15" />{{
                isLibrary ? "导入视频" : "添加视频"
              }}
            </button>
          </div>
        </section>
        <div v-if="!desktop" class="browser-notice">
          <Icon
            name="info"
            :size="15"
          />当前为界面预览。请启动桌面版，使用本地导入与播放。
        </div>
        <div v-if="!ready" class="initial-loading">
          <Icon name="loading" :size="26" />正在打开你的放映室…
        </div>
        <DownloadsPanel v-if="ready" v-show="view === 'downloads'" />
        <div
          v-show="!isLibrary && view !== 'downloads' && ready"
          class="view-panel"
        >
          <section
            ref="panelElement"
            class="wall-panel"
            :class="{
              'is-fullscreen': fullscreen,
              'controls-idle': controlsIdle,
              'has-wall-controls': wallControlsOpen,
            }"
            :style="{ '--wall-controls-height': `${wallControlsHeight}px` }"
            @pointermove="pointerActivity"
            @pointerenter="pointerActivity"
            @pointerdown.capture="pointerStart"
            @focusin="controlFocus"
            @focusout="controlsFocused = false"
          >
            <div class="wall-toolbar">
              <div class="layout-switch" role="group" aria-label="布局模式">
                <button
                  v-for="layout in layouts"
                  :key="layout.id"
                  :class="{ selected: settings.values.layout === layout.id }"
                  @click="changeLayout(layout.id)"
                >
                  <Icon :name="layout.icon" :size="14" />{{ layout.name }}
                </button>
              </div>
              <div class="wall-toolbar-right">
                <button
                  class="wall-add-button"
                  aria-label="播放中添加视频"
                  :aria-expanded="wallPickerOpen"
                  @click="openPicker()"
                  @keydown.space.stop
                  @keydown.enter.stop
                ><Icon name="plus" :size="14" />添加视频</button>
                <SelectMenu
                  v-model="scope"
                  label="随机来源"
                  compact
                  :options="
                    [
                      { value: 'current', label: '当前筛选' },
                      { value: 'all', label: '全部视频库' },
                    ] as const
                  "
                />
                <div class="count-control">
                  <button
                    class="subtle-button"
                    :aria-expanded="countMenu"
                    @click="countMenu = !countMenu"
                  >
                    <strong>{{ wall.tiles.length }}</strong> 个画面<Icon
                      name="chevron"
                      :size="12"
                    />
                  </button>
                  <div v-if="countMenu" class="count-popover">
                    <span>选择画面数量</span>
                    <div>
                      <button
                        v-for="count in WALL_TILE_PRESETS"
                        :key="count"
                        :class="{ selected: wall.tiles.length === count }"
                        @click="setCount(count)"
                      >
                        {{ count }}
                      </button>
                    </div>
                    <small
                      >{{
                        HIGH_WALL_TILE_COUNT
                      }}
                      路起提示资源占用，锁定的画面会被保留</small
                    >
                  </div>
                </div>
                <button
                  v-if="wall.tiles.length > 1"
                  class="resource-button"
                  :class="{ active: wall.resourceMode }"
                  :aria-pressed="wall.resourceMode"
                  :aria-label="
                    wall.resourceMode ? '恢复暂停画面' : '暂停非主画面'
                  "
                  @click="wall.toggleResource()"
                >
                  <Icon name="wave" :size="14" />{{
                    wall.resourceMode ? "恢复画面" : "省资源"
                  }}
                </button>
                <span class="toolbar-divider"></span
                ><button
                  class="icon-button"
                  :disabled="!wall.tiles.length"
                  title="根据当前视频比例重新排布，播放继续"
                  aria-label="重新排布画面"
                  @click="layoutRevision++"
                >
                  <Icon name="refresh" /></button
                ><button
                  class="icon-button"
                  title="切换完整显示与铺满"
                  aria-label="切换画面适配"
                  @click="
                    settings
                      .set({
                        fit:
                          settings.values.fit === 'contain'
                            ? 'cover'
                            : 'contain',
                      })
                      .catch(error)
                  "
                >
                  <Icon name="crop" /></button
                ><button
                  class="icon-button"
                  title="全屏 F"
                  aria-label="全屏播放墙"
                  @click="toggleFullscreen"
                >
                  <Icon name="expand" />
                </button>
              </div>
            </div>
            <div
              v-if="
                !wall.resourceMode &&
                (strugglingCount || wall.tiles.length >= HIGH_WALL_TILE_COUNT)
              "
              class="performance-notice"
              role="status"
            >
              <Icon :name="strugglingCount ? 'warning' : 'info'" :size="14" />
              <span v-if="strugglingCount"
                >{{ strugglingCount }} 个画面持续掉帧，试试暂停非主画面</span
              >
              <span v-else
                >已开启
                {{
                  wall.tiles.length
                }}
                个画面，资源占用较高；卡顿时可减少画面或开启省资源。</span
              >
              <button @click="wall.toggleResource()">开启省资源</button>
            </div>
            <div
              ref="wallElement"
              class="video-wall"
              :class="{
                'is-zoomed': !!wall.zoomed,
                'count-many': wall.tiles.length > 6,
              }"
            >
              <VideoTile
                v-for="tile in mountedTiles"
                :key="tile.id"
                :tile="tile"
                :index="wall.tiles.findIndex((t) => t.id === tile.id)"
                :is-main="
                  settings.values.layout === 'focus' &&
                  wall.tiles[0]?.id === tile.id
                "
                :style="tileStyle(tile.id)"
                @shuffle="shuffle"
                @replace="openPicker"
                @info="showInfo"
                @error="error"
              />
              <div v-if="!wall.tiles.length" class="welcome-state">
                <div class="welcome-art" aria-hidden="true">
                  <div class="art-card art-one">
                    <Icon name="film" :size="26" />
                  </div>
                  <div class="art-card art-two">
                    <Icon name="play" :size="32" />
                  </div>
                  <div class="art-card art-three">
                    <Icon name="sparkles" :size="24" />
                  </div>
                  <span class="art-spark spark-one">✳</span
                  ><span class="art-spark spark-two">+</span>
                </div>
                <div class="welcome-eyebrow">
                  A SPACE FOR EVERYTHING YOU LOVE
                </div>
                <h2>好画面，值得一起看。</h2>
                <p>
                  导入本地视频，开启一场只属于你的放映。<br />从一个画面，到整个喜欢的世界。
                </p>
                <div class="welcome-actions">
                  <button
                    class="button primary"
                    @click="importFiles('folders')"
                  >
                    <Icon name="folder" :size="16" />导入文件夹</button
                  ><button
                    class="button secondary"
                    @click="importFiles('files')"
                  >
                    选择视频
                  </button>
                </div>
                <button
                  v-if="library.allTotal"
                  class="text-button"
                  @click="go('library')"
                >
                  浏览已导入的 {{ library.allTotal }} 个视频<Icon
                    name="arrow"
                    :size="13"
                  /></button
                ><span class="welcome-privacy"
                  ><Icon name="shield" :size="13" />完全离线 · 不记录观看历史 ·
                  不修改原文件</span
                >
              </div>
            </div>
            <div class="wall-hint">
              <span class="live-dot"></span
              ><span>{{
                wall.tiles.length
                  ? `${wall.tiles.length} 个画面，${wall.playing ? "正在放映" : "已暂停"}`
                  : "准备好，遇见下一幕"
              }}</span>
              <button
                v-if="wall.removed"
                class="text-button wall-undo"
                :title="`恢复 ${wall.removed.tile.media.name}，保留原进度`"
                aria-label="撤销移出画面"
                @click="undoRemove"
                @keydown.space.stop
                @keydown.enter.stop
              ><Icon name="back" :size="12" />撤销移出</button>
              <div class="wall-hint-actions">
                <span class="wall-hint-right"
                  >悬停画面，按
                  <kbd>R</kbd> 邂逅下一幕<span>·</span>双击放大</span
                ><WallControls
                  v-model:open="wallControlsOpen"
                  :fullscreen="fullscreen"
                  @height="
                    (height) => {
                      if (height) wallControlsHeight = height;
                    }
                  "
                />
              </div>
            </div>
            <Transition name="controls-popover">
              <WallMediaDrawer
                v-if="wallPickerOpen"
                :target-id="pickerTarget"
                :fullscreen="fullscreen"
                :revision="library.revision"
                @close="closePicker"
                @choose="chooseForWall"
                @replace="openPicker"
                @import="importDuringPlayback"
              />
            </Transition>
          </section>
          <section class="global-player" aria-label="全局播放控制">
            <div class="player-context">
              <span class="player-art"><Icon name="wave" :size="21" /></span>
              <div>
                <strong
                  >{{
                    wall.tiles.length
                      ? wall.playing
                        ? "自由放映中"
                        : "放映已暂停"
                      : "等待你的第一幕"
                  }}<span
                    class="tiny-live"
                    :class="{ paused: !wall.playing }"
                  ></span></strong
                ><span
                  >{{ layoutName }}布局 · {{ wall.tiles.length }} 个画面</span
                >
              </div>
            </div>
            <div class="transport">
              <button
                class="icon-button"
                :disabled="!wall.tiles.length"
                aria-label="全部后退十秒"
                title="后退 10 秒"
                @click="wall.seekAll(-10)"
              >
                <Icon name="back" /></button
              ><button
                class="play-button"
                :disabled="!wall.tiles.length"
                :aria-label="wall.playing ? '全部暂停' : '播放全部'"
                title="播放 / 暂停 Space"
                @click="wall.toggleAll()"
              >
                <Icon
                  :name="wall.playing ? 'pause' : 'play'"
                  :size="19"
                /></button
              ><button
                class="icon-button"
                :disabled="!wall.tiles.length"
                aria-label="全部前进十秒"
                title="前进 10 秒"
                @click="wall.seekAll(10)"
              >
                <Icon name="forward" /></button
              ><span class="toolbar-divider"></span
              ><button
                class="icon-button accent"
                :disabled="!wall.tiles.length"
                aria-label="随机换片"
                title="更换未锁定画面"
                @click="shuffle()"
              >
                <Icon name="shuffle" /></button
              ><label class="global-seek" title="跳转到各自时长的相同百分比"
                ><Icon name="sliders" :size="16" /><input
                  type="range"
                  min="0"
                  max="100"
                  value="0"
                  :disabled="!wall.tiles.length"
                  aria-label="全局百分比跳转"
                  @change="
                    wall.seekPercent(
                      Number(($event.target as HTMLInputElement).value),
                    )
                  "
              /></label>
            </div>
            <div class="player-right">
              <button
                class="icon-button"
                :aria-pressed="wall.muted"
                :aria-label="wall.muted ? '取消全局静音' : '全局静音'"
                @click="
                  wall.muted = !wall.muted;
                  wall.sync();
                "
              >
                <Icon :name="wall.muted ? 'muted' : 'volume'" /></button
              ><input
                type="range"
                min="0"
                max="1"
                step=".01"
                :value="wall.volume"
                aria-label="全局音量"
                @input="
                  wall.setVolume(
                    Number(($event.target as HTMLInputElement).value),
                  )
                "
              /><button
                class="icon-button"
                title="偏好设置"
                aria-label="打开偏好设置"
                @click="openModal('settings')"
              >
                <Icon name="sliders" />
              </button>
            </div>
          </section>
          <section class="discovery-section">
            <div class="section-heading">
              <h2>
                {{ library.allTotal ? "下一幕，看点什么" : "放映，可以很简单"
                }}<span>{{
                  library.allTotal
                    ? "从你的视频库，发现一点新鲜感"
                    : "留住喜欢，其他的交给 Vexa"
                }}</span>
              </h2>
              <button class="text-button" @click="go('library')">
                打开视频库<Icon name="arrow" :size="13" />
              </button>
            </div>
            <div v-if="library.items.length" class="discovery-strip">
              <button
                v-for="media in library.items.slice(0, 5)"
                :key="media.id"
                class="discovery-card"
                @click="add(media)"
              >
                <div class="thumb">
                  <img
                    v-if="media.thumbnail"
                    :src="image(media)"
                    alt=""
                    loading="lazy"
                  /><Icon v-else name="film" :size="30" /><span
                    class="thumb-duration"
                    >{{ time(media.duration) }}</span
                  ><span class="thumb-add"><Icon name="plus" /></span>
                </div>
                <strong>{{ media.name }}</strong
                ><span
                  >{{ media.height ? `${media.height}P` : "正在读取" }} ·
                  {{ size(media.size) }}</span
                >
              </button>
            </div>
            <div v-else class="intro-cards">
              <div>
                <span class="intro-icon"><Icon name="wall" :size="22" /></span
                ><strong>一起看，刚刚好</strong>
                <p>1～{{ MAX_WALL_TILES }} 个画面，随心排列。</p>
              </div>
              <div>
                <span class="intro-icon"
                  ><Icon name="shuffle" :size="22" /></span
                ><strong>下一幕，也许更喜欢</strong>
                <p>一键随机，锁住心动的画面。</p>
              </div>
              <div>
                <span class="intro-icon"><Icon name="sun" :size="22" /></span
                ><strong>你的空间，你的色调</strong>
                <p>深色、浅色，或跟随系统。</p>
              </div>
            </div>
          </section>
        </div>
        <div v-show="isLibrary && ready" class="view-panel library-view">
          <div class="library-toolbar">
            <div class="library-pills">
              <button
                :class="{ selected: !library.rootId }"
                @click="
                  library.rootId = '';
                  library.load().catch(error);
                "
              >
                全部视频</button
              ><span>{{ library.total }} 个视频</span>
            </div>
            <div class="library-actions">
              <button
                class="button secondary small"
                :disabled="!library.total || library.loading || library.selecting"
                :aria-busy="library.selecting"
                aria-label="全选当前列表"
                title="选择当前筛选结果中的全部视频（Ctrl+A）"
                @click="selectAll"
              >
                <Icon :name="library.selecting ? 'loading' : 'check'" :size="14" />
                {{ library.selecting ? "选择中…" : "全选" }}
              </button>
              <div class="sort-controls">
                <SelectMenu
                  v-model="library.sort"
                  label="视频排序"
                  :options="
                    [
                      { value: 'name', label: '名称' },
                      { value: 'duration', label: '时长' },
                      { value: 'size', label: '文件大小' },
                      { value: 'width', label: '分辨率' },
                      { value: 'path', label: '路径' },
                    ] as const
                  "
                /><button
                  class="icon-button"
                  aria-label="切换排序方向"
                  @click="
                    library.direction =
                      library.direction === 'asc' ? 'desc' : 'asc'
                  "
                >
                  <Icon name="sliders" :size="15" />
                </button>
              </div>
            </div>
          </div>
          <LibraryFilters @error="error" />
          <VirtualMediaGrid
            v-if="library.total"
            :total="library.total"
            :size="settings.values.thumbnailSize"
            :active="isLibrary && ready"
            :revision="library.revision"
            :reset-key="library.resetKey"
            :get-item="library.itemAt"
            @range="(start, end) => library.loadRange(start, end).catch(error)"
          >
            <template #default="{ media, index }"
              ><MediaCard
                :media="media"
                :selected="library.selection.has(media.id)"
                @select="(event) => select(media, index, event)"
                @play="add(media)"
                @favorite="library.favorite(media).catch(error)"
                @reveal="reveal(media)"
            /></template>
          </VirtualMediaGrid>
          <div v-else-if="!library.loading" class="library-empty">
            <Icon
              :name="view === 'favorites' ? 'heart' : 'library'"
              :size="37"
            />
            <h2>
              {{
                library.hasFilters
                  ? "还没有找到这个画面"
                  : view === "favorites"
                    ? "把喜欢的片刻，留在这里。"
                    : "你的视频库，等你来填满。"
              }}
            </h2>
            <p>
              {{
                library.hasFilters
                  ? "调整筛选条件，看看更多喜欢的片刻。"
                  : "导入文件或文件夹，所有内容只保存在你的设备。"
              }}
            </p>
            <button
              v-if="library.hasFilters"
              class="button secondary"
              @click="library.resetFilters()"
            >
              清除筛选
            </button>
            <button v-else class="button primary" @click="openModal('import')">
              导入本地视频
            </button>
          </div>
          <div class="library-list-status" role="status">
            {{
              library.selecting
                ? "正在选择视频…"
                : library.loading
                  ? "正在更新视频库…"
                  : library.total
                    ? `${library.total} 个视频 · 滚动浏览全部`
                    : ""
            }}
          </div>
          <div v-if="library.selection.size" class="selection-bar">
            <span
              >已选 <strong>{{ library.selection.size }}</strong> 个<span
                v-if="library.selection.size > MAX_WALL_TILES"
                >（最多同时播放 {{ MAX_WALL_TILES }} 个）</span
              ></span
            ><button class="text-button" @click="library.selection.clear()">
              取消选择</button
            ><button
              v-if="wall.focused && library.selection.size === 1"
              class="button secondary small"
              @click="playSelected(true)"
            >
              替换焦点画面</button
            ><button class="button primary" @click="playSelected()">
              <Icon name="play" :size="14" />创建播放墙
            </button>
          </div>
        </div>
        <footer class="workspace-footer">
          <span
            ><span class="online-dot"></span
            >本地优先<span>·</span>你的文件，始终属于你</span
          ><span
            >为每一个喜欢的瞬间而造<span class="footer-star">✳</span></span
          >
        </footer>
      </main>
    </div>
    <div
      v-if="library.progress"
      class="scan-status"
      :class="{ finished: !library.scanning }"
    >
      <Icon :name="library.scanning ? 'loading' : 'check'" :size="15" />
      <div>
        <strong>{{ scanTitle }}</strong
        ><span
          >发现 {{ library.progress.discovered }} · 完成
          {{ library.progress.completed }} · 失败 {{ library.progress.failed
          }}<template v-if="library.progress.skipped">
            · 跳过 {{ library.progress.skipped }}</template
          ></span
        >
      </div>
      <button
        v-if="library.scanning"
        class="text-button"
        @click="desktopApi?.cancelScan().catch(error)"
      >
        取消</button
      ><button
        v-else
        class="icon-button tiny"
        aria-label="关闭扫描状态"
        @click="library.progress = null"
      >
        <Icon name="close" :size="13" />
      </button>
    </div>
    <Transition name="toast"
      ><div v-if="toastMessage" class="toast-message" role="status">
        <Icon name="info" :size="15" />{{ toastMessage }}
      </div></Transition
    >
    <Transition name="modal"
      ><div v-if="modal" class="modal-backdrop" @click.self="closeModal">
        <section
          ref="modalElement"
          class="modal"
          :class="{ 'settings-modal': modal === 'settings' }"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modalTitle"
        >
          <button
            class="icon-button modal-close"
            aria-label="关闭弹窗"
            @click="closeModal"
          >
            <Icon name="close" /></button
          ><SettingsPanel
            v-if="modal === 'settings'"
            @error="error"
            @notify="notify"
          /><template v-else-if="modal === 'import'"
            ><div class="modal-eyebrow">MAKE ROOM FOR YOUR FAVORITES</div>
            <h2 id="modalTitle">
              把喜欢的，带进来<span class="title-dot">.</span>
            </h2>
            <p class="modal-description">
              文件始终留在你的设备，Vexa 只负责好好放映。
            </p>
            <button class="drop-zone" @click="importFiles('files')">
              <Icon name="upload" :size="32" /><strong>拖入文件或文件夹</strong
              ><span>也可以点击选择多个视频</span></button
            ><label class="check-row"
              ><input
                type="checkbox"
                v-model="recursive"
              />包含文件夹中的子文件夹</label
            >
            <p class="modal-note">
              导入后建立本地索引并按需生成封面，不移动、重命名或修改原始文件。支持情况取决于具体编码。
            </p>
            <div class="modal-actions">
              <button class="button secondary" @click="importFiles('files')">
                <Icon name="film" :size="15" />选择视频</button
              ><button class="button primary" @click="importFiles('folders')">
                <Icon name="folder" :size="15" />选择文件夹
              </button>
            </div></template
          ><template v-else-if="infoMedia"
            ><div class="modal-eyebrow">A CLOSER LOOK</div>
            <h2 id="modalTitle">
              画面里的细节<span class="title-dot">.</span>
            </h2>
            <p class="media-info-name">{{ infoMedia.name }}</p>
            <dl class="detail-list">
              <div>
                <dt>视频编码</dt>
                <dd>{{ infoMedia.codec?.toUpperCase() || "未知" }}</dd>
              </div>
              <div>
                <dt>音频编码</dt>
                <dd>{{ infoMedia.audioCodec || "无或未知" }}</dd>
              </div>
              <div>
                <dt>分辨率</dt>
                <dd>
                  {{ infoMedia.width || "--" }} × {{ infoMedia.height || "--" }}
                </dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>{{ time(infoMedia.duration) }}</dd>
              </div>
              <div>
                <dt>帧率</dt>
                <dd>{{ infoMedia.fps?.toFixed(2) || "未知" }} fps</dd>
              </div>
              <div>
                <dt>文件大小</dt>
                <dd>{{ size(infoMedia.size) }}</dd>
              </div>
              <div>
                <dt>播放内核</dt>
                <dd>HTML5 Video</dd>
              </div>
              <div>
                <dt>硬件解码</dt>
                <dd>未确认</dd>
              </div>
            </dl>
            <div class="file-path">{{ infoMedia.path }}</div>
            <div class="modal-actions">
              <button class="button primary" @click="reveal(infoMedia)">
                <Icon name="folder" :size="15" />定位原文件
              </button>
            </div></template
          >
        </section>
      </div></Transition
    >
    <Transition name="privacy"
      ><div v-if="wall.privacy" class="privacy-screen">
        <div class="privacy-brand">vexa<span>.</span></div>
        <Icon name="shield" :size="48" />
        <h2>你的片刻，妥善收好。</h2>
        <p>画面已隐藏，播放已暂停。</p>
        <button
          class="button primary"
          @click="
            wall.privacy = false;
            notify('画面已恢复，按空格继续播放');
          "
        >
          <Icon name="eye" :size="16" />回到放映室</button
        ><span>恢复后保持暂停，由你决定何时继续。</span>
      </div></Transition
    >
  </div>
</template>
