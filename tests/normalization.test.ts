import { describe, expect, it } from "vitest";
import { parseRequirementsTxt } from "../src/parsers";

describe("dependency normalization", () => {
  it("deduplicates identical exact PyPI pins case-insensitively", () => {
    const dependencies = parseRequirementsTxt("requests==2.32.5\nRequests==2.32.5\n");
    expect(dependencies).toHaveLength(1);
  });
});
