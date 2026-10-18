import { describe, it, expect } from "vitest";
import { PlaybackQualityMonitor } from "../src/core/playback-quality";
describe("decoder quality monitor", () => {
  it("requires sustained drops, resets after recovery and ignores pauses/seeks", () => {
    const m = new PlaybackQualityMonitor();
    expect(m.sample(30, 0, true)).toBeNull();
    expect(m.sample(60, 6, true)?.struggling).toBe(false);
    expect(m.sample(90, 12, true)?.struggling).toBe(false);
    expect(m.sample(120, 18, true)?.struggling).toBe(true);
    expect(m.sample(150, 18, true)?.struggling).toBe(false);
    expect(m.sample(180, 24, false)).toBeNull();
    expect(m.sample(210, 30, true)?.struggling).toBe(false);
    m.reset();
    expect(m.sample(300, 60, true)).toBeNull();
  });
  it("does not warn for sparse frames, counter reset or invalid values", () => {
    const m = new PlaybackQualityMonitor();
    m.sample(30, 0, true);
    expect(m.sample(34, 4, true)).toBeNull();
    expect(m.sample(0, 0, true)).toBeNull();
    expect(m.sample(NaN, 0, true)).toBeNull();
    expect(m.sample(10, 11, true)).toBeNull();
  });
});
