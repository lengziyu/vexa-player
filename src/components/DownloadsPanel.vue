<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import Icon from "./Icon.vue";
import XLoginPopover from "./XLoginPopover.vue";
import SelectMenu from "./SelectMenu.vue";
import { useDownloads } from "../stores/downloads";
import type {
  DownloadPreview,
  DownloadTask,
  DownloadConnection,
} from "../shared/downloads";

const downloads = useDownloads(),
  api = window.vexa?.downloads;
const link = ref(""),
  message = ref(""),
  loginMessage = ref(""),
  working = ref(false),
  settingsOpen = ref(false);
const preview = ref<DownloadPreview | null>(null);
const selected = ref<string[]>([]),
  qualities = reactive<Record<string, number>>({});
const preferences = reactive({
  connection: "system" as DownloadConnection,
  proxy: "",
  autoImport: true,
});
const busy = computed(
  () =>
    working.value ||
    !!downloads.pending ||
    !!downloads.state?.tasks.some((task) => task.importing) ||
    !!downloads.state?.parsing ||
    downloads.state?.engine.status === "installing",
);
const engineReady = computed(() => downloads.state?.engine.status === "ready");
const tasks = computed(() => [...(downloads.state?.tasks || [])].reverse());
let generation = 0;
watch(link, () => {
  generation++;
  preview.value = null;
  message.value = "";
});
watch(settingsOpen, (open) => {
  if (open && downloads.state) {
    const { connection, proxy, autoImport } = downloads.state.preferences;
    Object.assign(preferences, { connection, proxy, autoImport });
  }
});
function error(error: unknown): string {
  return (error instanceof Error ? error.message : "操作失败，请重试").replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    "",
  );
}
async function action(
  callback: () => Promise<unknown>,
  forLogin = false,
): Promise<void> {
  if (working.value) return;
  working.value = true;
  const feedback = forLogin ? loginMessage : message;
  feedback.value = "";
  try {
    await callback();
  } catch (e) {
    feedback.value = error(e);
  } finally {
    working.value = false;
  }
}
async function taskAction(
  callback: () => Promise<unknown>,
  forLogin = false,
): Promise<void> {
  const feedback = forLogin ? loginMessage : message;
  feedback.value = "";
  try {
    await callback();
  } catch (e) {
    feedback.value = error(e);
  }
}
async function parse(): Promise<void> {
  const current = generation;
  await action(async () => {
    if (!api) throw new Error("请启动桌面版使用下载功能");
    const result = await api.parse(link.value);
    if (current !== generation) return;
    preview.value = result;
    selected.value = result.selectedIndex
      ? result.videos
          .filter((video) => video.index === result.selectedIndex)
          .map((video) => video.id)
      : result.videos.map((video) => video.id);
    result.videos.forEach((video) => {
      qualities[video.id] = 0;
    });
    if (!selected.value.length)
      message.value = "链接指定的视频不可用，请选择列表中的视频";
  });
}
async function enqueue(): Promise<void> {
  await action(async () => {
    if (!preview.value || !api) return;
    await api.enqueue({
      previewId: preview.value.id,
      selections: selected.value.map((id) => ({
        id,
        quality: qualities[id] || 0,
      })),
    });
    preview.value = null;
  });
}
function size(value: number | null): string {
  if (value === null) return "—";
  return value >= 1024 ** 2
    ? `${(value / 1024 ** 2).toFixed(1)} MB`
    : `${Math.round(value / 1024)} KB`;
}
function time(value: number | null): string {
  if (value === null) return "时长未知";
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function label(task: DownloadTask): string {
  return {
    queued: "等待下载",
    downloading: "正在下载",
    processing: "整理文件",
    complete: "下载完成",
    failed: "下载失败",
    cancelled: "已取消",
  }[task.status];
}
</script>

<template>
  <section class="downloads-view" aria-label="X 视频下载">
    <div class="download-intro">
      <div class="download-intro-icon"><Icon name="download" :size="25" /></div>
      <div>
        <strong>喜欢的片刻，留在本地</strong>
        <p>粘贴 X / Twitter 帖子链接，下载后加入你的私人视频库。</p>
      </div>
      <span class="download-site">𝕏 <span>LINK TO LOCAL</span></span>
    </div>

    <div v-if="!api" class="download-note">
      <Icon name="info" :size="16" />请启动桌面版使用链接下载。
    </div>
    <div v-else-if="!downloads.state" class="download-note">
      正在读取下载设置…
    </div>
    <template v-else>
      <div v-if="!engineReady" class="download-engine">
        <div class="download-engine-heading">
          <Icon
            :name="
              downloads.state.engine.status === 'installing'
                ? 'loading'
                : 'sparkles'
            "
            :size="20"
          />
          <div>
            <strong>{{
              downloads.state.engine.status === "installing"
                ? "正在准备下载组件"
                : "首次使用，准备一下"
            }}</strong>
            <p>
              独立组件约
              {{
                size(downloads.state.engine.size)
              }}，只需安装一次。本地播放始终可离线使用。
            </p>
          </div>
        </div>
        <div
          v-if="downloads.state.engine.status === 'installing'"
          class="download-track"
        >
          <span
            :style="{ width: `${downloads.state.engine.progress || 0}%` }"
          ></span>
        </div>
        <p
          v-if="downloads.state.engine.error"
          class="download-error"
          role="alert"
        >
          {{ downloads.state.engine.error }}
        </p>
        <div class="download-engine-actions">
          <button
            class="button primary"
            :disabled="busy || downloads.state.engine.status === 'unsupported'"
            @click="action(() => api!.installEngine())"
          >
            <Icon name="download" :size="15" />{{
              downloads.state.engine.status === "error"
                ? "重试安装组件"
                : "安装下载组件"
            }}</button
          ><button
            class="text-button"
            :disabled="busy || downloads.state.engine.status === 'unsupported'"
            @click="action(() => api!.importEngine())"
          >
            手动导入组件</button
          ><span>yt-dlp {{ downloads.state.engine.version }}</span>
        </div>
        <p
          v-if="downloads.state.engine.status === 'unsupported'"
          class="download-error"
        >
          当前系统或架构暂不支持该下载组件。
        </p>
        <p class="download-disclosure">
          <button
            class="text-button"
            @click="taskAction(() => api!.openEngineSource())"
          >
            官方组件发布页
          </button>
          · 仅在主动安装、登录、解析或下载时联网，会访问官方组件来源、X
          及其媒体服务。首次安装后不自动检查更新。
        </p>
      </div>

      <div class="download-composer">
        <XLoginPopover
          :authentication="downloads.state.authentication"
          :busy="busy"
          :feedback="loginMessage"
          @connect="taskAction(() => api!.connectX(), true)"
          @disconnect="taskAction(() => api!.disconnectX(), true)"
          @browser="taskAction(() => api!.openXInBrowser(), true)"
          @import="action(() => api!.importXLogin(), true)"
        />
        <form class="download-link-row" @submit.prevent="parse">
          <label class="download-link"
            ><Icon name="link" :size="18" /><input
              v-model="link"
              aria-label="X 帖子链接"
              placeholder="https://x.com/用户名/status/…"
              autocomplete="off"
              spellcheck="false"
              :disabled="downloads.state.parsing"
            /><button
              type="button"
              class="text-button"
              :disabled="working || downloads.state.parsing"
              @click="
                action(async () => {
                  link = await api!.paste();
                })
              "
            >
              粘贴
            </button></label
          >
          <button
            type="submit"
            class="button primary"
            :disabled="
              !engineReady || !link.trim() || working || downloads.state.parsing
            "
          >
            <Icon
              :name="downloads.state.parsing ? 'loading' : 'search'"
              :size="15"
            />{{ downloads.state.parsing ? "正在解析" : "解析链接" }}
          </button>
        </form>
        <div class="download-location">
          <Icon name="folder" :size="14" /><span
            :title="downloads.state.preferences.directory"
            >{{
              downloads.state.preferences.directory || "先选择一个保存文件夹"
            }}</span
          ><button
            class="text-button"
            :disabled="busy"
            @click="action(() => api!.chooseDirectory())"
          >
            {{
              downloads.state.preferences.directory ? "更改位置" : "选择位置"
            }}</button
          ><button
            class="download-settings-toggle"
            :aria-expanded="settingsOpen"
            @click="settingsOpen = !settingsOpen"
          >
            <Icon name="sliders" :size="14" />下载设置<Icon
              name="chevron"
              :size="12"
            />
          </button>
        </div>
        <div v-if="settingsOpen" class="download-settings">
          <label
            >连接方式<SelectMenu
              v-model="preferences.connection"
              label="下载连接方式"
              :disabled="busy"
              :options="
                [
                  { value: 'system', label: '跟随系统代理' },
                  { value: 'direct', label: '直接连接' },
                  { value: 'manual', label: '手动代理' },
                ] as const
              "
          /></label>
          <label
            v-if="preferences.connection === 'manual'"
            class="download-proxy"
            >代理地址<input
              v-model="preferences.proxy"
              placeholder="http://127.0.0.1:7890"
              aria-label="下载代理地址"
              :disabled="busy"
          /></label>
          <label class="download-check"
            ><input
              v-model="preferences.autoImport"
              type="checkbox"
              :disabled="busy"
            />完成后加入视频库</label
          >
          <button
            class="button secondary"
            :disabled="busy"
            @click="
              action(async () => {
                await api!.configure({ ...preferences });
                settingsOpen = false;
              })
            "
          >
            保存设置
          </button>
          <p>
            支持 HTTP(S) /
            SOCKS5，不支持带账号密码的代理。下载任务仅在本次会话保留；退出后不会自动重新下载。
          </p>
        </div>
        <p v-if="message" class="download-error" role="alert">{{ message }}</p>
      </div>

      <div v-if="preview" class="download-preview">
        <div class="download-section-title">
          <h2>
            找到 {{ preview.videos.length }} 个视频
            <span>选择喜欢的，再留住</span>
          </h2>
          <span>优先保存可用的 MP4</span>
        </div>
        <div
          v-for="video in preview.videos"
          :key="video.id"
          class="download-video-row"
        >
          <input
            v-model="selected"
            type="checkbox"
            :value="video.id"
            :aria-label="`选择第 ${video.index} 个视频`"
          />
          <div class="download-thumb">
            <img v-if="video.thumbnail" :src="video.thumbnail" alt="" /><Icon
              v-else
              name="film"
              :size="24"
            /><span>{{ time(video.duration) }}</span>
          </div>
          <div class="download-video-info">
            <strong>{{ video.title }}</strong
            ><span>{{ video.author }} · 视频 {{ video.index }}</span>
          </div>
          <SelectMenu
            :model-value="qualities[video.id] ?? 0"
            :label="`视频 ${video.index} 清晰度`"
            :options="[
              { value: 0, label: '最高可用画质' },
              ...video.qualities.map((height) => ({
                value: height,
                label: `${height}P`,
              })),
            ]"
            @update:model-value="qualities[video.id] = $event"
          />
        </div>
        <div class="download-preview-footer">
          <span>{{
            downloads.state.preferences.autoImport
              ? "完成后加入视频库 · 不自动播放"
              : "仅保存到文件夹"
          }}</span
          ><button
            class="button primary"
            :disabled="
              !selected.length ||
              !downloads.state.preferences.directory ||
              working
            "
            @click="enqueue"
          >
            <Icon name="download" :size="15" />下载选中的
            {{ selected.length }} 个视频
          </button>
        </div>
      </div>

      <div class="download-section-title">
        <h2>
          下载任务
          <span>{{
            downloads.pending
              ? `${downloads.pending} 个进行中`
              : "把喜欢慢慢收好"
          }}</span>
        </h2>
        <button
          v-if="
            tasks.some((task) =>
              ['complete', 'failed', 'cancelled'].includes(task.status),
            )
          "
          class="text-button"
          @click="action(() => api!.clearFinished())"
        >
          清除已结束记录
        </button>
      </div>
      <div v-if="!tasks.length" class="download-empty">
        <div><Icon name="download" :size="30" /></div>
        <strong>还没有下载任务</strong>
        <p>复制一条帖子链接，收藏从这里开始。</p>
        <span>支持公开帖子中的原生视频 · 多视频可分别选择</span>
      </div>
      <TransitionGroup
        v-else
        name="download-task"
        tag="div"
        class="download-task-list"
      >
        <article
          v-for="task in tasks"
          :key="task.id"
          class="download-task"
          :class="`task-${task.status}`"
        >
          <div class="download-thumb">
            <img
              v-if="task.video.thumbnail"
              :src="task.video.thumbnail"
              alt=""
            /><Icon v-else name="film" :size="23" /><span>{{
              time(task.video.duration)
            }}</span>
          </div>
          <div class="download-task-body">
            <div class="download-task-title">
              <strong>{{ task.video.title }}</strong
              ><span class="download-status"
                ><Icon
                  :name="
                    task.status === 'complete'
                      ? 'check'
                      : task.status === 'failed'
                        ? 'warning'
                        : 'download'
                  "
                  :size="12"
                />{{ label(task) }}</span
              >
            </div>
            <div class="download-task-meta">
              <span
                >{{ task.video.author }} ·
                {{ task.quality ? `${task.quality}P` : "最高可用画质" }}</span
              ><span v-if="task.status === 'downloading'"
                >{{
                  task.progress === null
                    ? "计算进度中"
                    : `${task.progress.toFixed(1)}%`
                }}<template v-if="task.speed !== null">
                  · {{ size(task.speed) }}/s</template
                ><template v-if="task.eta !== null">
                  · 约 {{ time(task.eta) }}</template
                ></span
              ><span v-else-if="task.imported">已加入视频库</span>
            </div>
            <div
              v-if="
                ['downloading', 'processing', 'queued'].includes(task.status)
              "
              class="download-track"
              :class="{
                indeterminate:
                  task.progress === null && task.status !== 'queued',
              }"
            >
              <span :style="{ width: `${task.progress || 0}%` }"></span>
            </div>
            <p v-if="task.error || task.importError" class="download-error">
              {{ task.error || task.importError }}
            </p>
            <p v-if="task.file" class="download-file" :title="task.file">
              {{ task.file }}
            </p>
          </div>
          <div class="download-task-actions">
            <button
              v-if="
                ['queued', 'downloading', 'processing'].includes(task.status)
              "
              class="icon-button"
              aria-label="取消下载"
              title="取消下载并清理未完成文件"
              @click="taskAction(() => api!.cancel(task.id))"
            >
              <Icon name="close" :size="16" /></button
            ><button
              v-if="['failed', 'cancelled'].includes(task.status)"
              class="button secondary"
              @click="taskAction(() => api!.retry(task.id))"
            >
              <Icon name="refresh" :size="14" />重试</button
            ><template v-if="task.status === 'complete'"
              ><button
                v-if="!task.imported"
                class="text-button"
                :disabled="task.importing"
                @click="taskAction(() => api!.importFile(task.id))"
              >
                {{
                  task.importing
                    ? "正在入库"
                    : task.importError
                      ? "重试入库"
                      : "加入视频库"
                }}</button
              ><button
                class="icon-button"
                aria-label="定位下载文件"
                title="在文件夹中显示"
                @click="taskAction(() => api!.reveal(task.id))"
              >
                <Icon name="folder" :size="17" /></button
            ></template>
          </div>
        </article>
      </TransitionGroup>
      <p class="download-footnote">
        <Icon
          name="shield"
          :size="13"
        />下载的文件留在你选择的文件夹。清除任务记录不会删除视频。
      </p>
    </template>
  </section>
</template>

<style scoped>
.downloads-view {
  max-width: 1100px;
  margin: 0 auto;
  padding-bottom: 28px;
}
.download-intro {
  display: flex;
  align-items: center;
  gap: 17px;
  padding: 24px 27px;
  margin: 0 0 20px;
  background: linear-gradient(120deg, var(--accent-wash), transparent 80%);
  border: 1px solid var(--strong-line);
  border-radius: 16px;
}
.download-intro-icon {
  width: 51px;
  height: 51px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: var(--accent-wash);
  color: var(--accent-text);
}
.download-intro strong {
  font-size: 17px;
  font-weight: 550;
}
.download-intro p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.download-site {
  margin-left: auto;
  font-size: 35px;
  color: var(--accent-text);
  display: flex;
  align-items: center;
  gap: 13px;
}
.download-site span {
  font-size: 8px;
  letter-spacing: 2px;
  max-width: 55px;
  line-height: 1.8;
  color: var(--dim);
}
.download-composer,
.download-preview,
.download-engine {
  background: var(--panel);
  border: 1px solid var(--strong-line);
  border-radius: 13px;
  padding: 20px;
  margin-bottom: 24px;
}
.download-link-row {
  display: flex;
  align-items: stretch;
  gap: 12px;
}
.download-link-row > .button {
  height: 46px;
  flex-shrink: 0;
}
.download-link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--strong-line);
  border-radius: 9px;
  height: 46px;
  padding: 0 12px;
  color: var(--muted);
  background: var(--bg);
}
.download-link:focus-within {
  border-color: var(--accent);
}
.download-link input {
  width: 100%;
  min-width: 0;
  background: none;
  border: 0;
  color: var(--text);
  height: 100%;
  padding: 0;
  outline: none;
  font-size: 13px;
}
.download-link .text-button {
  flex-shrink: 0;
  font-size: 12px;
  align-self: stretch;
  padding-inline: 4px;
}
.download-link-row > .button:hover {
  transform: none;
}
.download-location {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 16px;
  color: var(--dim);
  font-size: 11px;
}
.download-location > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 58%;
}
.download-location .text-button {
  font-size: 11px;
  white-space: nowrap;
}
.download-settings-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--muted);
  padding: 5px;
  white-space: nowrap;
}
.download-settings {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 16px;
  padding-top: 19px;
  margin-top: 15px;
  border-top: 1px solid var(--line);
}
.download-settings > label:not(.download-check) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}
.download-settings input:not([type="checkbox"]) {
  height: 34px;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--strong-line);
  border-radius: 6px;
  padding: 7px 10px;
  min-width: 155px;
}
.download-proxy {
  flex: 1;
}
.download-check {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  font-size: 12px;
  color: var(--muted);
}
.download-settings .select-field {
  min-width: 155px;
}
.download-video-row > .select-field {
  min-width: 136px;
  max-width: 190px;
}
.download-settings > p {
  width: 100%;
  margin: 0;
  color: var(--dim);
  font-size: 11px;
  line-height: 1.8;
}
.download-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 17px;
}
.download-section-title h2 {
  font-size: 14px;
  font-weight: 550;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}
.download-section-title > span,
.download-section-title h2 span {
  font-size: 11px;
  font-weight: 400;
  color: var(--dim);
}
.download-video-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
}
.download-thumb {
  width: 110px;
  height: 65px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg);
  flex-shrink: 0;
  position: relative;
  display: grid;
  place-items: center;
  color: var(--dim);
}
.download-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  inset: 0;
}
.download-thumb > span {
  position: absolute;
  bottom: 5px;
  right: 6px;
  font-size: 9px;
  color: #fff;
  background: #0008;
  padding: 2px 5px;
  border-radius: 4px;
}
.download-video-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.download-video-info > strong,
.download-task-title > strong {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.download-video-info > span {
  font-size: 11px;
  color: var(--dim);
}
.download-preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.download-preview-footer > span {
  font-size: 11px;
  color: var(--dim);
}
.download-empty {
  text-align: center;
  padding: 50px 15px 43px;
  background: var(--panel);
  border: 1px dashed var(--strong-line);
  border-radius: 13px;
}
.download-empty > div {
  display: grid;
  place-items: center;
  width: 66px;
  height: 66px;
  border-radius: 20px;
  background: var(--accent-wash);
  color: var(--accent-text);
  margin: 0 auto 18px;
}
.download-empty strong {
  font-weight: 500;
  font-size: 14px;
}
.download-empty p {
  font-size: 12px;
  color: var(--muted);
  margin: 10px 0 17px;
}
.download-empty > span {
  font-size: 10px;
  color: var(--dim);
}
.download-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.download-task {
  display: flex;
  align-items: center;
  gap: 17px;
  padding: 18px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.download-task-body {
  min-width: 0;
  flex: 1;
}
.download-task-title {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.download-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--accent-text);
  font-size: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}
.task-complete .download-status {
  color: var(--green);
}
.task-failed .download-status {
  color: #c78c80;
}
.task-cancelled .download-status {
  color: var(--dim);
}
.download-task-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 9px 0;
  color: var(--dim);
  font-size: 10px;
}
.download-track {
  height: 4px;
  overflow: hidden;
  border-radius: 6px;
  background: var(--accent-wash);
  margin-top: 12px;
}
.download-track > span {
  display: block;
  height: 100%;
  border-radius: 6px;
  background: var(--accent);
  transition: width 0.25s;
}
.download-track.indeterminate > span {
  width: 28% !important;
  animation: download-progress 1.8s ease-in-out infinite;
}
.download-task-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.download-task-actions .text-button {
  font-size: 11px;
}
.download-file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dim);
  font-size: 10px;
  margin: 8px 0 0;
}
.download-error {
  color: #c38578;
  font-size: 12px;
  line-height: 1.8;
  margin: 12px 0 0;
  overflow-wrap: anywhere;
}
.download-footnote {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  color: var(--dim);
  font-size: 10px;
  margin-top: 25px;
}
.download-engine {
  border-color: var(--strong-line);
  background: var(--accent-wash);
}
.download-engine-heading {
  display: flex;
  gap: 13px;
  align-items: center;
  color: var(--accent-text);
}
.download-engine-heading strong {
  font-size: 13px;
  font-weight: 500;
}
.download-engine-heading p {
  margin: 7px 0;
  color: var(--muted);
  font-size: 11px;
}
.download-engine-actions {
  display: flex;
  align-items: center;
  gap: 17px;
  margin-top: 15px;
}
.download-engine-actions > span {
  font-size: 10px;
  color: var(--dim);
  margin-left: auto;
}
.download-disclosure {
  font-size: 10px;
  line-height: 1.8;
  color: var(--dim);
  margin: 14px 0 0;
}
.download-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px;
  background: var(--panel);
  border-radius: 12px;
  color: var(--muted);
}
.download-task-enter-active,
.download-task-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.download-task-enter-from,
.download-task-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@keyframes download-progress {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(450%);
  }
}
@media (max-width: 1100px) {
  .download-site {
    display: none;
  }
  .download-task {
    gap: 12px;
    padding: 14px;
  }
  .download-thumb {
    width: 90px;
    height: 57px;
  }
  .download-task-title {
    align-items: start;
  }
  .download-section-title h2 span {
    display: none;
  }
  .download-task-meta {
    flex-wrap: wrap;
    gap: 6px;
  }
  .download-preview-footer {
    flex-wrap: wrap;
  }
  .download-intro {
    padding: 20px;
  }
  .download-task-actions {
    gap: 4px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
:global(.reduced-motion) .download-track > span {
  animation: none;
  transition: none;
}
</style>
