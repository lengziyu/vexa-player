<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useWall } from "../stores/wall";
import { PLAYBACK_SPEEDS } from "../shared/contracts";
import Icon from "./Icon.vue";
const props = defineProps<{ open: boolean; fullscreen: boolean }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  height: [value: number];
}>();
const wall = useWall(),
  root = ref<HTMLElement>(),
  panel = ref<HTMLElement>(),
  trigger = ref<HTMLButtonElement>(),
  progressInput = ref<HTMLInputElement>(),
  seekDraft = ref<number | null>(null);
let observer: ResizeObserver | undefined,
  seekFrame = 0;
const reference = computed(
  () =>
    wall.tiles.find(
      (t) => t.id === wall.focused && t.duration > 0 && t.status !== "error",
    ) || wall.tiles.find((t) => t.duration > 0 && t.status !== "error"),
);
const percent = computed(
  () =>
    seekDraft.value ??
    Math.max(
      0,
      Math.min(
        100,
        reference.value
          ? (reference.value.progress / reference.value.duration) * 100
          : 0,
      ),
    ),
);
const speed = computed(() => {
  const values = new Set(wall.tiles.map((t) => t.speed));
  return values.size === 1
    ? wall.tiles[0]!.speed
    : wall.tiles.length
      ? null
      : wall.unifiedSpeed;
});
function measure(): void {
  emit("height", panel.value?.getBoundingClientRect().height || 0);
}
function close(restore = false): void {
  emit("update:open", false);
  if (restore)
    void nextTick(() => trigger.value?.focus({ preventScroll: true }));
}
function outside(event: PointerEvent): void {
  if (
    props.open &&
    event.target instanceof Node &&
    !root.value?.contains(event.target)
  )
    close();
}
function seek(event: Event): void {
  seekDraft.value = Number((event.target as HTMLInputElement).value);
  if (!seekFrame)
    seekFrame = requestAnimationFrame(() => {
      seekFrame = 0;
      if (seekDraft.value !== null) wall.seekPercent(seekDraft.value);
    });
}
function commitSeek(): void {
  cancelAnimationFrame(seekFrame);
  seekFrame = 0;
  if (seekDraft.value !== null) wall.seekPercent(seekDraft.value);
  seekDraft.value = null;
}
watch(
  () => props.open,
  async (open) => {
    observer?.disconnect();
    if (!open) {
      commitSeek();
      emit("height", 0);
      return;
    }
    await nextTick();
    if (!props.open) return;
    measure();
    if (panel.value) observer?.observe(panel.value);
    progressInput.value?.focus({ preventScroll: true });
    if (!props.fullscreen)
      panel.value?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  },
);
onMounted(() => {
  observer = new ResizeObserver(measure);
  document.addEventListener("pointerdown", outside, true);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  document.removeEventListener("pointerdown", outside, true);
  cancelAnimationFrame(seekFrame);
});
</script>
<template>
  <div ref="root" class="wall-controls">
    <button
      ref="trigger"
      class="wall-controls-trigger"
      :class="{ active: open }"
      :disabled="!wall.tiles.length"
      aria-label="统一播放设置"
      aria-controls="wall-controls-popover"
      :aria-expanded="open"
      title="统一进度、音量与倍速"
      @click="emit('update:open', !open)"
    >
      <Icon name="sliders" :size="16" />
    </button>
    <Transition name="controls-popover"
      ><section
        v-if="open"
        id="wall-controls-popover"
        ref="panel"
        class="wall-controls-popover"
        role="region"
        aria-label="统一播放控制"
        @keydown.esc.prevent.stop="close(true)"
      >
        <header>
          <span
            ><Icon name="sliders" :size="15" /><strong>统一播放</strong
            ><small>{{ wall.tiles.length }} 个画面</small></span
          ><button
            class="icon-button tiny"
            aria-label="收起统一播放设置"
            @click="close(true)"
          >
            <Icon name="close" :size="14" />
          </button>
        </header>
        <div class="wall-control-row">
          <div class="wall-control-label">
            <label for="wall-unified-seek">统一进度</label
            ><output for="wall-unified-seek"
              >{{ percent.toFixed(0) }}<small>%</small></output
            >
          </div>
          <input
            id="wall-unified-seek"
            ref="progressInput"
            class="control-range"
            type="range"
            min="0"
            max="100"
            step="0.1"
            :value="percent"
            :disabled="!reference"
            aria-label="统一进度"
            :aria-valuetext="`${percent.toFixed(1)}%，按各视频时长跳转`"
            :style="{ '--progress': `${percent}%` }"
            @input="seek"
            @change="commitSeek"
            @pointercancel="commitSeek"
          />
        </div>
        <div class="wall-control-row">
          <div class="wall-control-label">
            <div>
              <label for="wall-unified-volume">统一音量</label>
              <div class="audio-routing" role="group" aria-label="发声范围">
                <button
                  :aria-pressed="!wall.mixedAudio"
                  aria-label="仅选中画面发声"
                  title="仅选中画面发声"
                  @click="wall.setMixedAudio(false)"
                >
                  仅选中
                </button>
                <button
                  :aria-pressed="wall.mixedAudio"
                  aria-label="全部画面同时发声"
                  title="全部画面同时发声，保留单独静音"
                  @click="wall.setMixedAudio(true)"
                >
                  全部声音
                </button>
              </div>
            </div>
            <div>
              <button
                class="unified-mute"
                :aria-label="wall.muted ? '取消统一静音' : '统一静音'"
                :aria-pressed="wall.muted"
                @click="
                  wall.muted = !wall.muted;
                  wall.sync();
                "
              >
                <Icon
                  :name="wall.muted || !wall.volume ? 'muted' : 'volume'"
                  :size="14"
                /></button
              ><output for="wall-unified-volume">{{
                wall.muted ? "已静音" : `${Math.round(wall.volume * 100)}%`
              }}</output>
            </div>
          </div>
          <input
            id="wall-unified-volume"
            class="control-range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="wall.volume"
            aria-label="统一音量"
            :style="{ '--progress': `${wall.volume * 100}%` }"
            @input="
              wall.setVolume(Number(($event.target as HTMLInputElement).value))
            "
          />
        </div>
        <div class="wall-control-row">
          <div class="wall-control-label">
            <span>统一倍速</span
            ><output>{{ speed === null ? "不同倍速" : `${speed}×` }}</output>
          </div>
          <div class="unified-speeds" role="group" aria-label="统一倍速">
            <button
              v-for="rate in PLAYBACK_SPEEDS"
              :key="rate"
              :aria-label="`全部 ${rate} 倍速`"
              :aria-pressed="speed === rate"
              :class="{ active: speed === rate }"
              @click="wall.setSpeed(rate)"
            >
              {{ rate }}×
            </button>
          </div>
        </div>
        <p>
          进度按各自时长跳转。{{
            wall.mixedAudio
              ? "全部画面发声，保留单独静音。"
              : "仅选中画面发声。"
          }}
        </p>
      </section></Transition
    >
  </div>
</template>
