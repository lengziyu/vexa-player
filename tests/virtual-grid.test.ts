import { describe, it, expect } from "vitest";
import { virtualGrid, gridSelection } from "../src/core/virtual-grid";
describe("virtualized library geometry", () => {
  it('selects only intersected cells, including offscreen rows and reverse drags', () => {
    const input = { width: 1000, total: 1000, viewportTop: 0, viewportHeight: 800, size: 'medium' as const };
    const grid = virtualGrid(input);
    const rect = { left: 2, top: grid.stride * 99 + 4, right: grid.cardWidth * 2 + 17, bottom: grid.stride * 100 + 30 };
    expect(gridSelection(input, rect)).toEqual([297, 298, 300, 301]);
    expect(gridSelection(input, { left: rect.right, right: rect.left, top: rect.bottom, bottom: rect.top })).toEqual([297, 298, 300, 301]);
    expect(gridSelection(input, { left: grid.cardWidth + 1, right: grid.cardWidth + 17, top: 1, bottom: 10 })).toEqual([]);
    expect(gridSelection(input, { left: -50, right: -10, top: 0, bottom: 80 })).toEqual([]);
  });
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
