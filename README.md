# OSS Trust

OSS Trust is a read-only ChatGPT and Codex plugin for evidence-first open-source dependency due diligence.

It analyzes supported dependencies found in a GitHub repository, or an exact npm/PyPI package version, and keeps confirmed security findings separate from ordinary maintenance and version differences.

## What it does

- inventories exact dependency versions from supported manifests;
- checks known vulnerabilities through OSV;
- surfaces declared package licenses and deprecation signals when available;
- reports latest-version drift separately from security findings;
- uses upstream GitHub metadata for maintenance signals when available;
- supports repository-level summaries, paginated dependency analysis, and exact package assessment.

## Supported scope

### Repositories

- public GitHub repositories;
- private GitHub repositories when the deployed service is configured with appropriate read-only access.

### Manifests

- `package-lock.json`;
- exact `name==version` entries in `requirements.txt`.

### Package ecosystems

- npm;
- PyPI.

### Data sources

- GitHub;
- OSV;
- npm registry;
- PyPI.

## Evidence model

OSS Trust is intentionally conservative:

- an old package version is not automatically a vulnerability;
- a newer available version is version drift, not a security finding;
- deprecation is reported only when supported by registry evidence;
- declared license metadata is not legal advice;
- absence of an OSV advisory does not prove that a dependency is secure.

## Example

> Analyze the public GitHub repository npm/cli. Identify dependencies with known advisories, distinguish runtime from development impact, and keep confirmed findings separate from maintenance or version differences.

## Limits

Results are point-in-time observations based on available third-party data. OSS Trust is not a source-code vulnerability scanner and does not provide security guarantees or legal conclusions.

## Privacy and terms

- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)
- [Security Policy](SECURITY.md)

## License

GNU General Public License v3.0 only (`GPL-3.0-only`). See [LICENSE](LICENSE).
