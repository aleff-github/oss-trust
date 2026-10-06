---
name: dependency-due-diligence
description: Assess the trust posture of open-source dependencies in a GitHub repository or an exact npm/PyPI package version using vulnerability, licensing, version, deprecation, and maintenance evidence.
---

Use this skill for open-source dependency due diligence before adoption, release, procurement, or production use.

## Workflow

1. For a GitHub repository, call `summarize_repository` first.
2. Use `analyze_repository` when detailed registry evidence is needed; follow `page.nextOffset` only as far as the user's request requires.
3. Use `assess_package` for one exact npm or PyPI package version or for deeper package-specific evidence.
4. Base conclusions only on returned evidence.

## Interpretation rules

- Never call a package secure merely because no known advisory was returned.
- Distinguish no-known-advisory evidence from proof that no vulnerabilities exist.
- Keep declared license metadata separate from legal conclusions.
- Distinguish version differences from confirmed vulnerabilities.
- Treat deprecation and archived/upstream-maintenance signals as context, not automatic security findings.
- Surface missing metadata, pagination limits, API errors, or rate-limit fallbacks.
- Do not present OSS Trust as a generic source-code vulnerability scanner.

## Output

Start with the most important confirmed findings, preserve dependency scope where available, show exact assessed versions, and keep advisories separate from maintenance/version signals.
