import { parentPort, workerData } from "node:worker_threads";
import { Library } from "./library";

const library = new Library(workerData, (progress) =>
  parentPort?.postMessage({ event: "scan", data: progress }),
);
const ready = library.init();
const methods = {
  query: library.query.bind(library),
  roots: library.roots.bind(library),
  getMedia: library.getMedia.bind(library),
  favorite: library.favorite.bind(library),
  removeRoot: library.removeRoot.bind(library),
  scan: library.start.bind(library),
  refresh: library.refresh.bind(library),
  cancel: library.cancel.bind(library),
  clearCache: library.clearCache.bind(library),
  cacheSize: library.cacheSize.bind(library),
  configure: library.configure.bind(library),
  close: library.close.bind(library),
};
parentPort?.on(
  "message",
  async (message: {
    id: number;
    method: keyof typeof methods;
    args: unknown[];
  }) => {
    try {
      await ready;
      const method = methods[message.method] as (...args: unknown[]) => unknown;
      if (!method) throw new Error("未知媒体操作");
      const data = await method(...message.args);
      parentPort?.postMessage({ id: message.id, data });
    } catch (error) {
      parentPort?.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : "媒体操作失败",
      });
    }
  },
);
