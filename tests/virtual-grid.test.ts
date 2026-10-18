import { describe, it, expect } from "vitest";
import { virtualGrid } from "../src/core/virtual-grid";
describe("virtualized library geometry", () => {
  it("bounds rendered cards independently of total library size", () => {
    for (const top of [0, 10000, 800000]) {
      const grid = virtualGrid({
        width: 1200,
        total: 100000,
        viewportTop: top,
        viewportHeight: 900,
        size: "medium",
      });
      expect(grid.cells.length).toBeLessThan(40);
      expect(grid.end).toBeLessThanOrEqual(100000);
      expect(grid.start).toBeGreaterThanOrEqual(0);
      for (const cell of grid.cells) {
        expect(cell.x + cell.width).toBeLessThanOrEqual(1200.001);
        expect(cell.y + cell.height).toBeLessThanOrEqual(grid.height);
      }
    }
  });
  it("fills the last partial row, handles empty lists and tiny windows", () => {
    const grid = virtualGrid({
      width: 1000,
      total: 1003,
      viewportTop: 200000,
      viewportHeight: 1000,
      size: "small",
    });
    const last = virtualGrid({
      width: 1000,
      total: 1003,
      viewportTop: grid.height - 400,
      viewportHeight: 1000,
      size: "small",
    });
    expect(last.cells.at(-1)?.index).toBe(1002);
    expect(
      virtualGrid({
        width: 1,
        total: 3,
        viewportTop: 0,
        viewportHeight: 1000,
        size: "large",
      }).columns,
    ).toBe(1);
    expect(
      virtualGrid({
        width: 1000,
        total: 0,
        viewportTop: 0,
        viewportHeight: 1000,
        size: "medium",
      }).cells,
    ).toEqual([]);
  });
  it("allows fewer columns for larger thumbnails", () => {
    const make = (size: "small" | "medium" | "large") =>
      virtualGrid({
        width: 1200,
        total: 1000,
        viewportTop: 0,
        viewportHeight: 900,
        size,
      }).columns;
    expect(make("small")).toBeGreaterThan(make("medium"));
    expect(make("medium")).toBeGreaterThan(make("large"));
  });
});
