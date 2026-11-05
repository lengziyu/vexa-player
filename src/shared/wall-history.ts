import { MAX_WALL_TILES, PLAYBACK_SPEEDS, type LayoutMode, type MediaItem } from './contracts';
import { validateId } from './validation';

export const MAX_WALL_HISTORY = 20;
export interface SavedWallTile {
  mediaId: string;
  name: string;
  progress: number;
  speed: number;
  volume: number;
  muted: boolean;
  locked: boolean;
  loop: boolean;
  paused: boolean;
}
export interface WallSnapshot {
  tiles: SavedWallTile[];
  layout: LayoutMode;
  fit: 'cover' | 'contain';
  focusedIndex: number;
  volume: number;
  muted: boolean;
  mixedAudio: boolean;
}
export interface WallHistoryEntry extends WallSnapshot {
  id: string;
  createdAt: number;
  updatedAt: number;
}
export interface WallHistoryApi {
  list(): Promise<WallHistoryEntry[]>;
  save(id: string, snapshot: WallSnapshot): Promise<WallHistoryEntry[]>;
  remove(id: string): Promise<WallHistoryEntry[]>;
  clear(): Promise<void>;
  restore(id: string): Promise<{ entry: WallHistoryEntry; media: MediaItem[] }>;
}
export function validateWallSnapshot(value: unknown): WallSnapshot {
  if (!value || typeof value !== 'object') throw new Error('播放墙历史格式无效');
  const input = value as WallSnapshot;
  const number = (value: unknown, min: number, max: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw new Error('播放墙历史数值无效');
    return value;
  };
  const bool = (value: unknown): boolean => {
    if (typeof value !== 'boolean') throw new Error('播放墙历史状态无效');
    return value;
  };
  if (!Array.isArray(input.tiles) || !input.tiles.length || input.tiles.length > MAX_WALL_TILES ||
      !['smart', 'focus', 'grid'].includes(input.layout) || !['cover', 'contain'].includes(input.fit))
    throw new Error('播放墙历史内容无效');
  const tiles = input.tiles.map(tile => {
    if (!tile || typeof tile.name !== 'string' || !tile.name.length || tile.name.length > 1024 ||
        !PLAYBACK_SPEEDS.includes(tile.speed as typeof PLAYBACK_SPEEDS[number]))
      throw new Error('播放墙历史画面无效');
    return { mediaId: validateId(tile.mediaId), name: tile.name,
      progress: number(tile.progress, 0, Number.MAX_SAFE_INTEGER), speed: tile.speed,
      volume: number(tile.volume, 0, 1), muted: bool(tile.muted), locked: bool(tile.locked),
      loop: bool(tile.loop), paused: bool(tile.paused) };
  });
  if (!Number.isInteger(input.focusedIndex)) throw new Error('播放墙历史焦点无效');
  return { tiles, layout: input.layout, fit: input.fit,
    focusedIndex: number(input.focusedIndex, 0, tiles.length - 1),
    volume: number(input.volume, 0, 1), muted: bool(input.muted), mixedAudio: bool(input.mixedAudio) };
}
