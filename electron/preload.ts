import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopApi, ScanProgress } from "../src/shared/contracts";

const api: DesktopApi = {
  downloads: {
    connectX: () => ipcRenderer.invoke("downloads:connect-x"),
    openXInBrowser: () => ipcRenderer.invoke("downloads:x-browser"),
    importXLogin: () => ipcRenderer.invoke("downloads:import-x-login"),
    disconnectX: () => ipcRenderer.invoke("downloads:disconnect-x"),
    snapshot: () => ipcRenderer.invoke("downloads:snapshot"),
    installEngine: () => ipcRenderer.invoke("downloads:install"),
    importEngine: () => ipcRenderer.invoke("downloads:import-engine"),
    openEngineSource: () => ipcRenderer.invoke("downloads:engine-source"),
    chooseDirectory: () => ipcRenderer.invoke("downloads:directory"),
    configure: (input) => ipcRenderer.invoke("downloads:configure", input),
    paste: () => ipcRenderer.invoke("downloads:paste"),
    parse: (url) => ipcRenderer.invoke("downloads:parse", url),
    enqueue: (input) => ipcRenderer.invoke("downloads:enqueue", input),
    cancel: (id) => ipcRenderer.invoke("downloads:cancel", id),
    retry: (id) => ipcRenderer.invoke("downloads:retry", id),
    reveal: (id) => ipcRenderer.invoke("downloads:reveal", id),
    importFile: (id) => ipcRenderer.invoke("downloads:import", id),
    clearFinished: () => ipcRenderer.invoke("downloads:clear"),
    onChange: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        snapshot: import("../src/shared/downloads").DownloadSnapshot,
      ) => callback(snapshot);
      ipcRenderer.on("downloads:changed", listener);
      return () => ipcRenderer.removeListener("downloads:changed", listener);
    },
  },
  getSystemDark: () => ipcRenderer.invoke("appearance:get"),
  onAppearance: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, dark: boolean) =>
      callback(dark);
    ipcRenderer.on("appearance:changed", listener);
    return () => ipcRenderer.removeListener("appearance:changed", listener);
  },
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  pickFiles: () => ipcRenderer.invoke("files:pick", "files"),
  pickFolders: () => ipcRenderer.invoke("files:pick", "folders"),
  droppedPaths: (files) =>
    ipcRenderer.invoke(
      "files:grant",
      files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
    ),
  scan: (request) => ipcRenderer.invoke("library:scan", request),
  cancelScan: () => ipcRenderer.invoke("library:cancel"),
  queryLibrary: (query) => ipcRenderer.invoke("library:query", query),
  roots: () => ipcRenderer.invoke("library:roots"),
  refresh: () => ipcRenderer.invoke("library:refresh"),
  favorite: (id, value) => ipcRenderer.invoke("library:favorite", id, value),
  removeRoot: (id) => ipcRenderer.invoke("library:remove-root", id),
  reveal: (id) => ipcRenderer.invoke("library:reveal", id),
  clearCache: () => ipcRenderer.invoke("cache:clear"),
  cacheSize: () => ipcRenderer.invoke("cache:size"),
  privacyHide: () => ipcRenderer.invoke("privacy:hide"),
  onScan: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ScanProgress) =>
      callback(data);
    ipcRenderer.on("library:progress", listener);
    return () => ipcRenderer.removeListener("library:progress", listener);
  },
  onPrivacy: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("privacy:restore", listener);
    return () => ipcRenderer.removeListener("privacy:restore", listener);
  },
  onPause: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("playback:pause", listener);
    return () => ipcRenderer.removeListener("playback:pause", listener);
  },
};
contextBridge.exposeInMainWorld("vexa", api);
