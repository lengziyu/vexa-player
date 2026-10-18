import { onScopeDispose, ref, watch } from "vue";

export function useIdleControls(
  active: () => boolean,
  pinned: () => boolean,
  delay = 2800,
) {
  const idle = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear(): void {
    clearTimeout(timer);
    timer = undefined;
  }
  function expire(): void {
    if (!active()) {
      idle.value = false;
      clear();
      return;
    }
    if (pinned()) {
      timer = setTimeout(expire, 500);
      return;
    }
    idle.value = true;
    timer = undefined;
  }
  function wake(): void {
    clear();
    idle.value = false;
    if (active()) timer = setTimeout(expire, delay);
  }
  watch([active, pinned], wake, { immediate: true });
  onScopeDispose(clear);
  return { idle, wake };
}
