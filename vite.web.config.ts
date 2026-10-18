import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { version } from "./package.json";
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [vue()],
  server: { port: 5173, strictPort: true },
});
