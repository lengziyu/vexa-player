<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { CSSProperties } from "vue";
import type { DownloadSnapshot } from "../shared/downloads";
import Icon from "./Icon.vue";

const props = defineProps<{
  authentication: DownloadSnapshot["authentication"];
  busy: boolean;
  feedback: string;
}>();
defineEmits<{ connect: []; disconnect: []; browser: []; import: [] }>();
const open = ref(false),
  root = ref<HTMLElement>(),
  trigger = ref<HTMLButtonElement>(),
  panel = ref<HTMLElement>();
const position = ref<CSSProperties>({});
const attention = computed(
  () =>
    !!props.authentication.error || !!props.authentication.diagnostics.length,
);
let observer: ResizeObserver | undefined;

function close(restore = false): void {
  open.value = false;
  if (restore)
    void nextTick(() => trigger.value?.focus({ preventScroll: true }));
}
function contains(target: EventTarget | null): boolean {
  return (
    target instanceof Node &&
    (!!root.value?.contains(target) || !!panel.value?.contains(target))
  );
}
function outside(event: Event): void {
  if (open.value && !contains(event.target)) close();
}
function place(): void {
  if (!open.value || !trigger.value) return;
  const anchor = trigger.value.getBoundingClientRect(),
    margin = 16,
    gap = 10;
  if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
    close();
    return;
  }
  const width = Math.min(420, window.innerWidth - margin * 2);
  const below = window.innerHeight - anchor.bottom - gap - margin;
  const above = anchor.top - gap - margin;
  const flip = below < 360 && above > below;
  position.value = {
    width: `${width}px`,
    left: `${Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin))}px`,
    top: flip ? undefined : `${anchor.bottom + gap}px`,
    bottom: flip ? `${window.innerHeight - anchor.top + gap}px` : undefined,
    maxHeight: `${Math.min(560, Math.max(0, flip ? above : below))}px`,
    transformOrigin: flip ? "bottom right" : "top right",
  };
}
watch(open, async (value) => {
  if (!value) return;
  place();
  await nextTick();
  if (open.value) panel.value?.focus({ preventScroll: true });
});
onMounted(() => {
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("focusin", outside);
  window.addEventListener("resize", place);
  document.addEventListener("scroll", place, true);
  observer = new ResizeObserver(place);
  if (trigger.value) observer.observe(trigger.value);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("focusin", outside);
  window.removeEventListener("resize", place);
  document.removeEventListener("scroll", place, true);
  observer?.disconnect();
});
</script>

<template>
  <div ref="root" class="x-login-row" @keydown.esc.prevent.stop="close(true)">
    <div class="x-login-summary" aria-live="polite">
      <Icon :name="authentication.connected ? 'check' : 'link'" :size="14" />
      <span>{{
        authentication.connected
          ? "已连接 X"
          : authentication.connecting
            ? "等待 X 登录"
            : "公开链接可直接解析"
      }}</span>
      <small>{{
        authentication.connected ? "登录状态仅在本机保存" : "登录可选"
      }}</small>
    </div>
    <button
      ref="trigger"
      class="x-login-trigger"
      :class="{ active: open }"
      aria-haspopup="dialog"
      aria-controls="x-login-popover"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon name="shield" :size="14" />X 登录与隐私
      <span
        v-if="attention"
        class="x-login-attention"
        aria-label="有登录连接诊断"
      ></span>
      <Icon name="chevron" :size="12" />
    </button>
    <Teleport to="body">
      <Transition name="x-login-popover">
        <section
          v-if="open"
          id="x-login-popover"
          ref="panel"
          class="x-login-popover"
          :style="position"
          role="dialog"
          aria-modal="false"
          aria-labelledby="x-login-heading"
          tabindex="-1"
          @keydown.esc.prevent.stop="close(true)"
        >
          <header class="x-login-heading">
            <span class="x-login-heading-icon"
              ><Icon name="shield" :size="19"
            /></span>
            <div>
              <h2 id="x-login-heading">X 登录与隐私</h2>
              <p>可选连接 · 本地功能无需账号</p>
            </div>
            <button
              class="icon-button tiny"
              aria-label="关闭 X 登录面板"
              @click="close(true)"
            >
              <Icon name="close" :size="15" />
            </button>
          </header>
          <div
            v-if="authentication.connected || authentication.connecting"
            class="x-login-state"
            role="status"
          >
            <Icon
              :name="authentication.connected ? 'check' : 'loading'"
              :size="14"
            />
            {{
              authentication.connected
                ? "已连接 X，登录状态在本机加密保存"
                : "登录窗口已打开，完成后会自动连接"
            }}
          </div>
          <section class="x-login-explanation">
            <h3>什么时候需要登录？</h3>
            <p>
              公开链接可先直接解析。部分视频需要登录或仅对特定账号可见时，可连接有权查看内容的
              X 账号；连接后仍受 X 原有访问限制。
            </p>
          </section>
          <section class="x-login-privacy">
            <h3><Icon name="lock" :size="13" />权限与隐私</h3>
            <ul>
              <li>密码只在 X 官方页面输入，本应用不读取或保存密码。</li>
              <li>
                登录状态在本机加密保存，仅供本机组件解析、下载使用；临时文件用后清理，不写入任务记录。
              </li>
              <li>不会自动读取其他浏览器账号，也不会替你发帖、点赞或关注。</li>
            </ul>
            <p class="x-login-sensitive">
              登录文件代表你的账号会话，并非仅限下载的独立授权，请像密码一样保管，切勿分享。
            </p>
          </section>
          <div class="x-login-actions">
            <button
              v-if="!authentication.connected"
              class="button primary"
              :disabled="busy"
              @click="$emit('connect')"
            >
              <Icon name="link" :size="14" />{{
                authentication.connecting ? "返回登录窗口" : "连接 X"
              }}
            </button>
            <button
              v-else
              class="button secondary"
              :disabled="busy"
              @click="$emit('disconnect')"
            >
              <Icon name="unlink" :size="14" />断开并清除登录
            </button>
            <span>{{
              busy ? "请等待当前操作完成" : "由你主动选择，随时可断开"
            }}</span>
          </div>
          <details class="x-login-alternatives">
            <summary>使用浏览器或登录文件</summary>
            <p>
              窗口报错或需要第三方登录时，在浏览器登录 X 并导出该站点的 Netscape
              Cookie 文件，再选择导入。浏览器登录不会自动连接到本应用。
            </p>
            <div>
              <button
                class="text-button"
                :disabled="busy"
                @click="$emit('browser')"
              >
                在浏览器打开 X<Icon name="arrow" :size="12" /></button
              ><button
                class="text-button"
                :disabled="busy"
                @click="$emit('import')"
              >
                <Icon name="upload" :size="12" />导入 X 登录文件
              </button>
            </div>
          </details>
          <p
            v-if="feedback || authentication.error"
            class="x-login-error"
            role="alert"
          >
            {{ feedback || authentication.error }}
          </p>
          <details
            v-if="authentication.diagnostics.length"
            class="x-login-diagnostics"
          >
            <summary>
              登录连接诊断 · {{ authentication.diagnostics.length }} 项
            </summary>
            <p>以下仅为连接状态，不能据此判断密码错误。</p>
            <ul>
              <li
                v-for="(entry, index) in authentication.diagnostics"
                :key="index"
              >
                {{ entry.service }}：{{ entry.message }}
              </li>
            </ul>
          </details>
          <footer>
            断开连接会清除本应用保存的登录状态；自行导出的原始文件需另行删除。
          </footer>
        </section>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.x-login-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 16px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--line);
}
.x-login-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  color: var(--muted);
  font-size: 11px;
}
.x-login-summary > svg {
  color: var(--accent-text);
}
.x-login-summary small {
  color: var(--dim);
  font-size: 10px;
}
.x-login-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  margin-right: -5px;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 11px;
  color: var(--accent-text);
  white-space: nowrap;
  transition:
    background 0.16s,
    border-color 0.16s;
}
.x-login-trigger:hover,
.x-login-trigger.active {
  background: var(--accent-wash);
  border-color: var(--strong-line);
}
.x-login-trigger.active > svg:last-child {
  transform: rotate(180deg);
}
.x-login-attention {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.x-login-popover {
  position: fixed;
  z-index: 90;
  padding: 20px;
  border: 1px solid var(--strong-line);
  border-radius: 15px;
  background: var(--elevated);
  box-shadow: var(--modal-shadow);
  color: var(--text);
  overflow: auto;
  overscroll-behavior: contain;
  font-size: 11px;
  line-height: 1.8;
  scrollbar-width: thin;
  outline: none;
}
.x-login-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.x-login-heading-icon {
  display: grid;
  place-items: center;
  width: 35px;
  height: 35px;
  border-radius: 10px;
  background: var(--accent-wash);
  color: var(--accent-text);
  flex-shrink: 0;
}
.x-login-heading > div {
  flex: 1;
}
.x-login-heading h2 {
  font-size: 14px;
  font-weight: 550;
  margin: 0;
}
.x-login-heading p {
  font-size: 10px;
  color: var(--dim);
  margin: 2px 0 0;
}
.x-login-heading button {
  align-self: start;
  flex-shrink: 0;
}
.x-login-state {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 11px;
  margin-bottom: 15px;
  border-radius: 8px;
  background: var(--accent-wash);
  color: var(--accent-text);
}
.x-login-popover h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 550;
  margin: 0 0 6px;
}
.x-login-explanation p {
  margin: 0;
  color: var(--muted);
}
.x-login-privacy {
  margin-top: 17px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.x-login-privacy h3 {
  color: var(--accent-text);
}
.x-login-privacy ul {
  padding-left: 15px;
  margin: 8px 0;
  color: var(--muted);
}
.x-login-privacy li + li {
  margin-top: 5px;
}
.x-login-sensitive {
  padding: 9px 11px;
  margin: 11px 0 0;
  background: var(--accent-wash);
  color: var(--accent-text);
  border-radius: 8px;
  font-size: 10px;
}
.x-login-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 17px 0 14px;
}
.x-login-actions .button {
  height: 34px;
  padding: 0 12px;
  font-size: 11px;
}
.x-login-actions > span {
  color: var(--dim);
  font-size: 10px;
}
.x-login-alternatives,
.x-login-diagnostics {
  border-top: 1px solid var(--line);
  padding-top: 11px;
  margin-top: 11px;
}
.x-login-popover summary {
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 10px;
}
.x-login-popover summary::-webkit-details-marker {
  display: none;
}
.x-login-popover summary::before {
  content: "";
  width: 5px;
  height: 5px;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: rotate(-45deg);
  transition: transform 0.16s;
}
.x-login-popover details[open] > summary::before {
  transform: rotate(45deg);
}
.x-login-popover summary:hover {
  color: var(--accent-text);
}
.x-login-alternatives > p,
.x-login-diagnostics > p {
  margin: 9px 0;
  color: var(--muted);
  font-size: 10px;
}
.x-login-alternatives > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 17px;
}
.x-login-alternatives .text-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}
.x-login-error {
  margin: 12px 0;
  color: #dc9278;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.x-login-diagnostics ul {
  margin: 0;
  padding-left: 15px;
  color: var(--muted);
  overflow-wrap: anywhere;
  font-size: 10px;
}
.x-login-popover footer {
  margin-top: 15px;
  color: var(--dim);
  font-size: 9px;
  line-height: 1.8;
}
.x-login-popover-enter-active,
.x-login-popover-leave-active {
  transition:
    opacity 0.16s,
    transform 0.16s var(--ease);
}
.x-login-popover-enter-from,
.x-login-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.985);
}
@media (prefers-reduced-motion: reduce) {
  .x-login-popover-enter-active,
  .x-login-popover-leave-active {
    transition: none;
  }
}
:global(.reduced-motion) .x-login-popover-enter-active,
:global(.reduced-motion) .x-login-popover-leave-active {
  transition: none;
}
</style>
