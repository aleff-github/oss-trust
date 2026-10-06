import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import {
  analyzeRepository,
  assessDependency,
  summarizeRepository
} from "./assessment";
import type { Dependency, Ecosystem } from "./types";

interface Env {
  GITHUB_TOKEN?: string;
  OPENAI_APPS_CHALLENGE?: string;
}

function asTextPayload(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "oss-trust",
    version: "0.1.3"
  });

  server.registerTool(
    "summarize_repository",
    {
      description:
        "Produce a compact whole-repository dependency and known-advisory summary using one batched OSV lookup. Use this before requesting detailed per-package evidence.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      },
      inputSchema: z.object({
        repository: z
          .string()
          .min(1)
          .describe("GitHub URL or owner/repository."),
        maxDependencies: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(1000)
          .describe(
            "Maximum exact dependencies to include in the summary scan."
          )
      })
    },
    async ({ repository, maxDependencies }) => {
      try {
        return asTextPayload(
          await summarizeRepository(repository, {
            githubToken: env.GITHUB_TOKEN,
            maxDependencies
          })
        );
      } catch (error) {
        return {
          ...asTextPayload({
            error:
              error instanceof Error
                ? error.message
                : String(error)
          }),
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "analyze_repository",
    {
      description:
        "Analyze a page of exact dependencies in a GitHub repository using batched OSV lookups plus public package registry metadata. Results are paginated to remain compatible with zero-cost Worker limits.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      },
      inputSchema: z.object({
        repository: z
          .string()
          .min(1)
          .describe("GitHub URL or owner/repository."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe(
            "Zero-based dependency offset returned by a previous page."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(20)
          .describe(
            "Dependencies to assess in this page. Maximum 20."
          )
      })
    },
    async ({ repository, offset, limit }) => {
      try {
        return asTextPayload(
          await analyzeRepository(repository, {
            githubToken: env.GITHUB_TOKEN,
            offset,
            limit
          })
        );
      } catch (error) {
        return {
          ...asTextPayload({
            error:
              error instanceof Error
                ? error.message
                : String(error)
          }),
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "assess_package",
    {
      description:
        "Deeply assess one exact npm or PyPI package version using detailed OSV data, registry version metadata, and upstream GitHub maintenance signals when available.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      },
      inputSchema: z.object({
        ecosystem: z
          .enum(["npm", "PyPI"])
          .describe("Package ecosystem."),
        name: z.string().min(1).describe("Package name."),
        version: z
          .string()
          .min(1)
          .describe("Exact package version.")
      })
    },
    async ({ ecosystem, name, version }) => {
      const dependency: Dependency = {
        ecosystem: ecosystem as Ecosystem,
        name,
        version,
        scope: "unknown",
        source: "direct-request"
      };

      try {
        return asTextPayload(
          await assessDependency(dependency, {
            githubToken: env.GITHUB_TOKEN,
            includeUpstreamRepository: true,
            includeLatestVersion: true
          })
        );
      } catch (error) {
        return {
          ...asTextPayload({
            error:
              error instanceof Error
                ? error.message
                : String(error)
          }),
          isError: true
        };
      }
    }
  );

  return server;
}

export default {
  fetch(request: Request, env: Env, context: any) {
    const url = new URL(request.url);
    if (url.pathname === "/.well-known/openai-apps-challenge") {
      const token = env.OPENAI_APPS_CHALLENGE;
      return new Response(token ?? "OpenAI apps challenge not configured", {
        status: token ? 200 : 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    return createMcpHandler(() => createServer(env))(
      request,
      env,
      context
    );
  }
};
