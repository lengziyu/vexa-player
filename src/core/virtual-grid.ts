import type { ThumbnailSize } from "../shared/contracts";
export interface VirtualGridInput {
  width: number;
  total: number;
  viewportTop: number;
  viewportHeight: number;
  size: ThumbnailSize;
  overscan?: number;
}
export function virtualGrid(input: VirtualGridInput) {
  const width = Math.max(1, input.width),
    gap = 18;
  const minWidth = { small: 180, medium: 260, large: 350 }[input.size];
  const columns = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  const cardWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
  const cardHeight = Math.ceil(cardWidth / 1.7 + 86),
    stride = cardHeight + gap;
  const total = Math.max(0, Math.floor(input.total));
  const rows = Math.ceil(total / columns),
    height = Math.max(0, rows * stride - gap);
  const overscan = Math.max(0, input.overscan ?? 2);
  const firstRow = Math.max(
    0,
    Math.min(
      rows,
      Math.floor(Math.max(0, input.viewportTop) / stride) - overscan,
    ),
  );
  const lastRow = Math.min(
    rows,
    Math.max(
      firstRow,
      Math.ceil(
        Math.max(0, input.viewportTop + input.viewportHeight) / stride,
      ) + overscan,
    ),
  );
  const start = Math.min(total, firstRow * columns),
    end = Math.min(total, lastRow * columns);
  return {
    columns,
    cardWidth,
    cardHeight,
    stride,
    height,
    start,
    end,
    cells: Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      return {
        index,
        x: (index % columns) * (cardWidth + gap),
        y: Math.floor(index / columns) * stride,
        width: cardWidth,
        height: cardHeight,
      };
    }),
  };
}
