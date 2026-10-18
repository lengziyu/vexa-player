import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";
import { defaultSettings, type Settings } from "../shared/contracts";
import { validateSettings } from "../shared/validation";

export const useSettings = defineStore("settings", () => {
  const values = ref<Settings>({ ...defaultSettings });
  const systemDark = ref(matchMedia("(prefers-color-scheme: dark)").matches);
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    (event) => (systemDark.value = event.matches),
  );
  const resolvedTheme = computed(() =>
    values.value.theme === "system"
      ? systemDark.value
        ? "dark"
        : "light"
      : values.value.theme,
  );
  watchEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme.value;
    document.documentElement.dataset.accent = values.value.accent;
    document.documentElement.classList.toggle(
      "reduced-motion",
      values.value.reducedMotion,
    );
  });
  async function init(): Promise<void> {
    if (window.vexa) {
      values.value = await window.vexa.getSettings();
      systemDark.value = await window.vexa.getSystemDark();
      window.vexa.onAppearance(dark => systemDark.value = dark);
    }
    else {
      try {
        const saved = JSON.parse(
          localStorage.getItem("vexa-preferences") || "{}",
        ) as unknown;
        values.value = { ...defaultSettings, ...validateSettings(saved) };
      } catch {}
    }
  }
  let saving = Promise.resolve();
  function set(patch: Partial<Settings>): Promise<void> {
    validateSettings(patch);
    const before = { ...values.value };
    values.value = { ...values.value, ...patch };
    saving = saving
      .catch(() => {})
      .then(async () => {
        try {
          if (window.vexa) await window.vexa.setSettings(patch);
          else
            localStorage.setItem(
              "vexa-preferences",
              JSON.stringify(values.value),
            );
        } catch (error) {
          values.value = before;
          throw error;
        }
      });
    return saving;
  }
  return { values, resolvedTheme, init, set };
});
