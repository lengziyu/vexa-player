import { describe, expect, it } from "vitest";
import { calculateLayout } from "../src/core/layout";
import type { LayoutMode } from "../src/shared/contracts";

describe("layout geometry", () => {
  for (const mode of ["smart", "focus", "grid"] as LayoutMode[]) {
    for (const [width, height] of [
      [1920, 1080],
      [800, 1400],
      [900, 500],
      [1, 1],
    ]) {
      it(`${mode} partitions 1–32 mixed-aspect videos inside ${width}×${height}`, () => {
        for (let n = 1; n <= 32; n++) {
          const input = Array.from({ length: n }, (_, i) => ({
            id: String(i),
            aspect: i % 3 === 0 ? 9 / 16 : 16 / 9,
          }));
          const result = calculateLayout(input, width!, height!, mode);
          expect(result).toHaveLength(n);
          expect(new Set(result.map((r) => r.id)).size).toBe(n);
          for (const rect of result) {
            expect(rect.x).toBeGreaterThanOrEqual(0);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
            expect(rect.x + rect.width).toBeLessThanOrEqual(width! + 1e-6);
            expect(rect.y + rect.height).toBeLessThanOrEqual(height! + 1e-6);
          }
          for (let i = 0; i < result.length; i++)
            for (let j = i + 1; j < result.length; j++) {
              const a = result[i]!,
                b = result[j]!;
              const overlapX =
                  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
                overlapY =
                  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
              expect(overlapX > 1e-6 && overlapY > 1e-6).toBe(false);
            }
          expect(calculateLayout(input, width!, height!, mode)).toEqual(result);
        }
      });
    }
  }
  it("one video fills its region and invalid viewport yields no rectangles", () => {
    expect(
      calculateLayout([{ id: "a", aspect: 16 / 9 }], 100, 50, "smart"),
    ).toEqual([{ id: "a", x: 0, y: 0, width: 100, height: 50 }]);
    expect(calculateLayout([], 100, 50, "grid")).toEqual([]);
    expect(calculateLayout([{ id: "a", aspect: 1 }], 0, 50, "focus")).toEqual(
      [],
    );
  });
});
