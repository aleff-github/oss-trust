# Privacy Policy

OSS Trust is a read-only open-source dependency due-diligence tool.

## Data processed

When a tool is used, the MCP service receives the structured arguments required for the requested assessment, such as a public GitHub repository identifier or an exact npm/PyPI package name and version.

Depending on the request, OSS Trust may query GitHub, OSV, the npm registry, and the PyPI JSON API. For supported private-repository analysis, a deployment-side read-only GitHub token may be configured; that token is not part of the plugin package and should never be supplied by users in chat.

OSS Trust is designed as a stateless service and does not intentionally persist repository identifiers, dependency inventories, assessment results, or ChatGPT conversation content in application storage.

The service is hosted on Cloudflare Workers. Infrastructure providers may process technical request and security telemetry under their own terms and policies.

## Third-party services

OSS Trust may communicate with:

- GitHub;
- OSV;
- the npm registry;
- PyPI;
- Cloudflare infrastructure used to host the MCP service.

OSS Trust does not sell user data and does not use assessment data for advertising or behavioral profiling.

## User responsibility

Do not include passwords, authentication tokens, private source code, or unrelated sensitive information in tool inputs.

## Changes

This policy may be updated if the service's data practices or third-party integrations change.
