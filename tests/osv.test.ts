import { describe, expect, it } from "vitest";
import { dedupeAdvisories } from "../src/osv";

describe("dedupeAdvisories", () => {
  it("merges advisory records that describe the same vulnerability through aliases", () => {
    const result = dedupeAdvisories([
      {
        id: "GHSA-example",
        aliases: ["CVE-2026-0001", "PYSEC-2026-1"],
        summary: "Example issue",
        modified: "2026-09-01T00:00:00Z",
        severityScores: ["CVSS-A"],
        references: ["https://example.test/a"]
      },
      {
        id: "PYSEC-2026-1",
        aliases: ["CVE-2026-0001", "GHSA-example"],
        summary: null,
        modified: "2026-09-02T00:00:00Z",
        severityScores: ["CVSS-B"],
        references: ["https://example.test/b"]
      }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("GHSA-example");
    expect(result[0].aliases).toEqual(
      expect.arrayContaining(["CVE-2026-0001", "PYSEC-2026-1"])
    );
    expect(result[0].severityScores).toEqual(
      expect.arrayContaining(["CVSS-A", "CVSS-B"])
    );
    expect(result[0].references).toHaveLength(2);
    expect(result[0].modified).toBe("2026-09-02T00:00:00Z");
  });
});
