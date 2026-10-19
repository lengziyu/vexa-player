<script setup lang="ts">
import { computed } from "vue";
import { useLibrary } from "../stores/library";
import { useSettings } from "../stores/settings";
import Icon from "./Icon.vue";
import SelectMenu from "./SelectMenu.vue";
const library = useLibrary(),
  settings = useSettings();
const emit = defineEmits<{ error: [error: unknown] }>();
const activeCount = computed(
  () =>
    Number(library.filters.duration !== "all") +
    Number(library.filters.resolution !== "all") +
    Number(library.filters.orientation !== "all") +
    Number(library.filters.status !== "all") +
    Number(library.filters.onlyFavorites),
);
</script>
<template>
  <section class="library-filters" aria-label="视频筛选">
    <div class="filter-heading">
      <span
        ><Icon name="sliders" :size="15" /> 筛选
        <b v-if="activeCount">{{ activeCount }}</b></span
      >
      <div class="thumbnail-sizes" aria-label="缩略图大小">
        <button
          v-for="entry in [
            ['small', '小'],
            ['medium', '中'],
            ['large', '大'],
          ] as const"
          :key="entry[0]"
          :class="{ active: settings.values.thumbnailSize === entry[0] }"
          :aria-label="`${entry[1]}缩略图`"
          :aria-pressed="settings.values.thumbnailSize === entry[0]"
          @click="
            settings
              .set({ thumbnailSize: entry[0] })
              .catch((error) => emit('error', error))
          "
        >
          {{ entry[1] }}
        </button>
      </div>
    </div>
    <div class="filter-controls">
      <label
        >时长<SelectMenu
          v-model="library.filters.duration"
          label="按时长筛选"
          :options="
            [
              { value: 'all', label: '全部时长' },
              { value: 'short', label: '10 分钟以内' },
              { value: 'medium', label: '10–30 分钟' },
              { value: 'long', label: '30–60 分钟' },
              { value: 'feature', label: '60 分钟以上' },
            ] as const
          "
      /></label>
      <label
        >画质<SelectMenu
          v-model="library.filters.resolution"
          label="按分辨率筛选"
          :options="
            [
              { value: 'all', label: '全部分辨率' },
              { value: 'sd', label: '低于 720P' },
              { value: 'hd', label: '720P' },
              { value: 'fhd', label: '1080P' },
              { value: 'qhd', label: '1440P' },
              { value: 'uhd', label: '4K 及以上' },
            ] as const
          "
      /></label>
      <label
        >画幅<SelectMenu
          v-model="library.filters.orientation"
          label="按横竖屏筛选"
          :options="
            [
              { value: 'all', label: '全部画幅' },
              { value: 'landscape', label: '横屏' },
              { value: 'portrait', label: '竖屏' },
              { value: 'square', label: '方形' },
            ] as const
          "
      /></label>
      <label
        >文件<SelectMenu
          v-model="library.filters.status"
          label="按文件状态筛选"
          :options="
            [
              { value: 'all', label: '全部状态' },
              { value: 'ready', label: '读取正常' },
              { value: 'pending', label: '待读取' },
              { value: 'missing', label: '文件失联' },
              { value: 'error', label: '读取失败' },
            ] as const
          "
      /></label>
      <button
        class="filter-favorite"
        :class="{ active: library.favorites || library.filters.onlyFavorites }"
        :disabled="library.favorites"
        :aria-pressed="library.favorites || library.filters.onlyFavorites"
        @click="library.filters.onlyFavorites = !library.filters.onlyFavorites"
      >
        <Icon name="heart" :size="14" /> 仅收藏
      </button>
      <button
        v-if="library.hasFilters"
        class="filter-reset"
        @click="library.resetFilters()"
      >
        清除筛选
      </button>
    </div>
    <small v-if="activeCount"
      >已应用 {{ activeCount }} 项筛选 ·
      分辨率按画面短边计算，未知信息不参与对应筛选</small
    >
  </section>
</template>
