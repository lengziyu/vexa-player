import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_WALL_HISTORY, validateWallSnapshot, type WallHistoryEntry } from '../src/shared/wall-history';
import { validateId } from '../src/shared/validation';

export class WallHistory {
  private entries: WallHistoryEntry[] = [];
  private pending: Promise<unknown> = Promise.resolve();
  private readonly file: string;
  constructor(directory: string) { this.file = join(directory, 'wall-history.json'); }
  async init(): Promise<void> {
    try {
      const rows: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (!Array.isArray(rows)) return;
      const seen = new Set<string>();
      for (const row of rows.slice(0, MAX_WALL_HISTORY)) {
        try {
          const id = validateId(row.id);
          if (seen.has(id) || ![row.createdAt, row.updatedAt].every(value => Number.isFinite(value) && value >= 0 && value <= 8.64e15)) continue;
          this.entries.push({ ...validateWallSnapshot(row), id, createdAt: row.createdAt, updatedAt: row.updatedAt });
          seen.add(id);
        } catch { /* An invalid record must not hide the remaining history. */ }
      }
      this.entries.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('播放墙历史读取失败');
    }
  }
  list(): WallHistoryEntry[] { return structuredClone(this.entries); }
  get(id: unknown): WallHistoryEntry {
    const entry = this.entries.find(row => row.id === validateId(id));
    if (!entry) throw new Error('这组播放墙历史已被移除');
    return structuredClone(entry);
  }
  private change(update: () => WallHistoryEntry[]): Promise<WallHistoryEntry[]> {
    const task = this.pending.catch(() => {}).then(async () => {
      const next = update();
      await writeFile(`${this.file}.tmp`, JSON.stringify(next));
      await rename(`${this.file}.tmp`, this.file);
      this.entries = next;
      return this.list();
    });
    this.pending = task;
    return task;
  }
  save(id: unknown, value: unknown): Promise<WallHistoryEntry[]> {
    const key = validateId(id), snapshot = validateWallSnapshot(value);
    return this.change(() => {
      const previous = this.entries.find(row => row.id === key), now = Date.now();
      return [{ ...snapshot, id: key, createdAt: previous?.createdAt ?? now, updatedAt: now },
        ...this.entries.filter(row => row.id !== key)].slice(0, MAX_WALL_HISTORY);
    });
  }
  remove(id: unknown): Promise<WallHistoryEntry[]> {
    const key = validateId(id);
    return this.change(() => this.entries.filter(row => row.id !== key));
  }
  clear(): Promise<WallHistoryEntry[]> { return this.change(() => []); }
  async flush(): Promise<void> { await this.pending; }
}
