import type { Dependency, PackageRegistryMetadata } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {headers: {Accept: "application/json", "User-Agent": "oss-trust-mcp"}});
  if (!response.ok) throw new Error(`Package registry request failed with HTTP ${response.status}.`);
  return (await response.json()) as T;
}

function normalizeRepositoryUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "url" in value && typeof (value as {url?: unknown}).url === "string") {
    return (value as {url: string}).url;
  }
  return null;
}

function normalizeLicense(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "type" in value && typeof (value as {type?: unknown}).type === "string") {
    return (value as {type: string}).type.trim() || null;
  }
  return null;
}

async function npmMetadata(
  dependency: Dependency,
  includeLatestVersion: boolean
): Promise<PackageRegistryMetadata> {
  const packageName = encodeURIComponent(dependency.name);
  const version = encodeURIComponent(dependency.version);

  const currentPromise = getJson<{license?: unknown; deprecated?: unknown; repository?: unknown}>(
    `https://registry.npmjs.org/${packageName}/${version}`
  );
  const latestPromise = includeLatestVersion
    ? getJson<{version?: string}>(`https://registry.npmjs.org/${packageName}/latest`)
    : Promise.resolve(null);

  const [current, latest] = await Promise.all([currentPromise, latestPromise]);
  const deprecationMessage = typeof current.deprecated === "string" && current.deprecated.trim()
    ? current.deprecated.trim()
    : null;

  return {
    ecosystem: "npm",
    name: dependency.name,
    version: dependency.version,
    latestVersion: latest && typeof latest.version === "string" ? latest.version : null,
    license: normalizeLicense(current.license),
    deprecated: deprecationMessage !== null,
    deprecationMessage,
    repositoryUrl: normalizeRepositoryUrl(current.repository),
    packageUrl: `https://www.npmjs.com/package/${dependency.name}/v/${dependency.version}`
  };
}

function pypiClassifierLicense(classifiers: unknown): string | null {
  if (!Array.isArray(classifiers)) return null;
  const item = classifiers.find((value) => typeof value === "string" && value.startsWith("License ::"));
  return typeof item === "string" ? item.replace(/^License ::\s*/, "") : null;
}

async function pypiMetadata(
  dependency: Dependency,
  includeLatestVersion: boolean
): Promise<PackageRegistryMetadata> {
  const packageName = encodeURIComponent(dependency.name);
  const version = encodeURIComponent(dependency.version);

  const currentPromise = getJson<{
    info?: {
      license?: unknown;
      classifiers?: unknown;
      project_urls?: Record<string, unknown> | null;
      home_page?: unknown;
    };
  }>(`https://pypi.org/pypi/${packageName}/${version}/json`);

  const latestPromise = includeLatestVersion
    ? getJson<{info?: {version?: string}}>(`https://pypi.org/pypi/${packageName}/json`)
    : Promise.resolve(null);

  const [current, latest] = await Promise.all([currentPromise, latestPromise]);
  const info = current.info ?? {};
  const projectUrls = info.project_urls ?? {};
  const candidateRepository =
    projectUrls.Repository ??
    projectUrls.Source ??
    projectUrls["Source Code"] ??
    projectUrls.SourceCode ??
    projectUrls.GitHub ??
    projectUrls.Homepage ??
    info.home_page;

  return {
    ecosystem: "PyPI",
    name: dependency.name,
    version: dependency.version,
    latestVersion: latest && typeof latest.info?.version === "string" ? latest.info.version : null,
    license: normalizeLicense(info.license) ?? pypiClassifierLicense(info.classifiers),
    deprecated: false,
    deprecationMessage: null,
    repositoryUrl: typeof candidateRepository === "string" ? candidateRepository : null,
    packageUrl: `https://pypi.org/project/${dependency.name}/${dependency.version}/`
  };
}

export async function fetchPackageMetadata(
  dependency: Dependency,
  options: {includeLatestVersion?: boolean} = {}
): Promise<PackageRegistryMetadata> {
  const includeLatestVersion = options.includeLatestVersion ?? true;
  return dependency.ecosystem === "npm"
    ? npmMetadata(dependency, includeLatestVersion)
    : pypiMetadata(dependency, includeLatestVersion);
}
