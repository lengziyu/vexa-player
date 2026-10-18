import { describe, expect, it } from "vitest";
import { byteRange } from "../electron/range";
import { validateId, validateSettings } from "../src/shared/validation";
describe("media byte ranges", () => {
  it("supports seek ranges and suffixes without reading past the file", () => {
    expect(byteRange(null, 100)).toBeNull();
    expect(byteRange("bytes=20-29", 100)).toEqual({ start: 20, end: 29 });
    expect(byteRange("bytes=50-", 100)).toEqual({ start: 50, end: 99 });
    expect(byteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange("bytes=10-999", 100)).toEqual({ start: 10, end: 99 });
  });
  it("rejects malformed, multiple, empty and out-of-bounds ranges", () => {
    for (const header of [
      "bytes=100-",
      "bytes=20-10",
      "bytes=-0",
      "bytes=-",
      "bytes=0-1,3-4",
      "bytes=99999999999999999-",
      "nonsense",
    ])
      expect(byteRange(header, 100)).toBe("invalid");
    expect(byteRange("bytes=0-", 0)).toBe("invalid");
  });
});
describe("IPC inputs", () => {
  it("allows theme selection, but rejects unknown or malformed settings", () => {
    expect(validateSettings({ theme: "light", accent: "sage" })).toEqual({
      theme: "light",
      accent: "sage",
    });
    for (const input of [
      null,
      [],
      { theme: "remote" },
      { cacheEnabled: "yes" },
      { switchInterval: NaN },
      { switchInterval: 1 },
      { path: "C:\\private" },
      JSON.parse('{"__proto__":{"polluted":true}}'),
    ])
      expect(() => validateSettings(input)).toThrow();
  });
  it("requires opaque IDs instead of filesystem paths", () => {
    expect(validateId("a".repeat(32))).toBe("a".repeat(32));
    for (const id of ["../secret", "C:\\private.mp4", "%2e%2e", "abc", null])
      expect(() => validateId(id)).toThrow();
  });
});
