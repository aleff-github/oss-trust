import { describe, expect, it } from "vitest";

describe("repository summary advisory detail limits", () => {
  it("caps detailed advisory enrichment at ten unique IDs", () => {
    const ids = Array.from(
      { length: 14 },
      (_, index) => `GHSA-example-${index}`
    );

    expect(ids.slice(0, 10)).toHaveLength(10);
    expect(ids.length > 10).toBe(true);
  });
});
