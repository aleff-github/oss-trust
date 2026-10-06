import { fetchRepositoryFileResilient, fetchRepositoryMetadata } from "./github";
import { fetchOsvAdvisory, queryOsv, queryOsvBatch } from "./osv";
import { extractGitHubRepositoryFromUrl, parseGitHubRepository, parsePackageLock, parseRequirementsTxt } from "./parsers";
import { fetchPackageMetadata } from "./registries";
import type { Advisory, Dependency, Finding, GitHubRepositoryMetadata, PackageAssessment } from "./types";

type RepositoryEvidence =
  | GitHubRepositoryMetadata
  | {
      owner: string;
      repo: string;
      htmlUrl: string;
      metadataUnavailable: true;
    };

interface LoadedRepository {
  repository: RepositoryEvidence;
  repositoryWarnings: string[];
  manifestsFound: string[];
  manifestSources: Record<string, "github-api" | "github-raw">;
  manifestErrors: string[];
  dependencies: Dependency[];
}

export function findingsFor(
  dependency: Dependency,
  assessment: Omit<PackageAssessment, "dependency" | "findings">
): Finding[] {
  const findings: Finding[] = [];

  if (assessment.advisories.length > 0) {
    findings.push({
      level: "attention",
      code: "known-advisories",
      message: `${assessment.advisories.length} known advisory record(s) were returned by OSV for this exact version.`
    });
  }

  if (assessment.registry?.deprecated) {
    findings.push({
      level: "attention",
      code: "deprecated-package",
      message:
        assessment.registry.deprecationMessage ??
        "The package registry marks this package version as deprecated."
    });
  }

  if (!assessment.registry?.license) {
    findings.push({
      level: "review",
      code: "license-missing",
      message:
        "No declared package license was found in the queried registry metadata."
    });
  }

  if (
    assessment.registry?.latestVersion &&
    assessment.registry.latestVersion !== dependency.version
  ) {
    findings.push({
      level: "info",
      code: "registry-version-difference",
      message: `The assessed version is ${dependency.version}; the registry's default/latest endpoint reports ${assessment.registry.latestVersion}. This difference does not by itself mean the assessed version is outdated.`
    });
  }

  if (assessment.upstreamRepository?.archived) {
    findings.push({
      level: "attention",
      code: "upstream-archived",
      message: "The upstream GitHub repository is archived."
    });
  }

  if (assessment.upstreamRepository?.disabled) {
    findings.push({
      level: "attention",
      code: "upstream-disabled",
      message: "The upstream GitHub repository is disabled."
    });
  }

  if (assessment.upstreamRepository?.pushedAt) {
    const pushedAt = Date.parse(assessment.upstreamRepository.pushedAt);
    const twoYears = 2 * 365 * 24 * 60 * 60 * 1000;

    if (Number.isFinite(pushedAt) && Date.now() - pushedAt > twoYears) {
      findings.push({
        level: "review",
        code: "old-upstream-push",
        message:
          "The upstream GitHub repository has not reported a push in more than two years."
      });
    }
  }

  if (assessment.errors.length > 0) {
    findings.push({
      level: "review",
      code: "incomplete-evidence",
      message:
        "One or more data sources could not be queried; review the errors before interpreting missing evidence."
    });
  }

  return findings;
}

async function loadRepository(
  repository: string,
  githubToken?: string
): Promise<LoadedRepository> {
  const reference = parseGitHubRepository(repository);

  const [metadataResult, packageLockResult, requirementsResult] =
    await Promise.allSettled([
      fetchRepositoryMetadata(reference, githubToken),
      fetchRepositoryFileResilient(
        reference,
        "package-lock.json",
        githubToken
      ),
      fetchRepositoryFileResilient(
        reference,
        "requirements.txt",
        githubToken
      )
    ]);

  const repositoryWarnings: string[] = [];
  const manifestErrors: string[] = [];
  const manifestSources: Record<
    string,
    "github-api" | "github-raw"
  > = {};

  let metadata: GitHubRepositoryMetadata | null = null;

  if (metadataResult.status === "fulfilled") {
    metadata = metadataResult.value;
  } else {
    repositoryWarnings.push(
      `repository-metadata: ${
        metadataResult.reason instanceof Error
          ? metadataResult.reason.message
          : String(metadataResult.reason)
      }`
    );
  }

  const discovered: Dependency[] = [];
  const manifestsFound: string[] = [];

  const processManifest = (
    name: string,
    result:
      | PromiseFulfilledResult<{
          content: string | null;
          source: "github-api" | "github-raw";
          apiError: string | null;
        }>
      | PromiseRejectedResult,
    parser: (content: string) => Dependency[]
  ) => {
    if (result.status === "rejected") {
      manifestErrors.push(
        `${name}: ${
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
        }`
      );
      return;
    }

    if (result.value.content === null) return;

    manifestsFound.push(name);
    manifestSources[name] = result.value.source;

    if (result.value.apiError && result.value.source === "github-raw") {
      repositoryWarnings.push(
        `${name}: GitHub REST was unavailable; the public raw-file fallback was used. ${result.value.apiError}`
      );
    }

    try {
      discovered.push(...parser(result.value.content));
    } catch (error) {
      manifestErrors.push(
        `${name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  processManifest(
    "package-lock.json",
    packageLockResult,
    parsePackageLock
  );
  processManifest(
    "requirements.txt",
    requirementsResult,
    parseRequirementsTxt
  );

  if (!metadata && manifestsFound.length === 0) {
    const metadataError =
      metadataResult.status === "rejected"
        ? metadataResult.reason
        : new Error("Repository metadata was unavailable.");

    throw metadataError instanceof Error
      ? metadataError
      : new Error(String(metadataError));
  }

  const dependencies = Array.from(
    new Map(
      discovered.map((dependency) => [
        `${dependency.ecosystem}:\0${dependency.name.toLowerCase()}:\0${dependency.version}`,
        dependency
      ])
    ).values()
  );

  return {
    repository:
      metadata ?? {
        ...reference,
        htmlUrl:
          `https://github.com/${reference.owner}/${reference.repo}`,
        metadataUnavailable: true
      },
    repositoryWarnings,
    manifestsFound,
    manifestSources,
    manifestErrors,
    dependencies
  };
}

export async function assessDependency(
  dependency: Dependency,
  options: {
    githubToken?: string;
    includeUpstreamRepository?: boolean;
    includeLatestVersion?: boolean;
    advisoriesOverride?: Advisory[];
    extraErrors?: string[];
  } = {}
): Promise<PackageAssessment> {
  const errors: string[] = [...(options.extraErrors ?? [])];

  const registryPromise = fetchPackageMetadata(dependency, {
    includeLatestVersion: options.includeLatestVersion ?? true
  });

  const osvPromise =
    options.advisoriesOverride !== undefined
      ? Promise.resolve(options.advisoriesOverride)
      : queryOsv(dependency);

  const [registryResult, osvResult] = await Promise.allSettled([
    registryPromise,
    osvPromise
  ]);

  const registry =
    registryResult.status === "fulfilled" ? registryResult.value : null;
  const advisories =
    osvResult.status === "fulfilled" ? osvResult.value : [];

  if (registryResult.status === "rejected") {
    errors.push(
      `registry: ${registryResult.reason instanceof Error ? registryResult.reason.message : String(registryResult.reason)}`
    );
  }

  if (osvResult.status === "rejected") {
    errors.push(
      `osv: ${osvResult.reason instanceof Error ? osvResult.reason.message : String(osvResult.reason)}`
    );
  }

  let upstreamRepository: GitHubRepositoryMetadata | null = null;

  if (options.includeUpstreamRepository && registry?.repositoryUrl) {
    const upstreamRef = extractGitHubRepositoryFromUrl(registry.repositoryUrl);

    if (upstreamRef) {
      try {
        upstreamRepository = await fetchRepositoryMetadata(
          upstreamRef,
          options.githubToken
        );
      } catch (error) {
        errors.push(
          `upstream-github: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  const partial = {
    registry,
    advisories,
    upstreamRepository,
    errors
  };

  return {
    dependency,
    ...partial,
    findings: findingsFor(dependency, partial)
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, values.length) },
      () => worker()
    )
  );

  return results;
}

export async function summarizeRepository(
  repository: string,
  options: {
    githubToken?: string;
    maxDependencies?: number;
  } = {}
) {
  const loaded = await loadRepository(repository, options.githubToken);
  const maxDependencies = Math.max(
    1,
    Math.min(options.maxDependencies ?? 1000, 1000)
  );
  const selected = loaded.dependencies.slice(0, maxDependencies);

  const ecosystemCounts: Record<string, number> = {};
  const scopeCounts: Record<string, number> = {};

  for (const dependency of selected) {
    ecosystemCounts[dependency.ecosystem] =
      (ecosystemCounts[dependency.ecosystem] ?? 0) + 1;
    scopeCounts[dependency.scope] =
      (scopeCounts[dependency.scope] ?? 0) + 1;
  }

  let advisories: Advisory[][] = selected.map(() => []);
  let osvError: string | null = null;
  let truncatedIndices: number[] = [];

  try {
    const batch = await queryOsvBatch(selected);
    advisories = batch.advisories;
    truncatedIndices = batch.truncatedIndices;
  } catch (error) {
    osvError = error instanceof Error ? error.message : String(error);
  }

  const affected = selected
    .map((dependency, index) => ({
      dependency,
      advisoryIds: (advisories[index] ?? []).map((advisory) => advisory.id),
      osvResultTruncated: truncatedIndices.includes(index)
    }))
    .filter((entry) => entry.advisoryIds.length > 0);

  const advisoryRecordCount = affected.reduce(
    (total, entry) => total + entry.advisoryIds.length,
    0
  );

  const uniqueAdvisoryIds = Array.from(
    new Set(affected.flatMap((entry) => entry.advisoryIds))
  ).sort();

  const affectedScopeCounts: Record<string, number> = {};
  for (const entry of affected) {
    affectedScopeCounts[entry.dependency.scope] =
      (affectedScopeCounts[entry.dependency.scope] ?? 0) + 1;
  }

  const maxDetailedAdvisories = 10;
  const advisoryIdsForDetails = uniqueAdvisoryIds.slice(
    0,
    maxDetailedAdvisories
  );

  const advisoryDetailResults = await Promise.allSettled(
    advisoryIdsForDetails.map((id) => fetchOsvAdvisory(id))
  );

  const advisoryDetails = advisoryDetailResults.map((result, index) => {
    const id = advisoryIdsForDetails[index];
    const affectedPackages = affected
      .filter((entry) => entry.advisoryIds.includes(id))
      .map((entry) => ({
        ecosystem: entry.dependency.ecosystem,
        name: entry.dependency.name,
        version: entry.dependency.version,
        scope: entry.dependency.scope
      }));

    if (result.status === "fulfilled") {
      return {
        id,
        advisory: result.value,
        affectedPackages,
        error: null
      };
    }

    return {
      id,
      advisory: null,
      affectedPackages,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
    };
  });

  const maxAffectedInResponse = 100;

  return {
    repository: loaded.repository,
    repositoryWarnings: loaded.repositoryWarnings,
    manifestsFound: loaded.manifestsFound,
    manifestSources: loaded.manifestSources,
    manifestErrors: loaded.manifestErrors,
    dependencyCount: loaded.dependencies.length,
    scannedDependencyCount: selected.length,
    dependencyScanTruncated:
      selected.length < loaded.dependencies.length,
    ecosystemCounts,
    scopeCounts,
    securitySummary: {
      dependenciesWithKnownAdvisories: affected.length,
      affectedScopeCounts,
      advisoryRecordCount,
      uniqueAdvisoryCount: uniqueAdvisoryIds.length,
      uniqueAdvisoryIds,
      advisoryDetails,
      advisoryDetailsTruncated:
        uniqueAdvisoryIds.length > maxDetailedAdvisories,
      osvQueryError: osvError,
      dependenciesWithPaginatedOsvResults: truncatedIndices.length
    },
    affectedDependencies: affected.slice(0, maxAffectedInResponse),
    affectedDependenciesTruncated:
      affected.length > maxAffectedInResponse,
    evidenceMode: {
      repositoryFiles:
        "GitHub REST with public raw-file fallback when REST is unavailable or rate-limited",
      osv: "single querybatch request for the scanned dependency inventory",
      packageRegistry:
        "not queried in summary mode; use analyze_repository or assess_package for license, deprecation, and registry-version evidence",
      advisoryCounting:
        "advisoryRecordCount counts dependency-to-advisory matches. uniqueAdvisoryCount deduplicates identical OSV advisory IDs across packages, but distinct advisory namespaces can still describe the same underlying vulnerability.",
      advisoryDetails:
        "Detailed OSV evidence is fetched for at most 10 unique advisory IDs per summary so the request stays comfortably within the free Worker subrequest budget."
    }
  };
}

export async function analyzeRepository(
  repository: string,
  options: {
    githubToken?: string;
    offset?: number;
    limit?: number;
  } = {}
) {
  const loaded = await loadRepository(repository, options.githubToken);
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, Math.min(options.limit ?? 20, 20));
  const selected = loaded.dependencies.slice(offset, offset + limit);

  let batchAdvisories: Advisory[][] = selected.map(() => []);
  let batchError: string | null = null;
  let truncatedIndices = new Set<number>();

  try {
    const batch = await queryOsvBatch(selected);
    batchAdvisories = batch.advisories;
    truncatedIndices = new Set(batch.truncatedIndices);
  } catch (error) {
    batchError =
      error instanceof Error ? error.message : String(error);
  }

  const assessments = await mapWithConcurrency(
    selected,
    2,
    (dependency, index) => {
      const extraErrors: string[] = [];

      if (batchError) {
        extraErrors.push(`osv-batch: ${batchError}`);
      }

      if (truncatedIndices.has(index)) {
        extraErrors.push(
          "osv-batch: the vulnerability list was paginated and this MVP returned only the first page."
        );
      }

      return assessDependency(dependency, {
        githubToken: options.githubToken,
        includeUpstreamRepository: false,
        includeLatestVersion: true,
        advisoriesOverride: batchAdvisories[index] ?? [],
        extraErrors
      });
    }
  );

  const nextOffset =
    offset + assessments.length < loaded.dependencies.length
      ? offset + assessments.length
      : null;

  return {
    repository: loaded.repository,
    repositoryWarnings: loaded.repositoryWarnings,
    manifestsFound: loaded.manifestsFound,
    manifestSources: loaded.manifestSources,
    manifestErrors: loaded.manifestErrors,
    supportedManifestCount: loaded.manifestsFound.length,
    dependencyCount: loaded.dependencies.length,
    page: {
      offset,
      limit,
      assessedDependencyCount: assessments.length,
      nextOffset,
      hasMore: nextOffset !== null
    },
    evidenceMode: {
      repositoryFiles:
        "GitHub REST with public raw-file fallback when REST is unavailable or rate-limited",
      osv: "batch",
      packageRegistry:
        "exact-version plus latest-version metadata",
      upstreamRepository:
        "available through assess_package for targeted inspection"
    },
    assessments
  };
}
