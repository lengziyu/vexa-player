import { describe, expect, it } from "vitest";
import { calculateLayout, createStableLayout } from "../src/core/layout";
import type { LayoutMode } from "../src/shared/contracts";

describe("layout geometry", () => {
  const geometry = (rects: ReturnType<typeof calculateLayout>) =>
    rects.map(({ x, y, width, height }) => ({ x, y, width, height }));
  for (const mode of ["smart", "focus", "grid"] as LayoutMode[]) {
    it(`${mode} keeps slots fixed when replacement videos have different proportions`, () => {
      const plan = createStableLayout();
      const input = Array.from({ length: 5 }, (_, i) => ({ id: String(i), aspect: 16 / 9 }));
      const initial = plan(input, 1200, 700, mode);
      const changed = input.map(item => ({ ...item, aspect: 9 / 16 }));
      expect(plan(changed, 1200, 700, mode)).toEqual(initial);
      const reordered = [changed[3]!, changed[1]!, changed[2]!, changed[0]!, changed[4]!];
      const moved = plan(reordered, 1200, 700, mode);
      expect(geometry(moved)).toEqual(geometry(initial));
      expect(moved.map(rect => rect.id)).toEqual(reordered.map(item => item.id));
      expect(plan(reordered, 1200, 700, mode, 1)).toEqual(calculateLayout(reordered, 1200, 700, mode));
    });
  }
  it("replans after membership, window or layout changes, including a newly created wall", () => {
    const plan = createStableLayout();
    const input = [{ id: "a", aspect: 16 / 9 }, { id: "b", aspect: 9 / 16 }];
    plan(input, 1000, 600, "smart");
    for (const [width, height, mode] of [[600, 1000, "smart"], [600, 1000, "grid"], [1200, 700, "focus"]] as const) {
      expect(plan(input, width, height, mode)).toEqual(calculateLayout(input, width, height, mode));
    }
    const added = [...input, { id: "c", aspect: 1 }];
    expect(plan(added, 1200, 700, "focus")).toEqual(calculateLayout(added, 1200, 700, "focus"));
    const fresh = added.map((item, index) => ({ id: `new-${index}`, aspect: 1 / item.aspect }));
    expect(plan(fresh, 1200, 700, "focus")).toEqual(calculateLayout(fresh, 1200, 700, "focus"));
    expect(plan(fresh, 0, 0, "focus")).toEqual([]);
    expect(plan([], 1200, 700, "focus")).toEqual([]);
    expect(plan(fresh, 1200, 700, "focus")).toEqual(calculateLayout(fresh, 1200, 700, "focus"));
  });
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
