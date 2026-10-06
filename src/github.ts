import type { GitHubRepositoryMetadata, GitHubRepositoryRef } from "./types";

const API_BASE = "https://api.github.com";

function requestHeaders(token?: string): HeadersInit {
  const output: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "oss-trust-mcp"
  };

  if (token) output.Authorization = `Bearer ${token}`;
  return output;
}

async function githubJson<T>(
  path: string,
  token?: string,
  allowNotFound = false
): Promise<T | null> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: requestHeaders(token)
  });

  if (allowNotFound && response.status === 404) return null;

  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    const authState = token
      ? "GITHUB_TOKEN is configured for this Worker."
      : "GITHUB_TOKEN is not configured; GitHub REST is using the anonymous rate limit.";

    if (response.status === 404) {
      throw new Error(
        `GitHub resource was not found or is not accessible with the current credentials (HTTP 404). ${authState} Private repositories require a token with read access.`
      );
    }

    if (response.status === 401) {
      throw new Error(
        `GitHub authentication failed with HTTP 401. ${authState}`
      );
    }

    const rateLimitDetail =
      remaining === "0"
        ? ` GitHub API rate limit was exhausted.${
            reset
              ? ` Reset epoch: ${reset}.`
              : ""
          } ${authState}`
        : ` ${authState}`;

    throw new Error(
      `GitHub API request failed with HTTP ${response.status}.${rateLimitDetail}`
    );
  }

  return (await response.json()) as T;
}

export async function fetchRepositoryMetadata(
  reference: GitHubRepositoryRef,
  token?: string
): Promise<GitHubRepositoryMetadata> {
  const data = await githubJson<{
    html_url: string;
    default_branch: string;
    archived: boolean;
    disabled: boolean;
    pushed_at: string | null;
    updated_at: string | null;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    license: { spdx_id?: string | null } | null;
  }>(`/repos/${reference.owner}/${reference.repo}`, token);

  if (!data) {
    throw new Error("Repository metadata was not returned.");
  }

  return {
    ...reference,
    htmlUrl: data.html_url,
    defaultBranch: data.default_branch,
    archived: data.archived,
    disabled: data.disabled,
    pushedAt: data.pushed_at,
    updatedAt: data.updated_at,
    licenseSpdx: data.license?.spdx_id ?? null,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count
  };
}

export async function fetchRepositoryFile(
  reference: GitHubRepositoryRef,
  path: string,
  token?: string
): Promise<string | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const data = await githubJson<{
    type: string;
    encoding?: string;
    content?: string;
  }>(
    `/repos/${reference.owner}/${reference.repo}/contents/${encodedPath}`,
    token,
    true
  );

  if (!data) return null;

  if (
    data.type !== "file" ||
    data.encoding !== "base64" ||
    typeof data.content !== "string"
  ) {
    throw new Error(`Unsupported GitHub content response for ${path}.`);
  }

  const raw = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(raw, (character) =>
    character.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}


export interface RepositoryFileFetchResult {
  content: string | null;
  source: "github-api" | "github-raw";
  apiError: string | null;
}

export async function fetchPublicRepositoryFile(
  reference: GitHubRepositoryRef,
  path: string
): Promise<string | null> {
  const encodedOwner = encodeURIComponent(reference.owner);
  const encodedRepo = encodeURIComponent(reference.repo);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const candidateRefs = ["HEAD", "main", "master"];

  for (const ref of candidateRefs) {
    const url =
      `https://raw.githubusercontent.com/${encodedOwner}/${encodedRepo}/${ref}/${encodedPath}`;

    const response = await fetch(url, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "oss-trust-mcp"
      }
    });

    if (response.status === 404) continue;

    if (!response.ok) {
      throw new Error(
        `GitHub public raw-file request failed with HTTP ${response.status} for ref ${ref}.`
      );
    }

    return response.text();
  }

  return null;
}

export async function fetchRepositoryFileResilient(
  reference: GitHubRepositoryRef,
  path: string,
  token?: string
): Promise<RepositoryFileFetchResult> {
  try {
    return {
      content: await fetchRepositoryFile(reference, path, token),
      source: "github-api",
      apiError: null
    };
  } catch (error) {
    const apiError =
      error instanceof Error ? error.message : String(error);

    try {
      return {
        content: await fetchPublicRepositoryFile(reference, path),
        source: "github-raw",
        apiError
      };
    } catch (rawError) {
      throw new Error(
        `${apiError} Public raw-file fallback also failed: ${
          rawError instanceof Error ? rawError.message : String(rawError)
        }`
      );
    }
  }
}
