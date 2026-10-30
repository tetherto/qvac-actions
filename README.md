# qvac-devops

Central operational repository: reusable GitHub Actions workflows and
composite actions shared across the `tetherto` / `qvac` orgs.

## Reusable workflows

- **Canonical security baseline** (TruffleHog + CodeQL) —
  see [`docs/security-baseline.md`](docs/security-baseline.md).

  ```yaml
  uses: tetherto/qvac-devops/.github/workflows/public-reusable-security.yml@main
  ```

## Shared actions

Generic actions at the repository root. None carries a caller's names,
versions or paths: those come in as inputs. Pin them by full commit SHA:

```yaml
uses: tetherto/qvac-actions/setup-clang@<commit sha>
```

| Action | What it does |
|---|---|
| `checkout`, `setup-node`, `setup-pnpm`, `setup-java`, `setup-python`, `setup-android`, `upload-artifact`, `download-artifact`, `configure-aws-credentials`, `github-script`, `pypi-publish` | The upstream action, pinned by SHA in one place; `checkout` does not persist credentials unless asked; `setup-node` takes a required version and checks for the newest match |
| `cache`, `cache-restore`, `cache-save` | `actions/cache`, pinned; `cache` and `cache-save` save only on `push`, `workflow_dispatch`, `merge_group`, `schedule` and `pull_request` |
| `setup-clang` | LLVM from apt.llvm.org (key checked against a fingerprint) on Linux, or Chocolatey on Windows, which GitHub-hosted images ship |
| `setup-android-ndk` | The given NDK revision, installed if missing; Linux x64 hosts only |
| `setup-aws-cli` | The AWS CLI where missing, only from a signed installer |
| `setup-xcode` | The first installed Xcode of the given versions, plus brew packages and gems |
| `runner-free-disk`, `runner-apt-install` | Free space on Linux runners; install validated apt packages |
| `cpp-check-format` | Fail on changed C/C++ lines that are not clang-formatted |
| `ios-import-signing` | Signing certificate in a throwaway keychain and a provisioning profile; a post step removes both. Assumes one runner per macOS user, since jobs share the profile file by UUID |
| `devicefarm-upload`, `devicefarm-schedule-runs`, `devicefarm-wait-runs`, `devicefarm-cancel-runs` | Upload to, schedule, wait for and stop AWS Device Farm runs |
| `devicefarm-download-logs`, `devicefarm-summarize-results` | Fetch the logs a caller names, credentials redacted, and tabulate TAP results per device |
| `npm-release-dist-tag` | `latest` for a stable version at or above npm's latest, otherwise `<prefix><major>.<minor>` |
| `npm-release-publish` | Publish with provenance over OIDC from a release ref only, skipping prerelease tags and versions npm already has |

Each action's `action.yaml` documents its inputs.

## Design docs

- **License / compliance CI gate** (Q2 design; Q3 implementation) —
  see [`docs/license-compliance-ci.md`](docs/license-compliance-ci.md).

Other reusable workflows and composite actions live in
[`.github/workflows/`](.github/workflows) and
[`.github/actions/`](.github/actions).
