import type { Dependency, GitHubRepositoryRef } from "./types";

const EXACT_REQUIREMENT = /^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?==([^\s;]+)(?:\s*;.*)?$/;

export function parseGitHubRepository(input: string): GitHubRepositoryRef {
  const value = input.trim();
  if (!value) throw new Error("Repository is required.");

  let path = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new Error("Only github.com repositories are supported in the MVP.");
    }
    path = url.pathname;
  }

  const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segments.length < 2) throw new Error("Use a GitHub URL or owner/repository.");

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!owner || !repo) throw new Error("Could not parse the GitHub repository.");
  return { owner, repo };
}

function dedupeDependencies(dependencies: Dependency[]): Dependency[] {
  const seen = new Set<string>();
  const output: Dependency[] = [];

  for (const dependency of dependencies) {
    const key = `${dependency.ecosystem}:\0${dependency.name.toLowerCase()}:\0${dependency.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(dependency);
  }
  return output;
}

interface PackageLockDependency {
  version?: unknown;
  dev?: unknown;
  dependencies?: Record<string, PackageLockDependency>;
}

export function parsePackageLock(content: string): Dependency[] {
  const parsed = JSON.parse(content) as {
    packages?: Record<string, { version?: unknown; dev?: unknown }>;
    dependencies?: Record<string, PackageLockDependency>;
  };
  const dependencies: Dependency[] = [];

  if (parsed.packages && typeof parsed.packages === "object") {
    for (const [packagePath, metadata] of Object.entries(parsed.packages)) {
      if (!packagePath || !metadata || typeof metadata.version !== "string") continue;
      const marker = "node_modules/";
      const markerIndex = packagePath.lastIndexOf(marker);
      if (markerIndex < 0) continue;
      const name = packagePath.slice(markerIndex + marker.length);
      if (!name) continue;

      dependencies.push({
        ecosystem: "npm",
        name,
        version: metadata.version,
        scope: metadata.dev === true ? "development" : "runtime",
        source: "package-lock.json"
      });
    }
    return dedupeDependencies(dependencies);
  }

  const walk = (entries: Record<string, PackageLockDependency> | undefined, inheritedDevelopment = false): void => {
    if (!entries) return;
    for (const [name, metadata] of Object.entries(entries)) {
      if (!metadata || typeof metadata.version !== "string") continue;
      const development = inheritedDevelopment || metadata.dev === true;
      dependencies.push({
        ecosystem: "npm",
        name,
        version: metadata.version,
        scope: development ? "development" : "runtime",
        source: "package-lock.json"
      });
      walk(metadata.dependencies, development);
    }
  };

  walk(parsed.dependencies);
  return dedupeDependencies(dependencies);
}

export function parseRequirementsTxt(content: string): Dependency[] {
  const dependencies: Dependency[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("-") || line.includes("://") || line.startsWith("git+")) continue;

    const match = EXACT_REQUIREMENT.exec(line);
    if (!match) continue;

    dependencies.push({
      ecosystem: "PyPI",
      name: match[1],
      version: match[2],
      scope: "unknown",
      source: "requirements.txt"
    });
  }
  return dedupeDependencies(dependencies);
}

export function extractGitHubRepositoryFromUrl(repositoryUrl: string | null): GitHubRepositoryRef | null {
  if (!repositoryUrl) return null;

  const normalized = repositoryUrl
    .trim()
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/");

  try {
    return parseGitHubRepository(normalized);
  } catch {
    return null;
  }
}
