# Public repo inventory - tetherto (CodeScan readiness)

_Snapshot generated 2026-06-15 by read-only GitHub API discovery (`gh api`), for the Q3 weekly-CodeScan rollout. See [codescan-q3-rollout.md](codescan-q3-rollout.md) for the plan and [security-baseline.md](security-baseline.md) for the workflow that will be enabled._

## Summary

- Total public repos under `tetherto`: **139** (forks: 14, archived: 2)
- Buckets: **ready-now 104**, **needs-config 4**, **archive-candidate 2**, **out-of-scope 29**
- CodeQL status: **enabled 12**, **none detected 127**
- Activity: **active 128**, **dormant 2**, **stale 9**

## How this was produced

All data is read-only, gathered per repo via the GitHub REST API:

- Repo set: `GET /orgs/tetherto/repos?type=public` (paginated).
- Language(s): `GET /repos/{o}/{r}/languages` (all languages, not just primary), mapped to CodeQL language identifiers.
- Primary maintainer: `CODEOWNERS` global (`*`) owner where present, else the most frequent non-bot committer in the last ~30 default-branch commits. The source is shown in the table.
- Last commit: HEAD commit date on the default branch (`GET /repos/{o}/{r}/commits?sha={default}`), falling back to `pushed_at`.
- CodeQL status: readable `GET /repos/{o}/{r}/code-scanning/analyses?tool_name=CodeQL` where access allows, plus detection of CodeQL/canonical security workflow files on the default branch via the git tree.
- Blockers: git tree scan for `.gitmodules`, committed build/vendor dirs, repo size, mixed C/C++, and existing CodeQL setup (Default vs advanced workflow).

## Limitations (read honestly before acting)

- `code-scanning/default-setup` is admin-gated and returned `403` for this token, so "enabled via GitHub Default setup" is **inferred** from readable analyses + absence of a workflow file, not read directly.
- The `code-scanning/analyses` endpoint is readable only on a subset of repos (the `qvac*` repos here); elsewhere CodeQL status is derived from workflow-file evidence and shown as `none detected` when no workflow exists. `none detected` means "no CodeScan wired up yet", which is the expected pre-rollout state.
- Maintainer is a heuristic where no `CODEOWNERS` exists (labelled `recent-committer`); confirm owners during Wave 0.
- Only the `tetherto` org is visible to this token. A `qvac` sub-org is referenced in the repo README but is not reachable here; including it would need a token with `admin:org` / org access. Flagged as an open item.

## Legend

- **Bucket** - `ready-now` (active, CodeQL-supported, no blocker), `needs-config` (supported but needs config first), `archive-candidate` (no default-branch commit in >12 months), `out-of-scope` (fork / archived / no analyzable code / no CodeQL-supported language).
- **Activity** - `active` (commit within 6 months), `dormant` (6-12 months), `stale` (>12 months).
- **CodeQL status** - `enabled` (analyses present), `configured (...)` (workflow present), `none detected` (no workflow; pre-rollout).

## Inventory (all 139 public repos)

| # | Repo | Language(s) | Maintainer (source) | Last commit | Activity | CodeQL status | Blockers | Bucket |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [active_attr](https://github.com/tetherto/active_attr) | Ruby | @cgriego (recent-committer) | 2024-09-05 | stale | none detected | - | out-of-scope |
| 2 | [bare-crypto](https://github.com/tetherto/bare-crypto) | JavaScript, C, CMake | @kasperisager (recent-committer) | 2024-11-11 | stale | none detected | git-submodules (verify); committed-build-artifacts (use paths-exclude); mixed-c-cpp (set languages explicitly) | out-of-scope |
| 3 | [create-wdk-module](https://github.com/tetherto/create-wdk-module) | JavaScript | @jonathunne (recent-committer) | 2026-05-25 | active | none detected | - | ready-now |
| 4 | [docs-template](https://github.com/tetherto/docs-template) | TypeScript, JavaScript, MDX, CSS | @tetherto/docs (CODEOWNERS) | 2026-06-08 | active | none detected | - | ready-now |
| 5 | [fast-text-encoding](https://github.com/tetherto/fast-text-encoding) | JavaScript, HTML, Shell | @samthor (recent-committer) | 2022-08-30 | stale | none detected | - | out-of-scope |
| 6 | [flathub](https://github.com/tetherto/flathub) | - | @bbhtt (recent-committer) | 2025-09-19 | dormant | none detected | - | out-of-scope |
| 7 | [hp-svc-facs-net](https://github.com/tetherto/hp-svc-facs-net) | JavaScript | @vigan-abd (recent-committer) | 2026-05-12 | active | none detected | - | ready-now |
| 8 | [hp-svc-facs-store](https://github.com/tetherto/hp-svc-facs-store) | JavaScript | @vigan-abd (recent-committer) | 2026-04-30 | active | none detected | - | ready-now |
| 9 | [lib-pear-pass](https://github.com/tetherto/lib-pear-pass) | JavaScript | @mafintosh (recent-committer) | 2025-01-08 | stale | none detected | - | out-of-scope |
| 10 | [mdk](https://github.com/tetherto/mdk) | TypeScript, JavaScript, SCSS, Shell, CSS, HTML | @tetherto/moria-bk-merge @tetherto/moria-ui-merge (CODEOWNERS) | 2026-06-15 | active | none detected | - | ready-now |
| 11 | [miningos-app-node](https://github.com/tetherto/miningos-app-node) | JavaScript, HTML, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-09 | active | none detected | - | ready-now |
| 12 | [miningos-app-ui](https://github.com/tetherto/miningos-app-ui) | TypeScript, JavaScript, CSS, HTML | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-27 | active | none detected | - | ready-now |
| 13 | [miningos-lib-stats](https://github.com/tetherto/miningos-lib-stats) | JavaScript | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 14 | [miningos-mock-control-service](https://github.com/tetherto/miningos-mock-control-service) | JavaScript | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 15 | [miningos-tpl-wrk-container](https://github.com/tetherto/miningos-tpl-wrk-container) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 16 | [miningos-tpl-wrk-electricity](https://github.com/tetherto/miningos-tpl-wrk-electricity) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 17 | [miningos-tpl-wrk-miner](https://github.com/tetherto/miningos-tpl-wrk-miner) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-01 | active | none detected | - | ready-now |
| 18 | [miningos-tpl-wrk-powermeter](https://github.com/tetherto/miningos-tpl-wrk-powermeter) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 19 | [miningos-tpl-wrk-sensor](https://github.com/tetherto/miningos-tpl-wrk-sensor) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 20 | [miningos-tpl-wrk-thing](https://github.com/tetherto/miningos-tpl-wrk-thing) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-27 | active | none detected | - | ready-now |
| 21 | [miningos-wrk-container-antspace](https://github.com/tetherto/miningos-wrk-container-antspace) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 22 | [miningos-wrk-container-bitdeer](https://github.com/tetherto/miningos-wrk-container-bitdeer) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 23 | [miningos-wrk-container-microbt](https://github.com/tetherto/miningos-wrk-container-microbt) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 24 | [miningos-wrk-dhcp](https://github.com/tetherto/miningos-wrk-dhcp) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 25 | [miningos-wrk-electricity-base](https://github.com/tetherto/miningos-wrk-electricity-base) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 26 | [miningos-wrk-ext-mempool](https://github.com/tetherto/miningos-wrk-ext-mempool) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 27 | [miningos-wrk-ext-openweather](https://github.com/tetherto/miningos-wrk-ext-openweather) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 28 | [miningos-wrk-inventory](https://github.com/tetherto/miningos-wrk-inventory) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 29 | [miningos-wrk-miner-antminer](https://github.com/tetherto/miningos-wrk-miner-antminer) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-29 | active | none detected | - | ready-now |
| 30 | [miningos-wrk-miner-avalon](https://github.com/tetherto/miningos-wrk-miner-avalon) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 31 | [miningos-wrk-minerpool-f2pool](https://github.com/tetherto/miningos-wrk-minerpool-f2pool) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 32 | [miningos-wrk-minerpool-luxor](https://github.com/tetherto/miningos-wrk-minerpool-luxor) | - | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-03-20 | active | none detected | - | out-of-scope |
| 33 | [miningos-wrk-minerpool-ocean](https://github.com/tetherto/miningos-wrk-minerpool-ocean) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-09 | active | none detected | - | ready-now |
| 34 | [miningos-wrk-miner-whatsminer](https://github.com/tetherto/miningos-wrk-miner-whatsminer) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-09 | active | none detected | - | ready-now |
| 35 | [miningos-wrk-ork](https://github.com/tetherto/miningos-wrk-ork) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-09 | active | none detected | - | ready-now |
| 36 | [miningos-wrk-powermeter-abb](https://github.com/tetherto/miningos-wrk-powermeter-abb) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 37 | [miningos-wrk-powermeter-satec](https://github.com/tetherto/miningos-wrk-powermeter-satec) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 38 | [miningos-wrk-powermeter-schneider](https://github.com/tetherto/miningos-wrk-powermeter-schneider) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 39 | [miningos-wrk-sensor-temp-seneca](https://github.com/tetherto/miningos-wrk-sensor-temp-seneca) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 | active | none detected | - | ready-now |
| 40 | [omnicore](https://github.com/tetherto/omnicore) | - | @dexX7 (recent-committer) | 2019-07-22 | stale | none detected | - | out-of-scope |
| 41 | [oss-actions](https://github.com/tetherto/oss-actions) | - | @mafintosh (recent-committer) | 2026-04-15 | active | none detected | - | out-of-scope |
| 42 | [pear-apps-lib-feedback](https://github.com/tetherto/pear-apps-lib-feedback) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 43 | [pear-apps-lib-ui-react-hooks](https://github.com/tetherto/pear-apps-lib-ui-react-hooks) | JavaScript | @torkinos (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 44 | [pear-apps-utils-avatar-initials](https://github.com/tetherto/pear-apps-utils-avatar-initials) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 45 | [pear-apps-utils-date](https://github.com/tetherto/pear-apps-utils-date) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 46 | [pear-apps-utils-generate-unique-id](https://github.com/tetherto/pear-apps-utils-generate-unique-id) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 47 | [pear-apps-utils-pattern-search](https://github.com/tetherto/pear-apps-utils-pattern-search) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 48 | [pear-apps-utils-qr](https://github.com/tetherto/pear-apps-utils-qr) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 49 | [pear-apps-utils-validator](https://github.com/tetherto/pear-apps-utils-validator) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 50 | [pearpass-app-browser-extension](https://github.com/tetherto/pearpass-app-browser-extension) | JavaScript, TypeScript, CSS, HTML | @giorgikh93 (recent-committer) | 2026-06-08 | active | none detected | - | ready-now |
| 51 | [pearpass-app-desktop](https://github.com/tetherto/pearpass-app-desktop) | TypeScript, JavaScript, Shell, PowerShell, HTML, CSS | @ndolidzee (recent-committer) | 2026-06-10 | active | none detected | - | ready-now |
| 52 | [pearpass-app-mobile](https://github.com/tetherto/pearpass-app-mobile) | JavaScript, TypeScript, Java, Swift, Shell, Kotlin, Objective-C, CSS | @ndolidzee (recent-committer) | 2026-06-15 | active | none detected | - | ready-now |
| 53 | [pearpass-lib-constants](https://github.com/tetherto/pearpass-lib-constants) | JavaScript | @torkinos (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 54 | [pearpass-lib-data-export](https://github.com/tetherto/pearpass-lib-data-export) | JavaScript | @torkinos (recent-committer) | 2026-06-02 | active | none detected | - | ready-now |
| 55 | [pearpass-lib-data-import](https://github.com/tetherto/pearpass-lib-data-import) | JavaScript | @torkinos (recent-committer) | 2026-06-02 | active | none detected | - | ready-now |
| 56 | [pearpass-lib-native-messaging-bridge](https://github.com/tetherto/pearpass-lib-native-messaging-bridge) | JavaScript | @shavtvalishvili (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 57 | [pearpass-lib-ui-react-native-components](https://github.com/tetherto/pearpass-lib-ui-react-native-components) | JavaScript | @torkinos (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 58 | [pearpass-lib-ui-theme-provider](https://github.com/tetherto/pearpass-lib-ui-theme-provider) | JavaScript | @torkinos (recent-committer) | 2026-05-28 | active | none detected | - | ready-now |
| 59 | [pearpass-lib-vault](https://github.com/tetherto/pearpass-lib-vault) | JavaScript | @shavtvalishvili (recent-committer) | 2026-06-10 | active | none detected | - | ready-now |
| 60 | [pearpass-lib-vault-core](https://github.com/tetherto/pearpass-lib-vault-core) | JavaScript | @shavtvalishvili (recent-committer) | 2026-05-25 | active | none detected | - | ready-now |
| 61 | [pearpass-utils-password-check](https://github.com/tetherto/pearpass-utils-password-check) | JavaScript | @torkinos (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 62 | [pearpass-utils-password-generator](https://github.com/tetherto/pearpass-utils-password-generator) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 63 | [pear-wrk-wdk](https://github.com/tetherto/pear-wrk-wdk) | JavaScript | @jonathunne (recent-committer) | 2026-04-09 | active | none detected | - | ready-now |
| 64 | [pub](https://github.com/tetherto/pub) | - | @achamely (recent-committer) | 2025-09-30 | dormant | none detected | - | out-of-scope |
| 65 | [qvac](https://github.com/tetherto/qvac) | TypeScript, JavaScript, C++, Python, Shell, CMake, PowerShell | @tetherto/qvac-internal-dev @tetherto/qvac-internal-merge (CODEOWNERS) | 2026-06-15 | active | enabled | large-repo ~300MB (review scope); mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | needs-config |
| 66 | [qvac-actions](https://github.com/tetherto/qvac-actions) | JavaScript, Dockerfile | @GSServita (recent-committer) | 2026-06-10 | active | enabled | - | ready-now |
| 67 | [qvac-bare-addon-example](https://github.com/tetherto/qvac-bare-addon-example) | C++, JavaScript, Mermaid, CMake | (unknown) (unknown) | 2026-05-15 | active | enabled | mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | needs-config |
| 68 | [qvac-examples](https://github.com/tetherto/qvac-examples) | - | (unknown) (unknown) | 2026-06-02 | active | none detected | - | out-of-scope |
| 69 | [qvac-ext-bergamot-translator](https://github.com/tetherto/qvac-ext-bergamot-translator) | C++, JavaScript, Python, CMake, Shell, CSS, HTML, C | @tetherto/qvac-internal-dev @tetherto/qvac-internal-merge (CODEOWNERS) | 2026-06-11 | active | enabled | git-submodules (verify); mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | out-of-scope |
| 70 | [qvac-ext-ggml](https://github.com/tetherto/qvac-ext-ggml) | C++, C, Cuda, Metal, GLSL, WGSL, CMake, Go Template, Objective-C, Shell, Python | @ggerganov (recent-committer) | 2026-04-14 | active | enabled | git-submodules (verify); mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | out-of-scope |
| 71 | [qvac-ext-lib-whisper.cpp](https://github.com/tetherto/qvac-ext-lib-whisper.cpp) | C++, C, Cuda, Python, Metal, CMake, GLSL, WGSL, Shell, Go Template, Objective-C, Go, Ruby, Java, Makefile, Batchfile, Dockerfile, Objective-C++, JavaScript | @tetherto/qvac-internal-dev @tetherto/qvac-internal-merge (CODEOWNERS) | 2026-06-15 | active | enabled | mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | out-of-scope |
| 72 | [qvac-ext-marian-dev](https://github.com/tetherto/qvac-ext-marian-dev) | C++, Cuda, CMake, HTML, Python, Batchfile, Shell, PowerShell, Dockerfile, Makefile, JavaScript, C, Perl, Vim Script | @tetherto/qvac-internal-merge (CODEOWNERS) | 2026-05-22 | active | enabled | git-submodules (verify); mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | out-of-scope |
| 73 | [qvac-ext-stable-diffusion.cpp](https://github.com/tetherto/qvac-ext-stable-diffusion.cpp) | C++, C, CMake, Python, Dockerfile, Shell | @leejet (recent-committer) | 2026-03-07 | active | enabled | git-submodules (verify); mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | out-of-scope |
| 74 | [qvac-fabric-llm.cpp](https://github.com/tetherto/qvac-fabric-llm.cpp) | C++, C, Python, Cuda, HTML, TypeScript, Svelte, Shell, Metal, GLSL, Jinja, CMake, WGSL, Go Template, Objective-C, Dockerfile, Nix, JavaScript, PowerShell, CSS, MDX, Makefile, Batchfile, SCSS | @tetherto/qvac-internal-dev (CODEOWNERS) | 2026-05-28 | active | enabled | git-submodules (verify); committed-build-artifacts (use paths-exclude); large-repo ~357MB (review scope); mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | out-of-scope |
| 75 | [qvac-football-predictor](https://github.com/tetherto/qvac-football-predictor) | JavaScript, HTML | @thomasblc (recent-committer) | 2026-06-12 | active | enabled | existing-default-setup (set codeql-upload:never or switch to advanced) | needs-config |
| 76 | [qvac-registry-vcpkg](https://github.com/tetherto/qvac-registry-vcpkg) | CMake | @gianni-cor (recent-committer) | 2026-06-12 | active | enabled | existing-default-setup (set codeql-upload:never or switch to advanced) | out-of-scope |
| 77 | [qvac-rnd-fabric-llm-bitnet](https://github.com/tetherto/qvac-rnd-fabric-llm-bitnet) | Python | @akshaypn (recent-committer) | 2026-03-17 | active | enabled | existing-default-setup (set codeql-upload:never or switch to advanced) | needs-config |
| 78 | [qvac-rnd-fabric-llm-finetune](https://github.com/tetherto/qvac-rnd-fabric-llm-finetune) | Python | @nurmanmus (recent-committer) | 2026-01-27 | active | none detected | - | ready-now |
| 79 | [svc-facs-action-approver](https://github.com/tetherto/svc-facs-action-approver) | JavaScript | @paragmore (recent-committer) | 2026-04-30 | active | none detected | - | ready-now |
| 80 | [svc-facs-auth](https://github.com/tetherto/svc-facs-auth) | JavaScript | @mukama (recent-committer) | 2026-05-14 | active | none detected | - | ready-now |
| 81 | [svc-facs-dhcp-kea](https://github.com/tetherto/svc-facs-dhcp-kea) | JavaScript | @Kumar-Kishan (recent-committer) | 2024-01-09 | stale | none detected | - | archive-candidate |
| 82 | [svc-facs-httpd](https://github.com/tetherto/svc-facs-httpd) | JavaScript | @vigan-abd (recent-committer) | 2026-05-26 | active | none detected | - | ready-now |
| 83 | [svc-facs-httpd-oauth2](https://github.com/tetherto/svc-facs-httpd-oauth2) | JavaScript | @vigan-abd (recent-committer) | 2026-04-30 | active | none detected | - | ready-now |
| 84 | [svc-facs-logging](https://github.com/tetherto/svc-facs-logging) | JavaScript | @vigan-abd (recent-committer) | 2026-04-30 | active | none detected | - | ready-now |
| 85 | [svc-facs-miningos-net](https://github.com/tetherto/svc-facs-miningos-net) | JavaScript | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 86 | [svc-facs-miningos-thg-write-calls](https://github.com/tetherto/svc-facs-miningos-thg-write-calls) | JavaScript | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 | active | none detected | - | ready-now |
| 87 | [svc-facs-modbus](https://github.com/tetherto/svc-facs-modbus) | JavaScript | @chetasr (recent-committer) | 2026-05-06 | active | none detected | - | ready-now |
| 88 | [svc-facs-mqtt](https://github.com/tetherto/svc-facs-mqtt) | JavaScript | @chetasr (recent-committer) | 2026-04-30 | active | none detected | - | ready-now |
| 89 | [svc-facs-tcp](https://github.com/tetherto/svc-facs-tcp) | JavaScript | @vigan-abd (recent-committer) | 2026-04-30 | active | none detected | - | ready-now |
| 90 | [tether-api-client-ruby](https://github.com/tetherto/tether-api-client-ruby) | Ruby | @Aldekein (recent-committer) | 2016-05-27 | stale | none detected | - | archive-candidate |
| 91 | [tether-dev-docs](https://github.com/tetherto/tether-dev-docs) | JavaScript | @torkinos (recent-committer) | 2026-05-28 | active | none detected | - | ready-now |
| 92 | [Tether-Near](https://github.com/tetherto/Tether-Near) | Rust, Shell, JavaScript | @achamely (recent-committer) | 2022-09-21 | stale | none detected | - | out-of-scope |
| 93 | [tether-svc-test-helper](https://github.com/tetherto/tether-svc-test-helper) | JavaScript | @s-badran (recent-committer) | 2026-05-05 | active | none detected | - | ready-now |
| 94 | [tether-wallet-app-releases](https://github.com/tetherto/tether-wallet-app-releases) | - | @gasolin (recent-committer) | 2026-06-02 | active | none detected | - | out-of-scope |
| 95 | [tether-wrk-base](https://github.com/tetherto/tether-wrk-base) | JavaScript, Shell | @vigan-abd (recent-committer) | 2026-06-15 | active | none detected | - | ready-now |
| 96 | [tmp-test-0](https://github.com/tetherto/tmp-test-0) | - | (unknown) (unknown) | 2024-11-06 | stale | none detected | - | out-of-scope |
| 97 | [wdk](https://github.com/tetherto/wdk) | JavaScript | @AlonzoRicardo (recent-committer) | 2026-06-12 | active | none detected | - | ready-now |
| 98 | [wdk-agent-skills](https://github.com/tetherto/wdk-agent-skills) | - | @jonathunne (recent-committer) | 2026-06-11 | active | none detected | - | out-of-scope |
| 99 | [wdk-asset-registry](https://github.com/tetherto/wdk-asset-registry) | JavaScript | @sontuphan (recent-committer) | 2026-06-11 | active | none detected | - | ready-now |
| 100 | [wdk-backup-cloud](https://github.com/tetherto/wdk-backup-cloud) | - | (unknown) (unknown) | 2026-06-03 | active | none detected | - | out-of-scope |
| 101 | [wdk-backup-cloud-react-native](https://github.com/tetherto/wdk-backup-cloud-react-native) | TypeScript, JavaScript | @jonathunne (recent-committer) | 2026-05-06 | active | none detected | - | ready-now |
| 102 | [wdk-backup-remote](https://github.com/tetherto/wdk-backup-remote) | - | @quocle108 (recent-committer) | 2026-04-16 | active | none detected | - | out-of-scope |
| 103 | [wdk-cli](https://github.com/tetherto/wdk-cli) | - | (unknown) (unknown) | 2026-05-05 | active | none detected | - | out-of-scope |
| 104 | [wdk-docs](https://github.com/tetherto/wdk-docs) | MDX, JavaScript, TypeScript, CSS, Nunjucks | @ihsraham (recent-committer) | 2026-06-15 | active | none detected | - | ready-now |
| 105 | [wdk-examples](https://github.com/tetherto/wdk-examples) | TypeScript, Python | @ihsraham (recent-committer) | 2026-06-15 | active | none detected | - | ready-now |
| 106 | [wdk-failover-provider](https://github.com/tetherto/wdk-failover-provider) | JavaScript | @jonathunne (recent-committer) | 2026-05-07 | active | none detected | - | ready-now |
| 107 | [wdk-indexer-http](https://github.com/tetherto/wdk-indexer-http) | JavaScript | @gatteo (recent-committer) | 2026-01-09 | active | none detected | - | ready-now |
| 108 | [wdk-mcp-toolkit](https://github.com/tetherto/wdk-mcp-toolkit) | JavaScript | @jonathunne (recent-committer) | 2026-06-10 | active | none detected | - | ready-now |
| 109 | [wdk-pricing-bitfinex-http](https://github.com/tetherto/wdk-pricing-bitfinex-http) | JavaScript | @jonathunne (recent-committer) | 2026-06-09 | active | none detected | - | ready-now |
| 110 | [wdk-pricing-coingecko-http](https://github.com/tetherto/wdk-pricing-coingecko-http) | - | @quocle108 (recent-committer) | 2026-06-10 | active | none detected | - | out-of-scope |
| 111 | [wdk-pricing-provider](https://github.com/tetherto/wdk-pricing-provider) | JavaScript | @jonathunne (recent-committer) | 2026-06-09 | active | none detected | - | ready-now |
| 112 | [wdk-protocol-bridge-usdt0-evm](https://github.com/tetherto/wdk-protocol-bridge-usdt0-evm) | JavaScript | @jonathunne (recent-committer) | 2026-05-15 | active | none detected | - | ready-now |
| 113 | [wdk-protocol-fiat-moonpay](https://github.com/tetherto/wdk-protocol-fiat-moonpay) | JavaScript | @jonathunne (recent-committer) | 2026-04-18 | active | none detected | - | ready-now |
| 114 | [wdk-protocol-lending-aave-evm](https://github.com/tetherto/wdk-protocol-lending-aave-evm) | JavaScript | @jonathunne (recent-committer) | 2026-04-18 | active | none detected | - | ready-now |
| 115 | [wdk-protocol-swap-velora-evm](https://github.com/tetherto/wdk-protocol-swap-velora-evm) | JavaScript | @jonathunne (recent-committer) | 2026-04-16 | active | none detected | - | ready-now |
| 116 | [wdk-react-native-core](https://github.com/tetherto/wdk-react-native-core) | TypeScript, JavaScript | @nulllpc (recent-committer) | 2026-06-14 | active | none detected | - | ready-now |
| 117 | [wdk-react-native-provider](https://github.com/tetherto/wdk-react-native-provider) | TypeScript, JavaScript | @ndrkltsk (recent-committer) | 2026-05-29 | active | none detected | - | ready-now |
| 118 | [wdk-react-native-secure-storage](https://github.com/tetherto/wdk-react-native-secure-storage) | TypeScript, JavaScript | @jonathunne (recent-committer) | 2026-06-15 | active | none detected | - | ready-now |
| 119 | [wdk-safe-core-sdk](https://github.com/tetherto/wdk-safe-core-sdk) | TypeScript, Solidity, JavaScript, Shell | @jonathunne (recent-committer) | 2026-04-19 | active | none detected | - | out-of-scope |
| 120 | [wdk-safe-protocol-kit](https://github.com/tetherto/wdk-safe-protocol-kit) | - | (unknown) (unknown) | 2026-05-13 | active | none detected | - | out-of-scope |
| 121 | [wdk-safe-relay-kit](https://github.com/tetherto/wdk-safe-relay-kit) | - | (unknown) (unknown) | 2026-05-13 | active | none detected | - | out-of-scope |
| 122 | [wdk-secret-manager](https://github.com/tetherto/wdk-secret-manager) | JavaScript | @claudiovb (recent-committer) | 2026-05-06 | active | none detected | - | ready-now |
| 123 | [wdk-signer-local](https://github.com/tetherto/wdk-signer-local) | - | @quocle108 (recent-committer) | 2026-04-19 | active | none detected | - | out-of-scope |
| 124 | [wdk-starter-react-native](https://github.com/tetherto/wdk-starter-react-native) | TypeScript, JavaScript | @ndrkltsk (recent-committer) | 2025-12-24 | active | none detected | - | ready-now |
| 125 | [wdk-uikit-react-native](https://github.com/tetherto/wdk-uikit-react-native) | TypeScript, JavaScript | @gatteo (recent-committer) | 2026-06-15 | active | none detected | - | ready-now |
| 126 | [wdk-utils](https://github.com/tetherto/wdk-utils) | JavaScript | @nulllpc (recent-committer) | 2026-06-13 | active | none detected | - | ready-now |
| 127 | [wdk-wallet](https://github.com/tetherto/wdk-wallet) | JavaScript | @jonathunne (recent-committer) | 2026-06-10 | active | none detected | - | ready-now |
| 128 | [wdk-wallet-btc](https://github.com/tetherto/wdk-wallet-btc) | JavaScript | @jonathunne (recent-committer) | 2026-04-29 | active | none detected | - | ready-now |
| 129 | [wdk-wallet-evm](https://github.com/tetherto/wdk-wallet-evm) | JavaScript | @jonathunne (recent-committer) | 2026-05-27 | active | none detected | - | ready-now |
| 130 | [wdk-wallet-evm-7702-gasless](https://github.com/tetherto/wdk-wallet-evm-7702-gasless) | JavaScript | @sontuphan (recent-committer) | 2026-06-12 | active | none detected | - | ready-now |
| 131 | [wdk-wallet-evm-erc-4337](https://github.com/tetherto/wdk-wallet-evm-erc-4337) | JavaScript | @jonathunne (recent-committer) | 2026-06-10 | active | none detected | - | ready-now |
| 132 | [wdk-wallet-solana](https://github.com/tetherto/wdk-wallet-solana) | JavaScript | @jonathunne (recent-committer) | 2026-05-27 | active | none detected | - | ready-now |
| 133 | [wdk-wallet-solana-gasless](https://github.com/tetherto/wdk-wallet-solana-gasless) | JavaScript | @sontuphan (recent-committer) | 2026-06-02 | active | none detected | - | ready-now |
| 134 | [wdk-wallet-spark](https://github.com/tetherto/wdk-wallet-spark) | JavaScript | @jonathunne (recent-committer) | 2026-05-27 | active | none detected | - | ready-now |
| 135 | [wdk-wallet-ton](https://github.com/tetherto/wdk-wallet-ton) | JavaScript | @jonathunne (recent-committer) | 2026-05-27 | active | none detected | - | ready-now |
| 136 | [wdk-wallet-ton-gasless](https://github.com/tetherto/wdk-wallet-ton-gasless) | JavaScript | @jonathunne (recent-committer) | 2026-06-01 | active | none detected | - | ready-now |
| 137 | [wdk-wallet-tron](https://github.com/tetherto/wdk-wallet-tron) | JavaScript | @nulllpc (recent-committer) | 2026-06-10 | active | none detected | - | ready-now |
| 138 | [wdk-wallet-tron-gasfree](https://github.com/tetherto/wdk-wallet-tron-gasfree) | JavaScript | @jonathunne (recent-committer) | 2026-05-28 | active | none detected | - | ready-now |
| 139 | [wdk-worklet-bundler](https://github.com/tetherto/wdk-worklet-bundler) | TypeScript, JavaScript | @jonathunne (recent-committer) | 2026-06-11 | active | none detected | - | ready-now |

