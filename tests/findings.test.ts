import { describe, expect, it } from "vitest";
import { findingsFor } from "../src/assessment";
import type { Dependency, PackageAssessment } from "../src/types";

const dependency: Dependency = {
  ecosystem: "npm",
  name: "@babel/parser",
  version: "8.0.6",
  scope: "runtime",
  source: "package-lock.json"
};

describe("findingsFor", () => {
  it("does not interpret a registry latest-tag mismatch as proof that the assessed version is outdated", () => {
    const partial: Omit<
      PackageAssessment,
      "dependency" | "findings"
    > = {
      registry: {
        ecosystem: "npm",
        name: "@babel/parser",
        version: "8.0.6",
        latestVersion: "7.29.9",
        license: "MIT",
        deprecated: false,
        deprecationMessage: null,
        repositoryUrl:
          "https://github.com/babel/babel.git",
        packageUrl:
          "https://www.npmjs.com/package/@babel/parser/v/8.0.6"
      },
      advisories: [],
      upstreamRepository: null,
      errors: []
    };

    const findings = findingsFor(dependency, partial);

    expect(findings).toEqual([
      {
        level: "info",
        code: "registry-version-difference",
        message:
          "The assessed version is 8.0.6; the registry's default/latest endpoint reports 7.29.9. This difference does not by itself mean the assessed version is outdated."
      }
    ]);
  });
});
