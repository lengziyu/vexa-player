import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { DownloadSnapshot } from "../shared/downloads";

export const useDownloads = defineStore("downloads", () => {
  const state = ref<DownloadSnapshot | null>(null);
  const pending = computed(
    () =>
      state.value?.tasks.filter((task) =>
        ["queued", "downloading", "processing"].includes(task.status),
      ).length || 0,
  );
  async function init(): Promise<() => void> {
    const api = window.vexa?.downloads;
    if (!api) return () => {};
    let changed = false;
    const unsubscribe = api.onChange((snapshot) => {
      changed = true;
      state.value = snapshot;
    });
    try {
      const snapshot = await api.snapshot();
      if (!changed) state.value = snapshot;
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return unsubscribe;
  }
  return { state, pending, init };
});
