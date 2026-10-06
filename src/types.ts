export type Ecosystem = "npm" | "PyPI";
export type DependencyScope = "runtime" | "development" | "unknown";

export interface Dependency {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  scope: DependencyScope;
  source: string;
}

export interface Advisory {
  id: string;
  aliases: string[];
  summary: string | null;
  modified: string | null;
  severityScores: string[];
  references: string[];
}

export interface PackageRegistryMetadata {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  latestVersion: string | null;
  license: string | null;
  deprecated: boolean;
  deprecationMessage: string | null;
  repositoryUrl: string | null;
  packageUrl: string | null;
}

export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
}

export interface GitHubRepositoryMetadata extends GitHubRepositoryRef {
  htmlUrl: string;
  defaultBranch: string;
  archived: boolean;
  disabled: boolean;
  pushedAt: string | null;
  updatedAt: string | null;
  licenseSpdx: string | null;
  stars: number;
  forks: number;
  openIssues: number;
}

export type FindingLevel = "attention" | "review" | "info";

export interface Finding {
  level: FindingLevel;
  code: string;
  message: string;
}

export interface PackageAssessment {
  dependency: Dependency;
  registry: PackageRegistryMetadata | null;
  advisories: Advisory[];
  upstreamRepository: GitHubRepositoryMetadata | null;
  findings: Finding[];
  errors: string[];
}
