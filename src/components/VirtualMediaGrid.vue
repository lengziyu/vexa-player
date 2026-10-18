<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { virtualGrid } from "../core/virtual-grid";
import type { MediaItem, ThumbnailSize } from "../shared/contracts";
const props = defineProps<{
  total: number;
  size: ThumbnailSize;
  active: boolean;
  revision: number;
  resetKey: number;
  getItem: (index: number) => MediaItem | undefined;
}>();
const emit = defineEmits<{ range: [start: number, end: number] }>();
const element = ref<HTMLElement>(),
  width = ref(1000),
  viewportTop = ref(0),
  viewportHeight = ref(innerHeight);
let observer: ResizeObserver | undefined,
  frame = 0;
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
  measure();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  cancelAnimationFrame(frame);
});
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
      ></slot>
      <div v-else class="media-skeleton" aria-label="正在加载视频条目">
        <div></div>
        <span></span><span></span>
      </div>
    </div>
  </div>
</template>
