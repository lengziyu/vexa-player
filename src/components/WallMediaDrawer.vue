<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { MediaItem } from "../shared/contracts";
import { MAX_WALL_TILES } from "../shared/contracts";
import { useWall } from "../stores/wall";
import Icon from "./Icon.vue";

const props = defineProps<{ targetId: string | null; fullscreen: boolean; revision: number }>();
const emit = defineEmits<{
  close: [];
  choose: [media: MediaItem];
  replace: [id: string | null];
  import: [];
}>();
const wall = useWall(),
  tab = ref<"library" | "playing">("library"),
  search = ref(""),
  favorites = ref(false),
  items = ref<MediaItem[]>([]),
  total = ref(0),
  offset = ref(0),
  loading = ref(false),
  failure = ref(""),
  announcement = ref(""),
  searchInput = ref<HTMLInputElement>(),
  list = ref<HTMLElement>();
const pageSize = 40;
let epoch = 0, disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
const target = computed(() => wall.tiles.find((tile) => tile.id === props.targetId));
const targetIndex = computed(() => wall.tiles.findIndex((tile) => tile.id === props.targetId) + 1);
const full = computed(() => wall.tiles.length >= MAX_WALL_TILES);
const unavailable = (media: MediaItem) => media.status === "missing" || media.status === "error";
const duration = (value: number | null) => {
  const seconds = Math.floor(value || 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
async function load(): Promise<void> {
  const request = ++epoch;
  loading.value = true;
  failure.value = "";
  try {
    if (!window.vexa) throw new Error("请在桌面版中选择本地视频");
    const result = await window.vexa.queryLibrary({
      search: search.value, favorites: favorites.value,
      offset: offset.value, limit: pageSize, sort: "name", direction: "asc",
    });
    if (request !== epoch || disposed) return;
    if (offset.value > 0 && offset.value >= result.total) {
      offset.value = Math.max(0, Math.floor((result.total - 1) / pageSize) * pageSize);
      return await load();
    }
    items.value = result.items;
    total.value = result.total;
    await nextTick();
    list.value?.scrollTo({ top: 0 });
  } catch (error) {
    if (request === epoch && !disposed) {
      items.value = [];
      failure.value = error instanceof Error ? error.message : "读取视频库失败，请重试";
    }
  } finally {
    if (request === epoch && !disposed) loading.value = false;
  }
}
function schedule(reset = false): void {
  clearTimeout(timer);
  ++epoch;
  loading.value = true;
  if (reset) offset.value = 0;
  timer = setTimeout(() => void load(), 180);
}
function choose(media: MediaItem): void {
  if (loading.value || unavailable(media)) return;
  if (props.targetId && (!target.value || target.value.media.id === media.id)) return;
  if (!props.targetId && full.value) return;
  const replacing = !!props.targetId;
  emit("choose", media);
  announcement.value = `${replacing ? "已替换为" : "已添加"} ${media.name}`;
}
function changePage(delta: number): void {
  offset.value = Math.max(0, offset.value + delta * pageSize);
  void load();
}
function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "h") return;
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}
watch([search, favorites], () => schedule(true));
watch(() => props.revision, () => schedule());
watch(() => props.targetId, () => {
  tab.value = "library";
  announcement.value = "";
  void nextTick(() => searchInput.value?.focus({ preventScroll: true }));
});
onMounted(() => {
  void load();
  searchInput.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => { disposed = true; ++epoch; clearTimeout(timer); });
</script>

<template>
  <aside
    class="wall-media-drawer"
    :class="{ 'is-fullscreen': fullscreen }"
    role="region"
    aria-label="播放墙选片"
    @keydown="onKeydown"
  >
    <header>
      <div><strong>{{ targetId ? "替换画面" : "添加视频" }}</strong><small>其他画面继续播放</small></div>
      <button class="icon-button tiny" aria-label="关闭选片侧栏" @click="emit('close')"><Icon name="close" :size="15" /></button>
    </header>
    <div v-if="targetId" class="picker-target">
      <span v-if="target" :title="target.media.name">替换第 {{ targetIndex }} 个画面 · {{ target.media.name }}</span>
      <span v-else>原画面已移出，请重新选择画面</span>
      <button class="text-button" @click="emit('replace', null)">改为添加</button>
    </div>
    <div class="picker-tabs" role="group" aria-label="选片来源">
      <button :aria-pressed="tab === 'library'" @click="tab = 'library'">视频库</button>
      <button :aria-pressed="tab === 'playing'" @click="tab = 'playing'">正在播放 · {{ wall.tiles.length }}</button>
      <button class="picker-import" aria-label="播放中导入视频" title="导入本地视频，播放继续" @click="emit('import')"><Icon name="plus" :size="14" />导入</button>
    </div>
    <template v-if="tab === 'library'">
      <div class="picker-search">
        <label><Icon name="search" :size="14" /><input ref="searchInput" v-model="search" type="search" placeholder="搜索视频名称…" aria-label="选片搜索" /></label>
        <button :aria-pressed="favorites" aria-label="选片仅看收藏" :class="{ active: favorites }" title="仅看收藏" @click="favorites = !favorites"><Icon name="heart" :size="15" /></button>
      </div>
      <div ref="list" class="picker-list" :aria-busy="loading">
        <p v-if="failure" class="picker-empty">{{ failure }}<button class="text-button" @click="load">重新加载</button></p>
        <p v-else-if="!items.length" class="picker-empty">{{ loading ? "正在读取视频库…" : search || favorites ? "没有匹配的视频" : "视频库还是空的，先导入一些视频吧" }}</p>
        <article v-for="media in items" :key="media.id" class="picker-item">
          <div class="picker-thumb"><img v-if="media.thumbnail" :src="`vexa-media://thumb/${media.id}`" alt="" loading="lazy" /><Icon v-else name="film" :size="20" /></div>
          <div class="picker-info"><strong :title="media.name">{{ media.name }}</strong><small>{{ unavailable(media) ? "文件不可用" : `${duration(media.duration)} · ${media.height || '—'}P` }}<span v-if="wall.tiles.some(tile => tile.media.id === media.id)"> · 已在播放</span></small></div>
          <button
            class="picker-action"
            :aria-label="`${targetId ? '替换为' : '添加'} ${media.name}`"
            :disabled="loading || unavailable(media) || (targetId ? !target || target.media.id === media.id : full)"
            @click="choose(media)"
          >{{ targetId ? target?.media.id === media.id ? "当前" : "替换" : "添加" }}</button>
        </article>
      </div>
      <footer class="picker-pagination">
        <small>{{ total ? `${offset + 1}–${Math.min(offset + pageSize, total)} / ${total}` : "0 个视频" }}</small>
        <button aria-label="选片上一页" :disabled="loading || offset === 0" @click="changePage(-1)"><Icon name="arrow" :size="13" style="transform: rotate(180deg)" /></button>
        <button aria-label="选片下一页" :disabled="loading || offset + pageSize >= total" @click="changePage(1)"><Icon name="arrow" :size="13" /></button>
      </footer>
    </template>
    <div v-else class="picker-list" aria-label="正在播放的画面">
      <p v-if="!wall.tiles.length" class="picker-empty">还没有画面，切到视频库添加吧</p>
      <article v-for="(tile, index) in wall.tiles" :key="tile.id" class="picker-item">
        <span class="picker-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="picker-info"><strong :title="tile.media.name">{{ tile.media.name }}</strong><small>{{ tile.paused ? "已暂停" : "播放中" }} · {{ duration(tile.progress) }}<span v-if="tile.locked"> · 已锁定</span></small></div>
        <button class="picker-action" :aria-label="`替换第 ${index + 1} 个画面`" @click="emit('replace', tile.id)">替换</button>
        <button class="picker-remove" :aria-label="`移出第 ${index + 1} 个画面`" title="仅移出播放墙，不删除文件；8 秒内可撤销" @click="wall.remove(tile.id, true)"><Icon name="close" :size="14" /></button>
      </article>
    </div>
    <p class="picker-notice" role="status">{{ !targetId && full ? `已达 ${MAX_WALL_TILES} 个画面，可在“正在播放”中替换或移出` : announcement || "选片不暂停播放 · Esc 收起" }}</p>
  </aside>
</template>

<style scoped>
.wall-media-drawer  {
  position: absolute;
  top: 45px;
  right: 0;
  bottom: 31px;
  z-index: 90;
  width: min(360px, 52%);
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px;
  border: 1px solid var(--strong-line);
  border-radius: 12px 0 0 12px;
  background: var(--elevated);
  box-shadow: var(--modal-shadow);
  color: var(--text);
  font-size: 11px;
}
.wall-media-drawer.is-fullscreen  {
  --elevated: #24212b;
  --text: #edeaf2;
  --muted: #b3a5c0;
  --dim: #998aa7;
  --line: #ffffff0d;
  --strong-line: #ffffff26;
  --accent-wash: #b8a0ed20;
  --accent-text: #d2bbf5;
  --bg: #19171e;
}
:global(:root[data-accent="sage"]) .wall-media-drawer.is-fullscreen  {
  --accent-wash: #a3c6b320;
  --accent-text: #b4d7c4;
}
:global(:root[data-accent="sand"]) .wall-media-drawer.is-fullscreen  {
  --accent-wash: #d7b99320;
  --accent-text: #e3c7a7;
}
header, header > div, .picker-target, .picker-tabs, .picker-search, .picker-item, .picker-pagination  {
  display: flex;
  align-items: center;
  gap: 8px;
}
header  {
  justify-content: space-between;
  flex-shrink: 0;
}
header > div  {
  align-items: flex-start;
  flex-direction: column;
  gap: 3px;
}
header strong  {
  font-size: 13px;
  font-weight: 500;
}
small, header small, .picker-notice  {
  color: var(--dim);
  font-size: 10px;
}
.picker-target  {
  padding: 9px 0 0;
  color: var(--accent-text);
  font-size: 10px;
}
.picker-target > span  {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-target .text-button  {
  flex-shrink: 0;
}
.picker-tabs  {
  flex-shrink: 0;
  border-bottom: 1px solid var(--strong-line);
  margin-top: 9px;
  padding-bottom: 7px;
}
.picker-tabs button  {
  padding: 5px 7px;
  border-radius: 5px;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}
.picker-tabs button[aria-pressed="true"], .picker-search button.active  {
  color: var(--accent-text);
  background: var(--accent-wash);
}
.picker-tabs .picker-import  {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
}
.picker-search  {
  flex-shrink: 0;
  margin: 9px 0 4px;
}
.picker-search label  {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--strong-line);
  border-radius: 6px;
  padding: 7px 8px;
  color: var(--dim);
}
.picker-search input  {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 11px;
}
.picker-search button  {
  padding: 7px;
  border-radius: 6px;
  color: var(--muted);
}
.picker-list  {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.picker-item  {
  min-height: 61px;
  border-bottom: 1px solid var(--line);
}
.picker-thumb  {
  flex-shrink: 0;
  width: 59px;
  height: 36px;
  display: grid;
  place-items: center;
  background: var(--accent-wash);
  color: var(--dim);
  overflow: hidden;
  border-radius: 5px;
}
.picker-thumb img  {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.picker-info  {
  flex: 1;
  min-width: 0;
}
.picker-info strong  {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  font-weight: 400;
}
.picker-info small  {
  display: block;
  margin-top: 5px;
  font-size: 9px;
}
.picker-action  {
  border: 1px solid var(--strong-line);
  border-radius: 5px;
  padding: 5px 7px;
  color: var(--accent-text);
  font-size: 10px;
  white-space: nowrap;
}
.picker-action:not(:disabled):hover, .picker-remove:hover, .picker-pagination button:not(:disabled):hover  {
  background: var(--accent-wash);
}
.picker-remove  {
  padding: 5px;
  color: var(--muted);
  border-radius: 5px;
}
.picker-index  {
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
}
.picker-pagination  {
  flex-shrink: 0;
  padding-top: 7px;
}
.picker-pagination small  {
  flex: 1;
}
.picker-pagination button  {
  padding: 5px;
  border-radius: 4px;
  color: var(--muted);
}
.picker-notice  {
  flex-shrink: 0;
  margin: 8px 0 0;
  min-height: 15px;
  font-size: 9px;
}
.picker-empty  {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 12px;
  text-align: center;
  color: var(--muted);
  font-size: 11px;
  padding: 20px 5px;
}
@media (max-width: 650px)  {
  .wall-media-drawer  {
    width: min(320px, 85%);
  }
}
@media (prefers-reduced-motion: reduce)  {
  *  {
    transition: none;
  }
}
</style>
