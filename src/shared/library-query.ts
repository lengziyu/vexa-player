import type { LibraryQuery } from "./contracts";
import { validateId } from "./validation";

/** Runtime validation is shared by the IPC boundary and background database. */
export function validateLibraryQuery(value: unknown): LibraryQuery {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("搜索条件无效");
  const input = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const enums: Record<string, readonly string[]> = {
    sort: ["name", "duration", "size", "width", "path"],
    direction: ["asc", "desc"],
    resolution: ["all", "sd", "hd", "fhd", "qhd", "uhd"],
    orientation: ["all", "landscape", "portrait", "square"],
    status: ["all", "pending", "ready", "missing", "error"],
  };
  for (const [key, val] of Object.entries(input)) {
    if (val === undefined) continue;
    if (key === "search") {
      if (typeof val !== "string" || val.length > 1000)
        throw new Error("搜索关键词过长");
    } else if (key === "rootId") validateId(val);
    else if (key === "favorites") {
      if (typeof val !== "boolean") throw new Error("收藏筛选无效");
    } else if (enums[key]) {
      if (typeof val !== "string" || !enums[key]!.includes(val))
        throw new Error("筛选值无效");
    } else if (
      ["offset", "limit", "minDuration", "maxDuration"].includes(key)
    ) {
      if (
        typeof val !== "number" ||
        !Number.isFinite(val) ||
        val < 0 ||
        val > Number.MAX_SAFE_INTEGER
      )
        throw new Error("筛选范围无效");
      if (
        ["offset", "limit"].includes(key) &&
        (!Number.isInteger(val) || (key === "limit" && (val < 1 || val > 200)))
      )
        throw new Error("分页范围无效");
    } else throw new Error("未知搜索条件");
    result[key] = val;
  }
  if (
    typeof result.minDuration === "number" &&
    typeof result.maxDuration === "number" &&
    result.minDuration > result.maxDuration
  )
    throw new Error("最短时长不能大于最长时长");
  return result as LibraryQuery;
}

export const resolutionBounds: Record<string, [number, number | null]> = {
  sd: [0, 719],
  hd: [720, 1079],
  fhd: [1080, 1439],
  qhd: [1440, 2159],
  uhd: [2160, null],
};
