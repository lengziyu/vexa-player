<script setup lang="ts" generic="T extends string | number">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import type { CSSProperties } from "vue";
import Icon from "./Icon.vue";
import { activeSelectMenu } from "../composables/useSelectMenu";

const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: readonly { value: T; label: string; disabled?: boolean }[];
    label: string;
    disabled?: boolean;
    compact?: boolean;
    video?: boolean;
  }>(),
  { disabled: false, compact: false, video: false },
);
const emit = defineEmits<{ "update:modelValue": [value: T] }>();
const id = `select-${useId()}`,
  open = ref(false),
  active = ref(-1);
const root = ref<HTMLElement>(),
  trigger = ref<HTMLButtonElement>(),
  menu = ref<HTMLElement>();
const target = ref<Element>(document.fullscreenElement || document.body);
const darkSurface = computed(
  () => props.video || target.value !== document.body,
);
const position = ref<CSSProperties>({});
const current = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
let search = "",
  searchedAt = 0,
  observer: ResizeObserver | undefined;

function close(): void {
  open.value = false;
  search = "";
}
function place(): void {
  if (!open.value || !trigger.value) return;
  const anchor = trigger.value.getBoundingClientRect(),
    margin = 12,
    gap = 7;
  if (anchor.bottom < 0 || anchor.top > innerHeight) {
    close();
    return;
  }
  const width = Math.min(
    Math.max(anchor.width, props.video ? 136 : 164),
    innerWidth - margin * 2,
  );
  const below = innerHeight - anchor.bottom - gap - margin,
    above = anchor.top - gap - margin;
  const flip =
    below < Math.min(240, props.options.length * 32 + 42) && above > below;
  position.value = {
    left: `${Math.max(margin, Math.min(anchor.left, innerWidth - width - margin))}px`,
    top: flip ? undefined : `${anchor.bottom + gap}px`,
    bottom: flip ? `${innerHeight - anchor.top + gap}px` : undefined,
    width: `${width}px`,
    maxHeight: `${Math.min(320, Math.max(0, flip ? above : below))}px`,
    transformOrigin: flip ? "bottom left" : "top left",
  };
}
function scrollActive(): void {
  void nextTick(() =>
    menu.value
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" }),
  );
}
function show(): void {
  if (props.disabled || !props.options.some((option) => !option.disabled))
    return;
  target.value = document.fullscreenElement || document.body;
  active.value = props.options.findIndex(
    (option) => option.value === props.modelValue && !option.disabled,
  );
  if (active.value < 0)
    active.value = props.options.findIndex((option) => !option.disabled);
  open.value = true;
  place();
  scrollActive();
}
function choose(index: number): void {
  const option = props.options[index];
  if (props.disabled || !option || option.disabled) return;
  emit("update:modelValue", option.value);
  close();
}
function move(direction: number): void {
  for (let step = 1; step <= props.options.length; step++) {
    const index =
      (active.value + step * direction + props.options.length) %
      props.options.length;
    if (!props.options[index]?.disabled) {
      active.value = index;
      scrollActive();
      return;
    }
  }
}
function keydown(event: KeyboardEvent): void {
  if (props.disabled || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Tab") {
    close();
    return;
  }
  if (event.key === "Escape") {
    if (open.value) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    return;
  }
  if (
    ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)
  ) {
    event.preventDefault();
    event.stopPropagation();
    const wasOpen = open.value;
    if (!wasOpen) show();
    else if (event.key === "Enter" || event.key === " ") choose(active.value);
    else if (event.key === "ArrowDown" || event.key === "ArrowUp")
      move(event.key === "ArrowDown" ? 1 : -1);
    if (event.key === "Home" || event.key === "End") {
      active.value =
        event.key === "Home"
          ? props.options.findIndex((option) => !option.disabled)
          : props.options.findLastIndex((option) => !option.disabled);
      scrollActive();
    }
  } else if (event.key.length === 1) {
    event.preventDefault();
    event.stopPropagation();
    if (!open.value) show();
    search = Date.now() - searchedAt > 700 ? event.key : search + event.key;
    searchedAt = Date.now();
    const index = props.options.findIndex(
      (option) =>
        !option.disabled &&
        option.label.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()),
    );
    if (index >= 0) {
      active.value = index;
      scrollActive();
    }
  }
}
function outside(event: Event): void {
  if (
    open.value &&
    event.target instanceof Node &&
    !root.value?.contains(event.target) &&
    !menu.value?.contains(event.target)
  )
    close();
}
function fullscreen(): void {
  close();
  target.value = document.fullscreenElement || document.body;
}
watch(open, (value) => {
  if (value) activeSelectMenu.value = id;
  else if (activeSelectMenu.value === id) activeSelectMenu.value = null;
});
watch(activeSelectMenu, (value) => {
  if (open.value && value !== id) close();
});
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close();
  },
);
watch(
  () => props.options,
  (options) => {
    if (open.value && !options[active.value]) close();
  },
);
onMounted(() => {
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("focusin", outside);
  document.addEventListener("scroll", place, true);
  document.addEventListener("fullscreenchange", fullscreen);
  window.addEventListener("resize", place);
  observer = new ResizeObserver(place);
  if (trigger.value) observer.observe(trigger.value);
});
onBeforeUnmount(() => {
  if (activeSelectMenu.value === id) activeSelectMenu.value = null;
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("focusin", outside);
  document.removeEventListener("scroll", place, true);
  document.removeEventListener("fullscreenchange", fullscreen);
  window.removeEventListener("resize", place);
  observer?.disconnect();
});
</script>

<template>
  <span ref="root" class="select-field" :class="{ compact, 'on-video': video }">
    <button
      ref="trigger"
      type="button"
      role="combobox"
      class="select-trigger"
      :class="{ expanded: open }"
      :aria-label="label"
      :title="current?.label"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-controls="id"
      :aria-activedescendant="
        open && active >= 0 ? `${id}-${active}` : undefined
      "
      :disabled="disabled"
      @click.stop="open ? close() : show()"
      @dblclick.stop
      @keydown="keydown"
    >
      <span>{{ current?.label || "请选择" }}</span
      ><Icon name="chevron" :size="12" />
    </button>
    <Teleport :to="target">
      <Transition name="select-menu">
        <div
          v-if="open"
          :id="id"
          ref="menu"
          class="select-menu"
          :class="{ 'video-menu': darkSurface }"
          role="listbox"
          :aria-label="label"
          :style="position"
          @pointerdown.prevent
          @click.stop
          @dblclick.stop
        >
          <div class="select-menu-label" aria-hidden="true">{{ label }}</div>
          <div
            v-for="(option, index) in options"
            :id="`${id}-${index}`"
            :key="option.value"
            class="select-option"
            role="option"
            :aria-selected="option.value === modelValue"
            :aria-disabled="!!option.disabled"
            :data-active="index === active"
            :data-value="String(option.value)"
            @pointermove="!option.disabled && (active = index)"
            @click="choose(index)"
          >
            <span>{{ option.label }}</span
            ><Icon v-if="option.value === modelValue" name="check" :size="13" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.select-field {
  display: inline-flex;
  min-width: 0;
  vertical-align: middle;
}
.select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--strong-line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--muted);
  font-size: 11px;
  text-align: left;
  transition:
    background 0.16s,
    border-color 0.16s,
    color 0.16s;
}
.select-trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-trigger > svg {
  flex-shrink: 0;
  color: var(--dim);
  transition: transform 0.16s;
}
.select-trigger:not(:disabled):hover {
  background: var(--accent-wash);
  border-color: var(--accent);
  color: var(--accent-text);
}
.select-trigger.expanded {
  border-color: var(--accent);
  color: var(--accent-text);
  background: var(--accent-wash);
}
.select-trigger.expanded > svg {
  transform: rotate(180deg);
  color: var(--accent-text);
}
.compact .select-trigger {
  height: 27px;
  padding: 0 8px;
  font-size: 10px;
  gap: 8px;
}
.on-video .select-trigger {
  height: 24px;
  background: #19141fc9;
  color: #eee5f6;
  border-color: #ffffff25;
  font-size: 10px;
}
.on-video .select-trigger > svg {
  color: #c3b4ce;
}
.on-video .select-trigger.expanded,
.on-video .select-trigger:hover {
  border-color: #b8a0ed;
  background: #33283fcf;
  color: #eee5f6;
}
.select-menu {
  position: fixed;
  z-index: 180;
  padding: 5px;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--strong-line);
  border-radius: 11px;
  background: var(--elevated);
  box-shadow: var(--modal-shadow);
  color: var(--text);
  scrollbar-width: thin;
}
.select-menu-label {
  padding: 5px 9px 7px;
  margin-bottom: 3px;
  font-size: 9px;
  letter-spacing: 0.3px;
  color: var(--dim);
  border-bottom: 1px solid var(--line);
}
.video-menu {
  --elevated: #24202d;
  --text: #edeaf2;
  --muted: #b9afc8;
  --dim: #8f829e;
  --line: #ffffff0d;
  --strong-line: #ffffff1d;
  --hover: #ffffff0a;
  --accent-text: #d2bbf5;
  --accent-wash: #b8a0ed1b;
  --modal-shadow: 0 18px 55px #0007;
}
:global(:root[data-accent="sage"]) .video-menu {
  --accent-text: #b4d7c4;
  --accent-wash: #a3c6b31b;
}
:global(:root[data-accent="sand"]) .video-menu {
  --accent-text: #e3c7a7;
  --accent-wash: #d7b9931b;
}
.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  min-height: 31px;
  padding: 5px 9px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.6;
  cursor: pointer;
  color: var(--muted);
  transition:
    background 0.1s,
    color 0.1s;
}
.select-option > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.select-option > svg {
  flex-shrink: 0;
  color: var(--accent-text);
}
.select-option[aria-selected="true"] {
  background: var(--accent-wash);
  color: var(--accent-text);
}
.select-option[data-active="true"] {
  background: var(--hover);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--strong-line);
}
.select-option[data-active="true"][aria-selected="true"] {
  background: var(--accent-wash);
  color: var(--accent-text);
}
.select-option[aria-disabled="true"] {
  opacity: 0.4;
  cursor: default;
}
.select-menu-enter-active,
.select-menu-leave-active {
  transition:
    opacity 0.14s,
    transform 0.14s var(--ease);
}
.select-menu-enter-from,
.select-menu-leave-to {
  opacity: 0;
  transform: translateY(-3px) scale(0.98);
}
</style>
