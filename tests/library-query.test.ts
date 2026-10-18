import { describe, it, expect } from "vitest";
import { validateLibraryQuery } from "../src/shared/library-query";
describe("library query boundary", () => {
  it("accepts combined property filters and decimal durations", () => {
    const query = {
      favorites: true,
      orientation: "portrait",
      resolution: "fhd",
      status: "ready",
      minDuration: 600.001,
      maxDuration: 1800,
      offset: 100,
      limit: 200,
    };
    expect(validateLibraryQuery(query)).toEqual(query);
  });
  it("rejects malformed, inverted, unbounded and injectable queries", () => {
    for (const query of [
      null,
      [],
      { minDuration: 10, maxDuration: 1 },
      { minDuration: NaN },
      { limit: 201 },
      { offset: 1.5 },
      { status: "ready OR 1=1" },
      { resolution: "8k" },
      { sort: "name; DROP TABLE media" },
      { unknown: true },
      { favorites: "true" },
      { rootId: "../../" },
      { search: "x".repeat(1001) },
    ])
      expect(() => validateLibraryQuery(query)).toThrow();
  });
});
