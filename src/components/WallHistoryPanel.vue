<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useWall } from '../stores/wall';
import { MAX_WALL_HISTORY } from '../shared/wall-history';
import Icon from './Icon.vue';
defineProps<{ fullscreen: boolean }>();
const emit = defineEmits<{ close: []; restored: [message: string | null] }>();
const wall = useWall(), busy = ref(false), failure = ref(''), confirming = ref(false), closeButton = ref<HTMLButtonElement>();
const layout = { grid: '网格', smart: '智能', focus: '主次' };
const date = (value: number) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
async function act(task: () => Promise<void>): Promise<void> {
  if (busy.value) return;
  busy.value = true; failure.value = '';
  try { await task(); }
  catch (error) { failure.value = error instanceof Error ? error.message : '操作失败，请重试'; }
  finally { busy.value = false; }
}
function keyboard(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'h') return;
  event.stopPropagation();
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
}
onMounted(() => { closeButton.value?.focus({ preventScroll: true }); });
</script>
<template>
  <aside class="wall-history-panel" :class="{ 'is-fullscreen': fullscreen }" role="region" aria-label="播放墙历史" @keydown="keyboard">
    <header>
      <div><strong>播放墙历史</strong><small>最近 {{ MAX_WALL_HISTORY }} 组 · 仅保存在本机</small></div>
      <button ref="closeButton" class="icon-button tiny" aria-label="关闭播放墙历史" @click="emit('close')"><Icon name="close" :size="16" /></button>
    </header>
    <p class="history-intro">恢复视频组合、排列和上次进度，替换当前播放墙。</p>
    <p v-if="failure || wall.historyError" class="history-error" role="alert">{{ failure || wall.historyError }}</p>
    <div class="history-list" :aria-busy="busy">
      <div v-if="!wall.history.length" class="history-empty"><Icon name="history" :size="30" /><strong>还没有播放墙历史</strong><span>创建播放墙后自动保存，下次可以接着看。</span></div>
      <article v-for="entry in wall.history" :key="entry.id" class="history-entry" :data-history-id="entry.id">
        <div class="history-thumbs" aria-hidden="true"><img v-for="(tile, i) in entry.tiles.slice(0, 4)" :key="i" :src="`vexa-media://thumb/${tile.mediaId}`" alt="" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'" /></div>
        <div class="history-details"><strong>{{ entry.tiles.length }} 个画面 · {{ layout[entry.layout] }}</strong><time :datetime="new Date(entry.updatedAt).toISOString()">{{ date(entry.updatedAt) }}</time><p :title="entry.tiles.map(tile => tile.name).join('、')">{{ entry.tiles.map(tile => tile.name).join('、') }}</p></div>
        <div class="history-actions"><button class="button secondary small" :disabled="busy" aria-label="恢复这组播放墙" @click="act(async () => { emit('restored', await wall.restoreHistory(entry.id)); })"><Icon name="play" :size="13" />恢复</button><button class="icon-button tiny" :disabled="busy" aria-label="删除这条播放墙历史" title="仅删除这条历史" @click="act(() => wall.deleteHistory(entry.id))"><Icon name="trash" :size="14" /></button></div>
      </article>
    </div>
    <footer>
      <template v-if="confirming"><span>清空所有播放墙历史？</span><button class="text-button" :disabled="busy" @click="act(async () => { await wall.deleteHistory(); confirming = false; })">确认清空</button><button class="text-button" @click="confirming = false">取消</button></template>
      <template v-else><span>删除历史不会删除视频文件</span><button class="text-button" :disabled="busy || !wall.history.length" @click="confirming = true">清空历史</button></template>
    </footer>
  </aside>
</template>
<style scoped>
.wall-history-panel { position: absolute; top: 45px; right: 0; bottom: 31px; z-index: 92; width: min(420px, 90%); display: flex; flex-direction: column; padding: 18px; border: 1px solid var(--strong-line); border-radius: 12px 0 0 12px; background: var(--elevated); box-shadow: var(--modal-shadow); color: var(--text); }
.is-fullscreen { --elevated: #24212b; --text: #edeaf2; --muted: #b3a5c0; --dim: #998aa7; --line: #ffffff0d; --strong-line: #ffffff26; --accent-wash: #b8a0ed20; --accent-text: #d2bbf5; }
header, footer, .history-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
header > div { display: flex; flex-direction: column; gap: 5px; }
header strong { font-size: 14px; font-weight: 500; }
small, time, footer, .history-intro { font-size: 10px; color: var(--muted); }
.history-intro { padding: 14px 0; line-height: 1.7; }
.history-error { color: #e49d8f; font-size: 11px; padding-bottom: 10px; }
.history-list { flex: 1; min-height: 0; overflow: auto; }
.history-entry { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 10px; padding: 14px 0; border-top: 1px solid var(--strong-line); }
.history-thumbs { display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); gap: 2px; height: 58px; border-radius: 6px; overflow: hidden; background: var(--line); }
.history-thumbs img { width: 100%; height: 100%; object-fit: cover; min-height: 0; }
.history-details strong { display: block; font-size: 12px; font-weight: 500; }
.history-details p { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--muted); font-size: 10px; margin-top: 5px; }
.history-actions { grid-column: 2; justify-content: flex-end; }
.history-empty { display: flex; flex-direction: column; gap: 15px; align-items: center; padding: 60px 4px; color: var(--muted); text-align: center; font-size: 11px; }
.history-empty strong { color: var(--text); font-size: 13px; font-weight: 400; }
footer { padding-top: 14px; border-top: 1px solid var(--strong-line); flex-wrap: wrap; }
</style>
