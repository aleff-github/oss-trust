import { describe, expect, it } from "vitest";

describe("repository summary semantics", () => {
  it("distinguishes affected packages from unique advisory identifiers", () => {
    const affected = [
      {
        dependency: { scope: "development" },
        advisoryIds: ["GHSA-example"]
      },
      {
        dependency: { scope: "development" },
        advisoryIds: ["GHSA-example"]
      },
      {
        dependency: { scope: "runtime" },
        advisoryIds: ["GHSA-other"]
      }
    ];

    const uniqueAdvisoryIds = Array.from(
      new Set(affected.flatMap((entry) => entry.advisoryIds))
    ).sort();

    const affectedScopeCounts: Record<string, number> = {};
    for (const entry of affected) {
      affectedScopeCounts[entry.dependency.scope] =
        (affectedScopeCounts[entry.dependency.scope] ?? 0) + 1;
    }

    expect(uniqueAdvisoryIds).toEqual([
      "GHSA-example",
      "GHSA-other"
    ]);
    expect(affectedScopeCounts).toEqual({
      development: 2,
      runtime: 1
    });
  });
});
