<script setup lang="ts">
defineProps<{ name: string; size?: number }>();
const paths: Record<string, string> = {
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  link: "M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2",
  unlink:
    "M3 3l18 18 M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2",
  wall: "M3 3h11v18H3z M18 3h3v8h-3z M18 15h3v6h-3z",
  library: "M3 5h18v15H3z M7 2v3 M17 2v3 M3 10h18 M8 10v10 M16 10v10",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  plus: "M12 5v14 M5 12h14",
  shield: "m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Z M9 12l2 2 4-4",
  settings:
    "M9 3h6l1 3 3 1 2 4-2 2v3l-3 2-1 3H9l-1-3-3-2v-3l-2-2 2-4 3-1 1-3Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  bookmark: "M6 3h12v18l-6-4-6 4V3Z",
  sparkles:
    "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z M20 2v4 M18 4h4",
  focus: "M3 4h12v16H3z M18 4h3v6h-3z M18 14h3v6h-3z",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  chevron: "m8 10 4 4 4-4",
  crop: "M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M8 8h8v8H8z",
  expand: "M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5",
  wave: "M3 10v4 M7 6v12 M11 3v18 M15 7v10 M19 10v4 M23 8v8",
  back: "M4 8V3 M4 8h5 M4 8a9 9 0 1 1-1 8 M9 11v5 M13 11h3v5h-3z",
  forward: "M20 8V3 M20 8h-5 M20 8a9 9 0 1 0 1 8 M8 11v5 M12 11h3v5h-3z",
  pause: "M8 5h2v14H8z M14 5h2v14h-2z",
  play: "m8 4 12 8-12 8V4Z",
  shuffle:
    "M3 5h3c5 0 7 14 12 14h3 M17 15l4 4-4 4 M3 19h3c2 0 3-2 5-6 M13 8c2-3 3-3 5-3h3 M17 1l4 4-4 4",
  repeat:
    "m17 2 4 4-4 4 M3 11V8a2 2 0 0 1 2-2h16 M7 22l-4-4 4-4 M21 13v3a2 2 0 0 1-2 2H3",
  muted: "m11 5-6 4H2v6h3l6 4V5Z M17 9l5 6 M22 9l-5 6",
  volume: "m11 5-6 4H2v6h3l6 4V5Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14",
  sliders: "M4 4v16 M12 4v16 M20 4v16 M1 9h6 M9 16h6 M17 8h6",
  arrow: "M4 12h16 M15 7l5 5-5 5",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  unlock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 7-2 M12 14v3",
  close: "M6 6l12 12 M18 6 6 18",
  check: "m5 12 4 4L19 6",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
  folder: "M3 6h7l2 3h9v12H3V6Z",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 1.5 1.5 M5 19l1.5-1.5 M17.5 6.5 1.5-1.5",
  monitor: "M3 3h18v14H3z M8 21h8 M12 17v4",
  refresh: "M20 7V3 M20 7h-4 M20 7a9 9 0 1 0 1 8",
  info: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  film: "M3 3h18v18H3z M7 3v18 M17 3v18 M3 8h4 M3 16h4 M17 8h4 M17 16h4",
  loading: "M20 12a8 8 0 1 1-8-8",
  warning: "m12 3 10 18H2L12 3Z M12 9v5 M12 17h.01",
};
</script>
<template>
  <svg
    :width="size || 18"
    :height="size || 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.sparkles" />
  </svg>
</template>
