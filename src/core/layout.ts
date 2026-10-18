import type { LayoutMode } from "../shared/contracts";
export interface LayoutInput {
  id: string;
  aspect: number;
}
export interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Partition all available space; incomplete rows expand instead of leaving empty cells. */
export function calculateLayout(
  items: LayoutInput[],
  width: number,
  height: number,
  mode: LayoutMode,
  gap = 8,
): Rect[] {
  if (!items.length || width <= 0 || height <= 0) return [];
  const safeGap = Math.min(
    gap,
    width / (items.length * 2),
    height / (items.length * 2),
  );
  function rows(
    list: LayoutInput[],
    x: number,
    y: number,
    w: number,
    h: number,
    smart: boolean,
  ): Rect[] {
    let bestRows = 1,
      bestScore = Infinity;
    for (let count = 1; count <= list.length; count++) {
      let score = 0,
        offset = 0;
      const rowH = (h - safeGap * (count - 1)) / count;
      for (let row = 0; row < count; row++) {
        const n = Math.ceil((list.length - offset) / (count - row));
        const group = list.slice(offset, offset + n);
        const totalAspect = group.reduce(
          (a, item) =>
            a + (smart ? Math.max(0.3, Math.min(3, item.aspect || 16 / 9)) : 1),
          0,
        );
        for (const item of group) {
          const cellWidth =
            ((w - safeGap * (n - 1)) *
              (smart ? Math.max(0.3, Math.min(3, item.aspect || 16 / 9)) : 1)) /
            totalAspect;
          score += Math.abs(
            Math.log(cellWidth / rowH / (item.aspect || 16 / 9)),
          );
        }
        offset += n;
      }
      if (score < bestScore) {
        bestScore = score;
        bestRows = count;
      }
    }
    let offset = 0;
    const rowH = (h - safeGap * (bestRows - 1)) / bestRows;
    const result: Rect[] = [];
    for (let row = 0; row < bestRows; row++) {
      const count = Math.ceil((list.length - offset) / (bestRows - row));
      const group = list.slice(offset, offset + count);
      const weights = group.map((item) =>
        smart ? Math.max(0.3, Math.min(3, item.aspect || 16 / 9)) : 1,
      );
      const total = weights.reduce((a, b) => a + b, 0);
      let left = x;
      group.forEach((item, i) => {
        const cellW = ((w - safeGap * (count - 1)) * weights[i]!) / total;
        result.push({
          id: item.id,
          x: left,
          y: y + row * (rowH + safeGap),
          width: cellW,
          height: rowH,
        });
        left += cellW + safeGap;
      });
      offset += count;
    }
    return result;
  }
  if (mode === "focus" && items.length > 1) {
    const main = items[0]!,
      rest = items.slice(1);
    if (width / height < 1.1) {
      const mainH = (height - safeGap) * 0.6;
      return [
        { id: main.id, x: 0, y: 0, width, height: mainH },
        ...rows(
          rest,
          0,
          mainH + safeGap,
          width,
          height - mainH - safeGap,
          true,
        ),
      ];
    }
    const mainW = (width - safeGap) * (items.length <= 4 ? 0.65 : 0.57);
    return [
      { id: main.id, x: 0, y: 0, width: mainW, height },
      ...rows(rest, mainW + safeGap, 0, width - mainW - safeGap, height, true),
    ];
  }
  return rows(items, 0, 0, width, height, mode === "smart");
}
