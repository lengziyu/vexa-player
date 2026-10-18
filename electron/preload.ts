import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopApi, ScanProgress } from "../src/shared/contracts";

const api: DesktopApi = {
  getSystemDark: () => ipcRenderer.invoke("appearance:get"),
  onAppearance: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, dark: boolean) => callback(dark);
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
};
contextBridge.exposeInMainWorld("vexa", api);
