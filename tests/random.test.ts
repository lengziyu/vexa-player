import { describe, expect, it } from "vitest";
import { chooseRandom, randomStart } from "../src/core/random";
describe("random selection", () => {
  const candidates = ["a", "b", "c"].map((id) => ({ id }));
  it("never picks an occupied media even when cooldown is exhausted", () => {
    expect(
      chooseRandom(candidates, new Set(["a", "b"]), ["c"], () => 0)?.id,
    ).toBe("c");
    expect(
      chooseRandom(candidates, new Set(["a", "b", "c"]), [], () => 0),
    ).toBeUndefined();
  });
  it("prefers fresh candidates and supports batch reservations", () => {
    const occupied = new Set(["a"]);
    const first = chooseRandom(candidates, occupied, ["b"], () => 0)!;
    expect(first.id).toBe("c");
    occupied.add(first.id);
    expect(chooseRandom(candidates, occupied, ["b"], () => 0)?.id).toBe("b");
  });
  it("keeps random start inside bounds, with ten seconds left", () => {
    for (const duration of [0, 5, 10, 11, 20, 60, 1000, NaN])
      for (const sample of [0, 0.5, 0.99999]) {
        const start = randomStart(duration, true, () => sample);
        expect(Number.isFinite(start)).toBe(true);
        expect(start).toBeGreaterThanOrEqual(0);
        if (duration > 10) expect(duration - start).toBeGreaterThanOrEqual(10);
      }
    expect(randomStart(1000, false)).toBe(0);
  });
});
