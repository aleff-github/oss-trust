import type { Advisory, Dependency } from "./types";

interface OsvVulnerability {
  id?: string;
  aliases?: string[];
  summary?: string;
  modified?: string;
  severity?: Array<{ type?: string; score?: string }>;
  references?: Array<{ url?: string }>;
}

interface OsvResponse {
  vulns?: OsvVulnerability[];
}

interface OsvBatchResponse {
  results?: Array<{
    vulns?: Array<{
      id?: string;
      modified?: string;
    }>;
    next_page_token?: string;
  }>;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function identifiers(advisory: Advisory): Set<string> {
  return new Set(
    [advisory.id, ...advisory.aliases].map((value) => value.toUpperCase())
  );
}

function overlaps(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

export function dedupeAdvisories(advisories: Advisory[]): Advisory[] {
  const output: Advisory[] = [];

  for (const advisory of advisories) {
    const currentIds = identifiers(advisory);
    const matchIndex = output.findIndex((candidate) =>
      overlaps(identifiers(candidate), currentIds)
    );

    if (matchIndex === -1) {
      output.push({
        ...advisory,
        aliases: uniqueStrings(advisory.aliases),
        severityScores: uniqueStrings(advisory.severityScores),
        references: uniqueStrings(advisory.references)
      });
      continue;
    }

    const existing = output[matchIndex];
    const mergedIdentifiers = uniqueStrings([
      existing.id,
      ...existing.aliases,
      advisory.id,
      ...advisory.aliases
    ]);

    output[matchIndex] = {
      id: existing.id,
      aliases: mergedIdentifiers.filter((value) => value !== existing.id),
      summary: existing.summary ?? advisory.summary,
      modified:
        [existing.modified, advisory.modified]
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
      severityScores: uniqueStrings([
        ...existing.severityScores,
        ...advisory.severityScores
      ]),
      references: uniqueStrings([
        ...existing.references,
        ...advisory.references
      ]).slice(0, 8)
    };
  }

  return output;
}

function toDetailedAdvisory(vulnerability: OsvVulnerability): Advisory | null {
  if (!vulnerability.id) return null;

  return {
    id: vulnerability.id,
    aliases: vulnerability.aliases ?? [],
    summary: vulnerability.summary ?? null,
    modified: vulnerability.modified ?? null,
    severityScores: (vulnerability.severity ?? [])
      .map((entry) => entry.score)
      .filter((score): score is string => Boolean(score)),
    references: (vulnerability.references ?? [])
      .map((reference) => reference.url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 8)
  };
}

export async function fetchOsvAdvisory(id: string): Promise<Advisory> {
  const response = await fetch(
    `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "oss-trust-mcp"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `OSV advisory request for ${id} failed with HTTP ${response.status}.`
    );
  }

  const vulnerability = (await response.json()) as OsvVulnerability;
  const advisory = toDetailedAdvisory(vulnerability);

  if (!advisory) {
    throw new Error(`OSV advisory ${id} did not include an identifier.`);
  }

  return advisory;
}

export async function queryOsv(dependency: Dependency): Promise<Advisory[]> {
  const response = await fetch("https://api.osv.dev/v1/query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "oss-trust-mcp"
    },
    body: JSON.stringify({
      version: dependency.version,
      package: {
        name: dependency.name,
        ecosystem: dependency.ecosystem
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OSV request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as OsvResponse;
  const detailed = (data.vulns ?? [])
    .map(toDetailedAdvisory)
    .filter((advisory): advisory is Advisory => advisory !== null);

  return dedupeAdvisories(detailed).slice(0, 10);
}

export async function queryOsvBatch(dependencies: Dependency[]): Promise<{
  advisories: Advisory[][];
  truncatedIndices: number[];
}> {
  if (dependencies.length === 0) {
    return { advisories: [], truncatedIndices: [] };
  }

  const response = await fetch("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "oss-trust-mcp"
    },
    body: JSON.stringify({
      queries: dependencies.map((dependency) => ({
        version: dependency.version,
        package: {
          name: dependency.name,
          ecosystem: dependency.ecosystem
        }
      }))
    })
  });

  if (!response.ok) {
    throw new Error(`OSV batch request failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as OsvBatchResponse;
  const results = data.results ?? [];
  const truncatedIndices: number[] = [];

  const advisories = dependencies.map((_, index) => {
    const result = results[index];

    if (result?.next_page_token) {
      truncatedIndices.push(index);
    }

    return (result?.vulns ?? [])
      .filter(
        (item): item is { id: string; modified?: string } =>
          typeof item.id === "string"
      )
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        aliases: [],
        summary: null,
        modified: item.modified ?? null,
        severityScores: [],
        references: []
      }));
  });

  return { advisories, truncatedIndices };
}
