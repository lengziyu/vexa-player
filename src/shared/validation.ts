import { defaultSettings, type Settings } from "./contracts";

export function validateSettings(value: unknown): Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("设置格式不正确");
  const input = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const enums: Record<string, readonly string[]> = {
    theme: ["dark", "light", "system"],
    accent: ["violet", "sage", "sand"],
    layout: ["smart", "focus", "grid"],
    fit: ["contain", "cover"],
    locale: ["zh-CN", "en"],
    thumbnailSize: ["small", "medium", "large"],
  };
  for (const [key, val] of Object.entries(input)) {
    if (!Object.hasOwn(defaultSettings, key)) throw new Error("未知设置项");
    if (enums[key]) {
      if (typeof val !== "string" || !enums[key]!.includes(val))
        throw new Error("设置值不正确");
    } else if (key === "switchInterval") {
      if (
        typeof val !== "number" ||
        !Number.isFinite(val) ||
        (val !== 0 && (val < 30 || val > 3600))
      )
        throw new Error("自动换片间隔必须为 30～3600 秒");
    } else if (typeof val !== "boolean") throw new Error("设置值不正确");
    result[key] = val;
  }
  return result as Partial<Settings>;
}
export function validateId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{32}$/.test(value))
    throw new Error("媒体标识无效");
  return value;
}
