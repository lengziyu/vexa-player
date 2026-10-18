export type ThemeMode = "dark" | "light" | "system";
export type Accent = "violet" | "sage" | "sand";
export type LayoutMode = "smart" | "focus" | "grid";
export type ThumbnailSize = "small" | "medium" | "large";
export type ResolutionFilter = "all" | "sd" | "hd" | "fhd" | "qhd" | "uhd";
export type OrientationFilter = "all" | "landscape" | "portrait" | "square";
export interface Settings {
  theme: ThemeMode;
  accent: Accent;
  reducedMotion: boolean;
  cacheEnabled: boolean;
  layout: LayoutMode;
  fit: "cover" | "contain";
  randomStart: boolean;
  autoNext: boolean;
  switchInterval: number;
  locale: "zh-CN" | "en";
  thumbnailSize: ThumbnailSize;
  pauseHidden: boolean;
}
export const defaultSettings: Settings = {
  theme: "dark",
  accent: "violet",
  reducedMotion: false,
  cacheEnabled: true,
  layout: "focus",
  fit: "contain",
  randomStart: false,
  autoNext: true,
  switchInterval: 0,
  locale: "zh-CN",
  thumbnailSize: "medium",
  pauseHidden: false,
};
export interface MediaItem {
  id: string;
  path: string;
  name: string;
  size: number;
  mtime: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  audioCodec: string | null;
  status: "pending" | "ready" | "missing" | "error";
  thumbnail: boolean;
  favorite: boolean;
  error: string | null;
}
export interface LibraryRoot {
  id: string;
  path: string;
  recursive: boolean;
  available: boolean;
}
export interface LibraryQuery {
  search?: string;
  rootId?: string;
  favorites?: boolean;
  sort?: "name" | "duration" | "size" | "width" | "path";
  direction?: "asc" | "desc";
  offset?: number;
  limit?: number;
  minDuration?: number;
  maxDuration?: number;
  resolution?: ResolutionFilter;
  orientation?: OrientationFilter;
  status?: "all" | MediaItem["status"];
}
export interface LibraryPage {
  items: MediaItem[];
  total: number;
}
export interface ScanProgress {
  id: string;
  phase: "scan" | "probe" | "done" | "cancelled";
  discovered: number;
  completed: number;
  failed: number;
  skipped: number;
  cancelled: boolean;
}
export interface ScanRequest {
  paths: string[];
  recursive: boolean;
}
export interface DesktopApi {
  getSystemDark(): Promise<boolean>;
  onAppearance(callback: (dark: boolean) => void): () => void;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  pickFiles(): Promise<string[]>;
  pickFolders(): Promise<string[]>;
  droppedPaths(files: File[]): Promise<string[]>;
  scan(request: ScanRequest): Promise<string>;
  cancelScan(): Promise<void>;
  queryLibrary(query: LibraryQuery): Promise<LibraryPage>;
  roots(): Promise<LibraryRoot[]>;
  refresh(): Promise<string>;
  favorite(id: string, favorite: boolean): Promise<void>;
  removeRoot(id: string): Promise<void>;
  reveal(id: string): Promise<void>;
  clearCache(): Promise<void>;
  cacheSize(): Promise<number>;
  privacyHide(): Promise<void>;
  onScan(callback: (progress: ScanProgress) => void): () => void;
  onPrivacy(callback: () => void): () => void;
}
export interface TileState {
  id: string;
  media: MediaItem;
  paused: boolean;
  muted: boolean;
  volume: number;
  speed: number;
  locked: boolean;
  loop: boolean;
  progress: number;
  duration: number;
  playedSeconds: number;
  status: "loading" | "playing" | "paused" | "ended" | "error";
  error: string | null;
  startAt: number;
}
declare global {
  interface Window {
    vexa?: DesktopApi;
  }
}
