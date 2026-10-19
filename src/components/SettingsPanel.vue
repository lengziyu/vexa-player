<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useSettings } from "../stores/settings";
import { useWall } from "../stores/wall";
import type { Settings } from "../shared/contracts";
import Icon from "./Icon.vue";
import SelectMenu from "./SelectMenu.vue";
const emit = defineEmits<{
  error: [error: unknown];
  notify: [message: string];
}>();
const settings = useSettings(),
  wall = useWall(),
  cacheBytes = ref(0),
  clearing = ref(false),
  desktop = !!window.vexa;
async function change(patch: Partial<Settings>): Promise<void> {
  try {
    await settings.set(patch);
  } catch (error) {
    emit("error", error);
  }
}
async function clear(): Promise<void> {
  if (!window.vexa) return;
  clearing.value = true;
  try {
    await window.vexa.clearCache();
    cacheBytes.value = 0;
    emit("notify", "封面缓存已清理，视频与收藏未改动");
  } catch (error) {
    emit("error", error);
  } finally {
    clearing.value = false;
  }
}
onMounted(() => {
  window.vexa
    ?.cacheSize()
    .then((value) => (cacheBytes.value = value))
    .catch((error) => emit("error", error));
});
</script>
<template>
  <div class="modal-eyebrow">A LITTLE MORE YOU</div>
  <h2 id="modalTitle">调成你喜欢的样子<span class="title-dot">.</span></h2>
  <p class="modal-description">让放映室的氛围，刚好合你的心意。</p>
  <section class="appearance-section">
    <label>外观</label>
    <div class="theme-options">
      <button
        v-for="theme in [
          { id: 'dark', name: '深色', icon: 'moon' },
          { id: 'light', name: '浅色', icon: 'sun' },
          { id: 'system', name: '跟随系统', icon: 'monitor' },
        ] as const"
        :key="theme.id"
        :class="{ selected: settings.values.theme === theme.id }"
        :aria-pressed="settings.values.theme === theme.id"
        @click="change({ theme: theme.id })"
      >
        <span class="theme-preview" :class="`preview-${theme.id}`"
          ><i></i><b></b><em></em></span
        ><span
          ><Icon :name="theme.icon" :size="14" />{{ theme.name
          }}<Icon
            v-if="settings.values.theme === theme.id"
            name="check"
            :size="13"
        /></span>
      </button>
    </div>
  </section>
  <div class="setting-row">
    <div>
      <strong>一点颜色</strong>
      <p>雾紫、鼠尾草、暖沙金</p>
    </div>
    <div class="swatches">
      <button
        v-for="accent in [
          { id: 'violet', name: '雾紫', color: '#b8a0ed' },
          { id: 'sage', name: '鼠尾草', color: '#a3c6b3' },
          { id: 'sand', name: '暖沙金', color: '#d7b993' },
        ] as const"
        :key="accent.id"
        class="swatch"
        :class="{ selected: settings.values.accent === accent.id }"
        :style="{ '--swatch': accent.color }"
        :aria-label="accent.name"
        :aria-pressed="settings.values.accent === accent.id"
        @click="change({ accent: accent.id })"
      ></button>
    </div>
  </div>
  <div class="setting-row">
    <div>
      <strong>减少动态效果</strong>
      <p>更安静的过渡，也能很舒服</p>
    </div>
    <button
      class="toggle"
      :aria-pressed="settings.values.reducedMotion"
      aria-label="减少动态效果"
      @click="change({ reducedMotion: !settings.values.reducedMotion })"
    ></button>
  </div>
  <div class="setting-row">
    <div>
      <strong>完整显示画面</strong>
      <p>保留原始比例，允许黑边</p>
    </div>
    <button
      class="toggle"
      :aria-pressed="settings.values.fit === 'contain'"
      aria-label="完整显示画面"
      @click="
        change({ fit: settings.values.fit === 'contain' ? 'cover' : 'contain' })
      "
    ></button>
  </div>
  <div class="setting-row">
    <div>
      <strong>放大时暂停其他画面</strong>
      <p>退出放大后恢复，保留你手动暂停的选择</p>
    </div>
    <button
      class="toggle"
      :aria-pressed="settings.values.pauseHidden"
      aria-label="放大时暂停其他画面"
      @click="change({ pauseHidden: !settings.values.pauseHidden })"
    ></button>
  </div>
  <div class="setting-row">
    <div>
      <strong>全部画面同时发声</strong>
      <p>开启后混合播放声音，保留单独静音与音量</p>
    </div>
    <button
      class="toggle"
      :aria-pressed="wall.mixedAudio"
      aria-label="多画面混音"
      @click="wall.setMixedAudio(!wall.mixedAudio)"
    ></button>
  </div>
  <div class="setting-row">
    <div>
      <strong>随机进度开始播放</strong>
      <p>换片时，从中间发现新片刻</p>
    </div>
    <button
      class="toggle"
      :aria-pressed="settings.values.randomStart"
      aria-label="随机进度起播"
      @click="change({ randomStart: !settings.values.randomStart })"
    ></button>
  </div>
  <div class="setting-row">
    <div>
      <strong>播放结束后自动换片</strong>
      <p>默认关闭；开启后适用于全部布局，锁定或循环画面除外</p>
    </div>
    <button
      class="toggle"
      :aria-pressed="settings.values.autoNext"
      aria-label="结束后自动换片"
      @click="change({ autoNext: !settings.values.autoNext })"
    ></button>
  </div>
  <div class="setting-row">
    <div>
      <strong>定时自动换片</strong>
      <p>只累计播放时间，暂停时停止计时</p>
    </div>
    <SelectMenu
      :model-value="settings.values.switchInterval"
      label="自动换片间隔"
      :options="
        [
          { value: 0, label: '关闭' },
          { value: 30, label: '30 秒' },
          { value: 60, label: '1 分钟' },
          { value: 300, label: '5 分钟' },
          { value: 600, label: '10 分钟' },
        ] as const
      "
      @update:model-value="change({ switchInterval: $event })"
    />
  </div>
  <div class="setting-row">
    <div>
      <strong>保存封面缓存</strong>
      <p>仅存本地，关闭后不再生成新封面</p>
    </div>
    <button
      class="toggle"
      :aria-pressed="settings.values.cacheEnabled"
      aria-label="保存封面缓存"
      @click="change({ cacheEnabled: !settings.values.cacheEnabled })"
    ></button>
  </div>
  <div class="setting-row">
    <div>
      <strong>清理封面缓存</strong>
      <p>{{ (cacheBytes / 1024 / 1024).toFixed(1) }} MB · 不影响视频与收藏</p>
    </div>
    <button
      class="button secondary small"
      :disabled="clearing || !desktop"
      @click="clear"
    >
      <Icon name="trash" :size="13" />{{ clearing ? "清理中" : "清理" }}
    </button>
  </div>
  <p class="privacy-note">
    <Icon
      name="shield"
      :size="14"
    />文件、索引与设置仅保存在本地，不记录观看历史。
  </p>
</template>
