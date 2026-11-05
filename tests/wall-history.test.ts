import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WallHistory } from '../electron/wall-history';
import { validateWallSnapshot, type WallSnapshot } from '../src/shared/wall-history';
let directory: string;
const id = (n: number) => n.toString(16).padStart(32, '0');
const snapshot = (): WallSnapshot => ({
  tiles: [{ mediaId: id(1), name: '测试.mp4', progress: 42, speed: 2, volume: .4,
    muted: false, loop: true, locked: true, paused: false }],
  layout: 'grid', fit: 'cover', focusedIndex: 0, volume: .6, muted: true, mixedAudio: false,
});
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'vexa-history-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
describe('local playback wall history', () => {
  it('updates one session without duplicates, persists progress and caps the recent list', async () => {
    const history = new WallHistory(directory); await history.init();
    for (let i = 1; i <= 24; i++) await history.save(id(i), snapshot());
    const changed = snapshot(); changed.tiles[0]!.progress = 51;
    await history.save(id(5), changed);
    const reopened = new WallHistory(directory); await reopened.init();
    expect(reopened.list()).toHaveLength(20);
    expect(reopened.list()[0]).toMatchObject({ id: id(5), tiles: [{ progress: 51, speed: 2, loop: true }] });
    expect(reopened.list().filter(row => row.id === id(5))).toHaveLength(1);
    expect(reopened.list().some(row => row.id === id(1))).toBe(false);
    const file = await readFile(join(directory, 'wall-history.json'), 'utf8');
    expect(file).not.toContain('path');
  });
  it('serializes saves, deletion and clearing so history cannot reappear from a pending write', async () => {
    const history = new WallHistory(directory); await history.init();
    await Promise.all([history.save(id(1), snapshot()), history.save(id(2), snapshot()), history.remove(id(1))]);
    expect(history.list().map(row => row.id)).toEqual([id(2)]);
    await Promise.all([history.save(id(3), snapshot()), history.clear()]);
    const reopened = new WallHistory(directory); await reopened.init();
    expect(reopened.list()).toEqual([]);
    expect(() => reopened.get(id(2))).toThrow();
  });
  it('rejects invalid state and strips untrusted fields instead of persisting file paths', () => {
    for (const changed of [
      { ...snapshot(), tiles: [] }, { ...snapshot(), focusedIndex: 9 },
      { ...snapshot(), volume: NaN }, { ...snapshot(), layout: 'other' },
      { ...snapshot(), tiles: [{ ...snapshot().tiles[0], mediaId: '../private' }] },
      { ...snapshot(), tiles: [{ ...snapshot().tiles[0], speed: 900 }] },
    ]) expect(() => validateWallSnapshot(changed)).toThrow();
    expect(validateWallSnapshot({ ...snapshot(), path: '/private/file' })).not.toHaveProperty('path');
  });
  it('retains valid records when a different record is malformed', async () => {
    await writeFile(join(directory, 'wall-history.json'), JSON.stringify([
      { ...snapshot(), id: id(2), createdAt: 1, updatedAt: 2 }, { id: 'invalid' },
    ]));
    const history = new WallHistory(directory); await history.init();
    expect(history.list().map(row => row.id)).toEqual([id(2)]);
  });
});
