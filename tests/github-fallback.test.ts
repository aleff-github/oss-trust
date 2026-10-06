import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRepositoryFileResilient,
  type RepositoryFileFetchResult
} from "../src/github";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GitHub public raw-file fallback", () => {
  it("uses raw.githubusercontent.com/HEAD when REST is rate-limited", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" }
        })
      )
      .mockResolvedValueOnce(
        new Response('{"lockfileVersion":3}', { status: 200 })
      );

    const result: RepositoryFileFetchResult =
      await fetchRepositoryFileResilient(
        { owner: "npm", repo: "cli" },
        "package-lock.json"
      );

    expect(result.content).toBe('{"lockfileVersion":3}');
    expect(result.source).toBe("github-raw");
    expect(result.apiError).toContain("rate limit was exhausted");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://raw.githubusercontent.com/npm/cli/HEAD/package-lock.json",
      expect.any(Object)
    );
  });

  it("treats a missing public raw file as absent after REST failure", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" }
        })
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }));

    const result = await fetchRepositoryFileResilient(
      { owner: "npm", repo: "cli" },
      "requirements.txt"
    );

    expect(result.content).toBeNull();
    expect(result.source).toBe("github-raw");
    expect(result.apiError).toContain("HTTP 403");
  });
});
