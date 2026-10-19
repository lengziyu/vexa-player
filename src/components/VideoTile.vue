<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { TileState } from "../shared/contracts";
import { PLAYBACK_SPEEDS } from "../shared/contracts";
import { HtmlVideoEngine } from "../player/engine";
import { useWall } from "../stores/wall";
import { useSettings } from "../stores/settings";
import Icon from "./Icon.vue";
import SelectMenu from "./SelectMenu.vue";
import { PlaybackQualityMonitor } from "../core/playback-quality";
const props = defineProps<{
  tile: TileState;
  index: number;
  isMain: boolean;
}>();
const emit = defineEmits<{
  shuffle: [id: string];
  replace: [id: string];
  info: [id: string];
  error: [error: unknown];
}>();
const wall = useWall(),
  settings = useSettings(),
  video = ref<HTMLVideoElement>(),
  loaded = ref(false),
  interacting = ref(false),
  seekDraft = ref<number | null>(null);
let engine: HtmlVideoEngine | undefined;
let monitorTimer: ReturnType<typeof setInterval> | undefined;
const monitor = new PlaybackQualityMonitor();
const speedOptions = PLAYBACK_SPEEDS.map((speed) => ({
  value: speed,
  label: `${speed}×`,
}));
const source = computed(() => `vexa-media://media/${props.tile.media.id}`);
const ratio = computed(
  () =>
    seekDraft.value ??
    (props.tile.duration
      ? (props.tile.progress / props.tile.duration) * 100
      : 0),
);
const time = (value: number) =>
  Number.isFinite(value)
    ? `${Math.floor(value / 60)
        .toString()
        .padStart(2, "0")}:${Math.floor(value % 60)
        .toString()
        .padStart(2, "0")}`
    : "--:--";
function metadata(): void {
  if (!video.value) return;
  loaded.value = true;
  props.tile.duration = video.value.duration;
  engine?.seek(props.tile.startAt);
  props.tile.progress = props.tile.startAt;
  wall.syncTile(props.tile.id);
}
function failed(): void {
  const code = video.value?.error?.code;
  wall.markError(
    props.tile.id,
    code === 4
      ? `当前播放内核不支持此媒体组合${props.tile.media.codec ? `（${props.tile.media.codec}）` : ""}`
      : code === 2
        ? "无法读取文件，请检查文件或外接盘状态"
        : "视频解码失败，文件可能损坏或编码不受支持",
  );
}
function seek(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  seekDraft.value = value;
}
function commitSeek(): void {
  const value = seekDraft.value;
  if (value === null) return;
  wall.seek(props.tile.id, (value * props.tile.duration) / 100);
  seekDraft.value = null;
}
function release(event?: Event): void {
  if (event?.type === "pointerup") commitSeek();
  interacting.value = false;
  seekDraft.value = null;
}
function replay(): void {
  wall.retry(props.tile.id);
  monitor.reset();
  video.value?.load();
  wall.syncTile(props.tile.id);
}
function onPlayback(): void {
  if (!wall.privacy && !props.tile.paused) props.tile.status = "playing";
}
onMounted(() => {
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  if (video.value) {
    engine = new HtmlVideoEngine(video.value);
    wall.register(props.tile.id, engine);
    monitorTimer = setInterval(() => {
      const element = video.value;
      if (!element?.getVideoPlaybackQuality) return;
      const counters = element.getVideoPlaybackQuality();
      const sample = monitor.sample(
        counters.totalVideoFrames,
        counters.droppedVideoFrames,
        loaded.value &&
          !element.paused &&
          !element.seeking &&
          !wall.privacy &&
          !document.hidden,
      );
      if (sample) wall.quality[props.tile.id] = sample;
      else delete wall.quality[props.tile.id];
    }, 1000);
  }
});
watch(
  () => props.tile.media.id,
  () => {
    loaded.value = false;
    release();
    monitor.reset();
    video.value?.load();
  },
  { flush: "post" },
);
watch(
  [
    () => props.tile.paused,
    () => props.tile.volume,
    () => props.tile.muted,
    () => props.tile.speed,
    () => props.tile.loop,
  ],
  () => wall.syncTile(props.tile.id),
);
onBeforeUnmount(() => {
  window.removeEventListener("pointerup", release);
  window.removeEventListener("pointercancel", release);
  clearInterval(monitorTimer);
  if (engine) wall.unregister(props.tile.id, engine);
});
</script>
<template>
  <article
    class="video-tile"
    :class="{
      focused: wall.focused === tile.id,
      zoomed: wall.zoomed === tile.id,
      paused: tile.paused,
    }"
    tabindex="0"
    :aria-label="tile.media.name"
    :draggable="!interacting"
    @click="wall.focus(tile.id)"
    @dblclick.self="wall.zoomed = wall.zoomed === tile.id ? null : tile.id"
    @mouseenter="wall.hovered = tile.id"
    @mouseleave="wall.hovered = null"
    @dragstart="
      (event) => {
        if (interacting) event.preventDefault();
        else event.dataTransfer?.setData('application/vexa-tile', tile.id);
      }
    "
    @dragover.prevent
    @drop.prevent="
      (event) => {
        const other = event.dataTransfer?.getData('application/vexa-tile');
        if (other) wall.swap(other, tile.id);
      }
    "
  >
    <video
      ref="video"
      :src="source"
      :style="{ objectFit: settings.values.fit }"
      playsinline
      preload="auto"
      :muted="true"
      @loadedmetadata="metadata"
      @error="failed"
      @playing="onPlayback"
      @seeking="
        monitor.reset();
        delete wall.quality[tile.id];
      "
      @waiting="tile.status = 'loading'"
      @timeupdate="
        wall.tick(
          tile.id,
          video?.currentTime || 0,
          video?.duration || 0,
          video?.seeking,
        )
      "
      @ended="wall.ended(tile.id)"
    />
    <div
      class="tile-shade"
      @dblclick="wall.zoomed = wall.zoomed === tile.id ? null : tile.id"
    ></div>
    <div class="tile-top">
      <span class="tile-index">{{ String(index + 1).padStart(2, "0") }}</span
      ><span v-if="isMain" class="tile-badge"
        ><Icon name="sparkles" :size="11" />主画面</span
      ><span class="tile-format">{{
        tile.media.height
          ? `${tile.media.height}P`
          : tile.media.codec || "本地视频"
      }}</span>
    </div>
    <div class="tile-actions">
      <button
        class="tile-action"
        title="从视频库选择替换，其他画面继续播放"
        aria-label="选择视频替换此画面"
        @click.stop="emit('replace', tile.id)"
      >
        <Icon name="folder" :size="14" />
      </button>
      <button
        class="tile-action"
        title="设为主画面"
        aria-label="设为主画面"
        @click.stop="wall.main(tile.id).catch((error) => emit('error', error))"
      >
        <Icon name="focus" :size="14" /></button
      ><button
        class="tile-action"
        :class="{ locked: tile.locked }"
        :title="tile.locked ? '解锁画面' : '锁定画面'"
        :aria-label="tile.locked ? '解锁画面' : '锁定画面'"
        @click.stop="tile.locked = !tile.locked"
      >
        <Icon :name="tile.locked ? 'lock' : 'unlock'" :size="14" /></button
      ><button
        class="tile-action"
        title="随机换片 R"
        aria-label="随机替换此画面"
        :disabled="tile.locked"
        @click.stop="emit('shuffle', tile.id)"
      >
        <Icon name="shuffle" :size="14" /></button
      ><button
        class="tile-action"
        title="画面信息"
        aria-label="画面信息"
        @click.stop="emit('info', tile.id)"
      >
        <Icon name="info" :size="14" /></button
      ><button
        class="tile-action"
        title="移出播放墙，不删除原文件；可撤销"
        aria-label="关闭画面"
        @click.stop="wall.remove(tile.id, true)"
      >
        <Icon name="close" :size="14" />
      </button>
    </div>
    <div v-if="tile.error" class="tile-error" @click.stop>
      <Icon name="warning" :size="26" />
      <p>{{ tile.error }}</p>
      <div>
        <button @click="replay">重新尝试</button
        ><button @click="emit('shuffle', tile.id)">换个视频</button>
      </div>
    </div>
    <div v-else-if="!loaded || tile.status === 'loading'" class="tile-loading">
      <Icon name="loading" :size="27" /><span>正在准备画面</span>
    </div>
    <button
      v-else
      class="tile-center-play"
      :aria-label="tile.paused ? '播放此画面' : '暂停此画面'"
      @click.stop="wall.toggle(tile.id)"
    >
      <Icon :name="tile.paused ? 'play' : 'pause'" :size="20" />
    </button>
    <div class="tile-bottom" @pointerdown="interacting = true" @dblclick.stop>
      <div class="tile-title-row">
        <div class="tile-title">
          <strong>{{ tile.media.name }}</strong
          ><span
            >{{ tile.media.codec?.toUpperCase() || "LOCAL VIDEO"
            }}<template v-if="tile.media.width">
              · {{ tile.media.width }} × {{ tile.media.height }}</template
            ></span
          >
        </div>
        <span class="tile-time"
          >{{ time(seekDraft === null ? tile.progress : seekDraft * tile.duration / 100) }} <em>/ {{ time(tile.duration) }}</em></span
        >
      </div>
      <input
        class="tile-progress"
        type="range"
        min="0"
        max="100"
        step="0.1"
        :value="ratio"
        :disabled="!tile.duration"
        :aria-label="`${tile.media.name}的进度`"
        title="拖动预览位置，松开后跳转"
        :style="{ '--progress': `${ratio}%` }"
        @click.stop
        @input="seek"
        @change="!interacting && commitSeek()"
      />
      <div class="tile-extra">
        <button
          :aria-label="tile.muted ? '取消此画面静音' : '静音此画面'"
          @click.stop="tile.muted = !tile.muted"
        >
          <Icon :name="tile.muted ? 'muted' : 'volume'" :size="14" /></button
        ><input
          type="range"
          min="0"
          max="1"
          step=".01"
          v-model.number="tile.volume"
          aria-label="此画面音量"
          @click.stop
        /><SelectMenu
          v-model="tile.speed"
          :options="speedOptions"
          label="此画面倍速"
          class="tile-speed-select"
          compact
          video
        /><button
          :aria-pressed="tile.loop"
          title="单片循环"
          aria-label="单片循环"
          @click.stop="tile.loop = !tile.loop"
        >
          <Icon name="repeat" :size="14" />
        </button>
      </div>
    </div>
  </article>
</template>
