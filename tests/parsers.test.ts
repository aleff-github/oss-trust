import { describe, expect, it } from "vitest";
import { extractGitHubRepositoryFromUrl, parseGitHubRepository, parsePackageLock, parseRequirementsTxt } from "../src/parsers";

describe("parseGitHubRepository", () => {
  it("parses a GitHub URL", () => {
    expect(parseGitHubRepository("https://github.com/example/project.git")).toEqual({owner: "example", repo: "project"});
  });

  it("parses owner/repository", () => {
    expect(parseGitHubRepository("example/project")).toEqual({owner: "example", repo: "project"});
  });

  it("rejects a non-GitHub URL", () => {
    expect(() => parseGitHubRepository("https://gitlab.com/example/project")).toThrow(/github\.com/i);
  });
});

describe("parsePackageLock", () => {
  it("extracts exact npm package versions", () => {
    const result = parsePackageLock(JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {name: "demo", version: "1.0.0"},
        "node_modules/alpha": {version: "2.0.0"},
        "node_modules/@scope/bravo": {version: "3.1.0", dev: true}
      }
    }));

    expect(result).toEqual([
      {ecosystem: "npm", name: "alpha", version: "2.0.0", scope: "runtime", source: "package-lock.json"},
      {ecosystem: "npm", name: "@scope/bravo", version: "3.1.0", scope: "development", source: "package-lock.json"}
    ]);
  });
});

describe("parseRequirementsTxt", () => {
  it("keeps exact pinned requirements only", () => {
    const result = parseRequirementsTxt(`
requests==2.32.5
django>=5
uvicorn[standard]==0.37.0 ; python_version >= "3.11"
# comment
-r other.txt
`);

    expect(result).toEqual([
      {ecosystem: "PyPI", name: "requests", version: "2.32.5", scope: "unknown", source: "requirements.txt"},
      {ecosystem: "PyPI", name: "uvicorn", version: "0.37.0", scope: "unknown", source: "requirements.txt"}
    ]);
  });
});

describe("extractGitHubRepositoryFromUrl", () => {
  it("normalizes npm-style git URLs", () => {
    expect(extractGitHubRepositoryFromUrl("git+https://github.com/example/project.git")).toEqual({owner: "example", repo: "project"});
  });
});
