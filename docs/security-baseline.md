# Canonical security baseline workflow

This document describes the reusable GitHub Actions workflow at
[`.github/workflows/public-reusable-security.yml`](../.github/workflows/public-reusable-security.yml)
that runs the org's baseline security checks (TruffleHog secret scanning +
CodeQL static analysis) on a consuming repository.

> **Status: v0 (drafted only).** The workflow is committed in
> `tetherto/qvac-devops` and is ready to be wired into Tier-1 repos via a
> single `uses:` line. Actually enabling it on each Tier-1 repo is owned by
> the Q3 rollout ticket.

## What it does

On every `push` and `pull_request` in the consuming repository:

1. **TruffleHog** scans the diff (`base..head` on PRs, `before..head` on
   pushes) for verified secrets and fails the job when any are found.
   Unverified matches are non-blocking by default.
2. **CodeQL** runs the standard `security-extended` +
   `security-and-quality` query packs against each detected (or explicitly
   listed) language. Results are uploaded to the repository's **Security**
   tab. The job fails when any result meets or exceeds the configured
   `severity-threshold`.
3. A **summary** step writes a result table to the job summary and (on PR
   events) upserts a single bot comment on the PR when findings exist.

## Quick start

In the consuming repository, add `.github/workflows/security.yml`:

```yaml
name: Security baseline

on:
  push:
    branches: [main]
  pull_request:

jobs:
  baseline:
    uses: tetherto/qvac-devops/.github/workflows/public-reusable-security.yml@main
    permissions:
      contents: read
      security-events: write
      pull-requests: write
      actions: read
    secrets: inherit
```

That's it — defaults take over.

## Inputs

All inputs are optional.

- **`languages`** _(string)_ — comma-separated CodeQL languages override
  (e.g. `javascript-typescript,python`). Empty default uses a file-based
  autodetect; set explicitly when autodetect misses something (often C/C++).
- **`severity-threshold`** _(string, default `high`)_ — lowest CodeQL
  severity that fails the job. One of `low`, `medium`, `high`, `critical`.
  See [Severity semantics](#severity-semantics).
- **`paths-include`** _(string, multiline)_ — newline-separated path globs
  scoped into the scan, applied to both TruffleHog (`--include-paths`) and
  the generated CodeQL `paths:` config.
- **`paths-exclude`** _(string, multiline)_ — newline-separated path globs
  excluded from the scan (`--exclude-paths` / CodeQL `paths-ignore:`).
- **`allowlist-path`** _(string)_ — path within the consumer repo to a
  TruffleHog allowlist YAML (known false positives). See
  [Allowlist format](#allowlist-format).
- **`trufflehog-fail-on-unverified`** _(boolean, default `false`)_ — when
  `true`, any TruffleHog match (verified or not) fails the job. Default
  keeps v0 noise low by only failing on verified secrets.
- **`codeql-queries`** _(string, default `security-extended,security-and-quality`)_ —
  override the CodeQL query packs.
- **`enable-pr-comment`** _(boolean, default `true`)_ — post a summary
  comment on PRs when findings exist. The job summary is always written.

## Secrets

- **`gh_token`** _(optional)_ — token used for SARIF upload and PR
  comments. Defaults to `github.token`. Override only if you need
  cross-repo permissions (rare for security baseline use).

## Required caller permissions

```yaml
permissions:
  contents: read
  security-events: write   # CodeQL SARIF upload
  pull-requests: write     # PR comment upsert
  actions: read
```

`secrets: inherit` is the simplest and recommended pass-through.

## Allowlist format

The TruffleHog config is a YAML file in your consuming repo, e.g.
`.github/trufflehog-allowlist.yml`:

```yaml
# Detector-scoped allowlist for known false positives.
detectors:
  - name: Generic
    keywords: [example]
    allowlist:
      - "tests/fixtures/fake-token.txt"
      - "docs/examples/.*\\.md$"
```

Pass it via `allowlist-path: .github/trufflehog-allowlist.yml`. Document
each entry — auditors will ask.

## Severity semantics

`severity-threshold` is matched against the SARIF `level` of each CodeQL
result using the standard CodeQL -> SARIF severity mapping:

| Input value | SARIF levels that fail the job |
| --- | --- |
| `critical`, `high` | `error` |
| `medium` | `error`, `warning` |
| `low` | `error`, `warning`, `note` |

Default is `high`, i.e. fail only on `error`-level findings. Choose
`medium` or `low` only when you're ready to triage the volume.

## Adopting in a repo that already has CodeQL

CodeQL refuses to upload two SARIF runs with overlapping `category` values
for the same commit. Before wiring this workflow in:

1. Delete the existing `codeql.yml` (or whatever CodeQL workflow you have).
2. Verify the old workflow is removed from the default branch.
3. Add the consumer snippet above.

The baseline uses `category: /language:<lang>`, which matches CodeQL's own
default category.

## Versioning

For v0 ("drafted only"), pin to `@main`:

```yaml
uses: tetherto/qvac-devops/.github/workflows/public-reusable-security.yml@main
```

Once v0 ships and a tag (e.g. `security/v0.1.0`) is cut on `qvac-devops`,
switch all consumers to that tag.

## Notes / known limitations

- The `trufflesecurity/trufflehog` action does not publish stable semver
  tags; for v0 it is pinned by SHA with a version comment. Update by SHA,
  not tag, when bumping.
- CodeQL autodetect can miss C/C++ in mixed repos — use the `languages`
  input to override.
- A first run on a fresh repo takes ~5-7 minutes (CodeQL bootstraps a
  database). Subsequent runs use the CodeQL cache.
- This workflow is orthogonal to the existing
  [`sfw-guard`](../.github/actions/sfw-guard/action.yml) Socket Firewall
  composite action: TruffleHog + CodeQL cover source-tree static analysis,
  `sfw-guard` covers supply-chain at install time. Use both.
