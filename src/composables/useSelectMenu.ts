import { shallowRef } from "vue";

// Shared only for open-menu coordination and keeping fullscreen controls visible.
export const activeSelectMenu = shallowRef<string | null>(null);
