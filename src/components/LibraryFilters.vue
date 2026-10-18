<script setup lang="ts">
import { computed } from "vue";
import { useLibrary } from "../stores/library";
import { useSettings } from "../stores/settings";
import Icon from "./Icon.vue";
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
        >时长<select v-model="library.filters.duration" aria-label="按时长筛选">
          <option value="all">全部时长</option>
          <option value="short">10 分钟以内</option>
          <option value="medium">10–30 分钟</option>
          <option value="long">30–60 分钟</option>
          <option value="feature">60 分钟以上</option>
        </select></label
      >
      <label
        >画质<select
          v-model="library.filters.resolution"
          aria-label="按分辨率筛选"
        >
          <option value="all">全部分辨率</option>
          <option value="sd">低于 720P</option>
          <option value="hd">720P</option>
          <option value="fhd">1080P</option>
          <option value="qhd">1440P</option>
          <option value="uhd">4K 及以上</option>
        </select></label
      >
      <label
        >画幅<select
          v-model="library.filters.orientation"
          aria-label="按横竖屏筛选"
        >
          <option value="all">全部画幅</option>
          <option value="landscape">横屏</option>
          <option value="portrait">竖屏</option>
          <option value="square">方形</option>
        </select></label
      >
      <label
        >文件<select
          v-model="library.filters.status"
          aria-label="按文件状态筛选"
        >
          <option value="all">全部状态</option>
          <option value="ready">读取正常</option>
          <option value="pending">待读取</option>
          <option value="missing">文件失联</option>
          <option value="error">读取失败</option>
        </select></label
      >
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
