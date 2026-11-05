<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { virtualGrid, gridSelection } from "../core/virtual-grid";
import type { MediaItem, ThumbnailSize } from "../shared/contracts";
const props = defineProps<{
  total: number;
  size: ThumbnailSize;
  active: boolean;
  revision: number;
  resetKey: number;
  getItem: (index: number) => MediaItem | undefined;
  selection: Map<string, MediaItem>;
  busy: boolean;
}>();
const emit = defineEmits<{ range: [start: number, end: number]; selectBox: [indices: number[], additive: boolean] }>();
const element = ref<HTMLElement>(),
  width = ref(1000),
  viewportTop = ref(0),
  viewportHeight = ref(innerHeight);
let observer: ResizeObserver | undefined,
  frame = 0;
const marquee = ref<{ left: number; top: number; right: number; bottom: number } | null>(null);
const hit = computed(() => new Set(marquee.value ? gridSelection({ width: width.value, total: props.total,
  viewportTop: viewportTop.value, viewportHeight: viewportHeight.value, size: props.size }, marquee.value) : []));
let drag: { id: number; x: number; y: number; clientX: number; clientY: number; startX: number; startY: number;
  additive: boolean; base: Set<string>; active: boolean } | null = null;
let scrollFrame = 0, suppressClick = false;
function start(event: PointerEvent): void {
  suppressClick = false;
  if (!props.active || props.busy || event.button !== 0 || event.pointerType === 'touch' ||
      (event.target as HTMLElement).closest('button,input,select,a')) return;
  const rect = element.value!.getBoundingClientRect();
  drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top,
    clientX: event.clientX, clientY: event.clientY, startX: event.clientX, startY: event.clientY,
    additive: event.ctrlKey || event.metaKey || event.shiftKey, base: new Set(props.selection.keys()), active: false };
}
function updateBox(): void {
  if (!drag?.active || !element.value) return;
  const rect = element.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, drag.clientX - rect.left));
  const y = Math.max(0, Math.min(grid.value.height, drag.clientY - rect.top));
  marquee.value = { left: Math.min(drag.x, x), top: Math.min(drag.y, y), right: Math.max(drag.x, x), bottom: Math.max(drag.y, y) };
}
function autoScroll(): void {
  if (!drag?.active) return;
  const edge = 64, y = drag.clientY;
  const velocity = y < edge ? -Math.min(20, (edge - y) / 3) : y > innerHeight - edge ? Math.min(20, (y - innerHeight + edge) / 3) : 0;
  if (velocity) { window.scrollBy(0, velocity); measure(); updateBox(); }
  scrollFrame = requestAnimationFrame(autoScroll);
}
function move(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.id) return;
  drag.clientX = event.clientX; drag.clientY = event.clientY;
  if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 6) {
    drag.active = true;
    element.value?.setPointerCapture(event.pointerId);
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  if (drag.active) { event.preventDefault(); updateBox(); }
}
function end(event?: PointerEvent): void {
  if (event && drag && event.pointerId !== drag.id) return;
  if (drag?.active) {
    if (event?.type === 'pointerup') emit('selectBox', [...hit.value], drag.additive);
    suppressClick = true;
  }
  if (drag && element.value?.hasPointerCapture(drag.id)) element.value.releasePointerCapture(drag.id);
  drag = null; marquee.value = null;
  cancelAnimationFrame(scrollFrame);
}
function cancelKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') end();
  else if (!drag) suppressClick = false;
}
function interceptClick(event: MouseEvent): void {
  if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
}
function selected(index: number, media: MediaItem): boolean {
  return marquee.value ? hit.value.has(index) || !!(drag?.additive && drag.base.has(media.id)) : props.selection.has(media.id);
}
watch(() => [props.active, props.revision, props.size, props.resetKey], () => end());
const grid = computed(() =>
  virtualGrid({
    width: width.value,
    total: props.total,
    viewportTop: viewportTop.value,
    viewportHeight: viewportHeight.value,
    size: props.size,
  }),
);
function measure(): void {
  frame = 0;
  if (!props.active || !element.value) return;
  const rect = element.value.getBoundingClientRect();
  if (rect.width > 0) width.value = rect.width;
  viewportTop.value = -rect.top;
  viewportHeight.value = innerHeight;
}
function schedule(): void {
  if (!frame) frame = requestAnimationFrame(measure);
}
watch(
  () => [grid.value.start, grid.value.end, props.revision, props.active],
  () => {
    if (props.active && grid.value.end > grid.value.start)
      emit("range", grid.value.start, grid.value.end);
  },
  { flush: "post" },
);
watch(
  () => [props.active, props.size, props.total],
  () => void nextTick(measure),
);
watch(
  () => props.revision,
  () =>
    void nextTick(() => {
      if (
        props.active &&
        element.value &&
        element.value.getBoundingClientRect().bottom < 0
      ) {
        element.value.scrollIntoView({ block: "start" });
      }
      measure();
    }),
);
watch(
  () => props.resetKey,
  () =>
    void nextTick(() => {
      if (props.active && element.value) {
        const top = element.value.getBoundingClientRect().top;
        if (top < 120)
          window.scrollTo({
            top: Math.max(0, scrollY + top - 220),
            behavior: "instant",
          });
      }
      measure();
    }),
);
onMounted(() => {
  observer = new ResizeObserver(schedule);
  if (element.value) observer.observe(element.value);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('blur', () => end(), { signal: controller.signal });
  window.addEventListener('keydown', cancelKey);
  measure();
});
onBeforeUnmount(() => {
  end();
  controller.abort();
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', end);
  window.removeEventListener('pointercancel', end);
  window.removeEventListener('keydown', cancelKey);
  observer?.disconnect();
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  cancelAnimationFrame(frame);
});
const controller = new AbortController();
</script>
<template>
  <div
    ref="element"
    class="virtual-media-grid"
    role="list"
    aria-label="视频列表"
    :style="{ height: `${grid.height}px` }"
    :data-total="total"
    :data-rendered="grid.cells.length"
    :class="{ 'is-selecting': marquee }"
    @pointerdown="start"
    @dragstart.prevent
    @click.capture="interceptClick"
  >
    <div
      v-for="cell in grid.cells"
      :key="cell.index"
      class="virtual-media-cell"
      role="listitem"
      :aria-posinset="cell.index + 1"
      :aria-setsize="total"
      :style="{
        left: `${cell.x}px`,
        top: `${cell.y}px`,
        width: `${cell.width}px`,
        height: `${cell.height}px`,
      }"
    >
      <slot
        v-if="getItem(cell.index)"
        :media="getItem(cell.index)!"
        :index="cell.index"
        :selected="selected(cell.index, getItem(cell.index)!)"
      ></slot>
      <div v-else class="media-skeleton" aria-label="正在加载视频条目">
        <div></div>
        <span></span><span></span>
      </div>
    </div>
    <div v-if="marquee" class="selection-marquee" aria-hidden="true" :style="{
      left: `${marquee.left}px`, top: `${marquee.top}px`, width: `${marquee.right - marquee.left}px`, height: `${marquee.bottom - marquee.top}px`,
    }"></div>
  </div>
</template>
<style scoped>
.virtual-media-grid { user-select: none; }
.is-selecting { cursor: crosshair; }
.selection-marquee { position: absolute; z-index: 10; pointer-events: none; border: 1px solid var(--accent-text); background: var(--accent-wash); border-radius: 4px; }
</style>
