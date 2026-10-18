<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "./Icon.vue";
import type { MediaItem } from "../shared/contracts";
const props = defineProps<{ media: MediaItem; selected: boolean }>();
const emit = defineEmits<{
  select: [event: MouseEvent | KeyboardEvent];
  play: [];
  favorite: [];
  reveal: [];
}>();
const broken = ref(false);
watch(
  () => [props.media.id, props.media.thumbnail, props.media.mtime],
  () => (broken.value = false),
);
const duration = computed(() => {
  const s = Math.floor(props.media.duration || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
});
const size = computed(() =>
  props.media.size >= 1024 ** 3
    ? `${(props.media.size / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(props.media.size / 1024 ** 2)} MB`,
);
const resolution = computed(() => {
  const edge = Math.min(props.media.width || 0, props.media.height || 0);
  return edge >= 2160
    ? "4K"
    : edge >= 1440
      ? "2K"
      : edge >= 1080
        ? "1080P"
        : edge >= 720
          ? "720P"
          : edge
            ? `${edge}P`
            : "—";
});
</script>
<template>
  <article
    class="library-card"
    :class="{
      selected,
      unavailable: media.status === 'error' || media.status === 'missing',
    }"
    tabindex="0"
    role="checkbox"
    :aria-checked="selected"
    :aria-label="media.name"
    :data-media-id="media.id"
    @click="emit('select', $event)"
    @keydown.space.self.prevent="emit('select', $event)"
    @keydown.enter.self.prevent="emit('play')"
    @dblclick="emit('play')"
  >
    <div class="thumb">
      <img
        v-if="media.thumbnail && !broken"
        :src="`vexa-media://thumb/${media.id}`"
        alt=""
        loading="lazy"
        @error="broken = true"
      />
      <div v-else class="thumb-placeholder">
        <Icon name="film" :size="30" />
      </div>
      <span class="media-check"
        ><Icon v-if="selected" name="check" :size="12"
      /></span>
      <button
        class="favorite"
        :class="{ active: media.favorite }"
        :aria-label="media.favorite ? '取消收藏' : '收藏视频'"
        @click.stop="emit('favorite')"
        @dblclick.stop
      >
        <Icon name="heart" :size="15" />
      </button>
      <span class="duration">{{ duration }}</span
      ><span class="resolution">{{ resolution }}</span>
      <button
        class="quick-play"
        aria-label="加入播放墙"
        @click.stop="emit('play')"
        @dblclick.stop
      >
        <Icon name="plus" :size="19" />
      </button>
      <span
        v-if="media.status === 'error' || media.status === 'missing'"
        class="media-error"
        >{{ media.status === "missing" ? "文件失联" : "读取失败" }}</span
      >
    </div>
    <div class="media-meta">
      <strong :title="media.name">{{ media.name }}</strong>
      <div>
        <span>{{ media.codec?.toUpperCase() || "等待读取" }} · {{ size }}</span
        ><button
          aria-label="在文件夹中显示"
          @click.stop="emit('reveal')"
          @dblclick.stop
        >
          <Icon name="folder" :size="13" />
        </button>
      </div>
    </div>
  </article>
</template>
