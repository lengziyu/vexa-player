import { describe, expect, it, vi } from "vitest";
import { HtmlVideoEngine } from "../src/player/engine";

function fixture() {
  const state = { muted: true, volume: 0.5, playbackRate: 1, loop: false };
  const writes = { muted: vi.fn(), volume: vi.fn(), playbackRate: vi.fn(), loop: vi.fn() };
  const element = {} as HTMLVideoElement;
  for (const key of Object.keys(state) as (keyof typeof state)[]) {
    Object.defineProperty(element, key, {
      get: () => state[key],
      set: (value: number | boolean) => { writes[key](value); Object.assign(state, { [key]: value }); },
    });
  }
  return { engine: new HtmlVideoEngine(element), writes };
}

describe("media configuration writes", () => {
  it("does not reset unchanged media properties during repeated wall synchronization", () => {
    const { engine, writes } = fixture();
    for (let i = 0; i < 24; i++) engine.configure({ muted: true, volume: 0.5, speed: 1, loop: false });
    for (const write of Object.values(writes)) expect(write).not.toHaveBeenCalled();
  });
  it("only writes the changed volume and preserves playback rate, mute and loop", () => {
    const { engine, writes } = fixture();
    engine.configure({ muted: true, volume: 0.75, speed: 1, loop: false });
    engine.configure({ muted: true, volume: 0.75, speed: 1, loop: false });
    expect(writes.volume).toHaveBeenCalledExactlyOnceWith(0.75);
    expect(writes.playbackRate).not.toHaveBeenCalled();
    expect(writes.muted).not.toHaveBeenCalled();
    expect(writes.loop).not.toHaveBeenCalled();
  });
  it("applies real mode changes and clamps volume before comparing it", () => {
    const { engine, writes } = fixture();
    engine.configure({ muted: false, volume: 2, speed: 3, loop: true });
    engine.configure({ muted: false, volume: 2, speed: 3, loop: true });
    expect(writes.muted).toHaveBeenCalledExactlyOnceWith(false);
    expect(writes.volume).toHaveBeenCalledExactlyOnceWith(1);
    expect(writes.playbackRate).toHaveBeenCalledExactlyOnceWith(3);
    expect(writes.loop).toHaveBeenCalledExactlyOnceWith(true);
  });
});
