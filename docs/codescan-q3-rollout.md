# Weekly CodeScan rollout plan - Q3 2026 (tetherto public repos)

_Companion to [public-repo-inventory.md](public-repo-inventory.md) and [security-baseline.md](security-baseline.md). Generated 2026-06-15. Status: draft for review._

- **Reviewer / approver:** Olu (Team Lead) - reviews and accepts this plan and the inventory, and ratifies the Tier-1 list (Wave 0).
- **Weekly triage owner:** each repo's `CODEOWNERS` triage their own CodeScan findings; the DevOps team is the escalation backstop and owns repos that lack `CODEOWNERS`.

## Objective

Q3 commitment: **weekly CodeScan (CodeQL on a schedule) enabled for every in-scope `tetherto` public repo.** This plan turns the inventory into waves that can be executed as individual tickets without redoing discovery. Enabling CodeScan on any repo is the execution work itself and is intentionally out of scope of this planning ticket.

## Scope summary (from the inventory)

- **ready-now: 104** - add the weekly consumer workflow as-is.
- **needs-config: 4** - one config change required before enabling.
- **archive-candidate: 2** - decide archive-vs-keep before enabling.
- **out-of-scope: 29** - 14 forks, 2 archived, plus empty/placeholder and non-CodeQL-language repos.

Full per-repo detail (languages, maintainer, last commit, CodeQL status, blockers) is in the inventory doc.

## Bucketing rules

- **ready-now** - active, at least one CodeQL-supported language, no blocker, no conflicting existing setup.
- **needs-config** - active and supported, but one config change is required first (explicit `languages:` for mixed C/C++, `paths-exclude` for committed artifacts, Default-setup/advanced coexistence, submodule access).
- **archive-candidate** - no default-branch commit in >12 months; archive (or consciously keep) before spending scan budget.
- **out-of-scope** - forks, already-archived, empty/placeholder, or no CodeQL-supported language. Re-evaluate placeholders when code lands.

## Weekly CodeScan workflow template (enable in Q3, per repo)

Add `.github/workflows/weekly-codescan.yml` to each in-scope repo. This adds the **schedule** the Q3 goal requires on top of the canonical reusable workflow:

```yaml
name: Weekly CodeScan
on:
  schedule:
    - cron: "17 4 * * 1"   # every Monday 04:17 UTC
  workflow_dispatch:
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

On a `schedule` event the reusable workflow's TruffleHog falls back to a full-tree scan and CodeQL analyzes the latest commit, so scheduled full scans work without changes to the reusable workflow. `needs-config` repos add `languages:`, `paths-exclude:`, or `codeql-upload: never` as noted in their row below. Pin `@main` until `qvac-devops` cuts a `security/v0.1.0` tag (Wave 0), then move consumers to that tag.

## Wave plan (Q3: Jul 1 - Sep 30, 2026)

| Wave | Window | Contents |
| --- | --- | --- |
| Wave 0 - Prep | Jul 1 - Jul 11 | Olu ratifies Tier-1 list; confirm CODEOWNERS coverage; cut `security/v0.1.0` tag on qvac-devops; decide the 2 archive-candidates; confirm out-of-scope list. |
| Wave 1 - ready-now Tier-1 | start Jul 14 | 21 proposed Tier-1 ready-now repos (table below). |
| Wave 2 - ready-now others | start Aug 1 | 83 remaining ready-now repos. |
| Wave 3 - needs-config | start Aug 25 | 4 repos, after each repo's config fix lands. |
| Wave 4 - buffer / verify | Sep 22 - Sep 30 | Stragglers, archive-candidate execution, verify 100% in-scope coverage, sign-off. |

Each wave below is a direct slice of the inventory, so a Q3 execution ticket can be carved per repo (or per wave batch) without re-running discovery.

### Wave 1 - proposed Tier-1, ready-now (21)

> Tier-1 here is a **proposal** (repos touching secrets, auth, signing, keys, or wallets). Olu ratifies the final Tier-1 list in Wave 0.

| Repo | Language(s) | Maintainer (source) | Last commit |
| --- | --- | --- | --- |
| [pearpass-lib-vault](https://github.com/tetherto/pearpass-lib-vault) | JavaScript | @shavtvalishvili (recent-committer) | 2026-06-10 |
| [pearpass-lib-vault-core](https://github.com/tetherto/pearpass-lib-vault-core) | JavaScript | @shavtvalishvili (recent-committer) | 2026-05-25 |
| [pearpass-utils-password-check](https://github.com/tetherto/pearpass-utils-password-check) | JavaScript | @torkinos (recent-committer) | 2026-06-01 |
| [pearpass-utils-password-generator](https://github.com/tetherto/pearpass-utils-password-generator) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 |
| [svc-facs-action-approver](https://github.com/tetherto/svc-facs-action-approver) | JavaScript | @paragmore (recent-committer) | 2026-04-30 |
| [svc-facs-auth](https://github.com/tetherto/svc-facs-auth) | JavaScript | @mukama (recent-committer) | 2026-05-14 |
| [svc-facs-httpd-oauth2](https://github.com/tetherto/svc-facs-httpd-oauth2) | JavaScript | @vigan-abd (recent-committer) | 2026-04-30 |
| [wdk-react-native-secure-storage](https://github.com/tetherto/wdk-react-native-secure-storage) | TypeScript, JavaScript | @jonathunne (recent-committer) | 2026-06-15 |
| [wdk-secret-manager](https://github.com/tetherto/wdk-secret-manager) | JavaScript | @claudiovb (recent-committer) | 2026-05-06 |
| [wdk-wallet](https://github.com/tetherto/wdk-wallet) | JavaScript | @jonathunne (recent-committer) | 2026-06-10 |
| [wdk-wallet-btc](https://github.com/tetherto/wdk-wallet-btc) | JavaScript | @jonathunne (recent-committer) | 2026-04-29 |
| [wdk-wallet-evm](https://github.com/tetherto/wdk-wallet-evm) | JavaScript | @jonathunne (recent-committer) | 2026-05-27 |
| [wdk-wallet-evm-7702-gasless](https://github.com/tetherto/wdk-wallet-evm-7702-gasless) | JavaScript | @sontuphan (recent-committer) | 2026-06-12 |
| [wdk-wallet-evm-erc-4337](https://github.com/tetherto/wdk-wallet-evm-erc-4337) | JavaScript | @jonathunne (recent-committer) | 2026-06-10 |
| [wdk-wallet-solana](https://github.com/tetherto/wdk-wallet-solana) | JavaScript | @jonathunne (recent-committer) | 2026-05-27 |
| [wdk-wallet-solana-gasless](https://github.com/tetherto/wdk-wallet-solana-gasless) | JavaScript | @sontuphan (recent-committer) | 2026-06-02 |
| [wdk-wallet-spark](https://github.com/tetherto/wdk-wallet-spark) | JavaScript | @jonathunne (recent-committer) | 2026-05-27 |
| [wdk-wallet-ton](https://github.com/tetherto/wdk-wallet-ton) | JavaScript | @jonathunne (recent-committer) | 2026-05-27 |
| [wdk-wallet-ton-gasless](https://github.com/tetherto/wdk-wallet-ton-gasless) | JavaScript | @jonathunne (recent-committer) | 2026-06-01 |
| [wdk-wallet-tron](https://github.com/tetherto/wdk-wallet-tron) | JavaScript | @nulllpc (recent-committer) | 2026-06-10 |
| [wdk-wallet-tron-gasfree](https://github.com/tetherto/wdk-wallet-tron-gasfree) | JavaScript | @jonathunne (recent-committer) | 2026-05-28 |

### Wave 2 - other ready-now (83)

| Repo | Language(s) | Maintainer (source) | Last commit |
| --- | --- | --- | --- |
| [create-wdk-module](https://github.com/tetherto/create-wdk-module) | JavaScript | @jonathunne (recent-committer) | 2026-05-25 |
| [docs-template](https://github.com/tetherto/docs-template) | TypeScript, JavaScript, MDX, CSS | @tetherto/docs (CODEOWNERS) | 2026-06-08 |
| [hp-svc-facs-net](https://github.com/tetherto/hp-svc-facs-net) | JavaScript | @vigan-abd (recent-committer) | 2026-05-12 |
| [hp-svc-facs-store](https://github.com/tetherto/hp-svc-facs-store) | JavaScript | @vigan-abd (recent-committer) | 2026-04-30 |
| [mdk](https://github.com/tetherto/mdk) | TypeScript, JavaScript, SCSS, Shell, CSS, HTML | @tetherto/moria-bk-merge @tetherto/moria-ui-merge (CODEOWNERS) | 2026-06-15 |
| [miningos-app-node](https://github.com/tetherto/miningos-app-node) | JavaScript, HTML, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-09 |
| [miningos-app-ui](https://github.com/tetherto/miningos-app-ui) | TypeScript, JavaScript, CSS, HTML | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-27 |
| [miningos-lib-stats](https://github.com/tetherto/miningos-lib-stats) | JavaScript | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-mock-control-service](https://github.com/tetherto/miningos-mock-control-service) | JavaScript | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-tpl-wrk-container](https://github.com/tetherto/miningos-tpl-wrk-container) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-tpl-wrk-electricity](https://github.com/tetherto/miningos-tpl-wrk-electricity) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-tpl-wrk-miner](https://github.com/tetherto/miningos-tpl-wrk-miner) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-01 |
| [miningos-tpl-wrk-powermeter](https://github.com/tetherto/miningos-tpl-wrk-powermeter) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-tpl-wrk-sensor](https://github.com/tetherto/miningos-tpl-wrk-sensor) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-tpl-wrk-thing](https://github.com/tetherto/miningos-tpl-wrk-thing) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-27 |
| [miningos-wrk-container-antspace](https://github.com/tetherto/miningos-wrk-container-antspace) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [miningos-wrk-container-bitdeer](https://github.com/tetherto/miningos-wrk-container-bitdeer) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [miningos-wrk-container-microbt](https://github.com/tetherto/miningos-wrk-container-microbt) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [miningos-wrk-dhcp](https://github.com/tetherto/miningos-wrk-dhcp) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [miningos-wrk-electricity-base](https://github.com/tetherto/miningos-wrk-electricity-base) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-wrk-ext-mempool](https://github.com/tetherto/miningos-wrk-ext-mempool) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-wrk-ext-openweather](https://github.com/tetherto/miningos-wrk-ext-openweather) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-wrk-inventory](https://github.com/tetherto/miningos-wrk-inventory) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [miningos-wrk-miner-antminer](https://github.com/tetherto/miningos-wrk-miner-antminer) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-29 |
| [miningos-wrk-miner-avalon](https://github.com/tetherto/miningos-wrk-miner-avalon) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-wrk-minerpool-f2pool](https://github.com/tetherto/miningos-wrk-minerpool-f2pool) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [miningos-wrk-minerpool-ocean](https://github.com/tetherto/miningos-wrk-minerpool-ocean) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-09 |
| [miningos-wrk-miner-whatsminer](https://github.com/tetherto/miningos-wrk-miner-whatsminer) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-09 |
| [miningos-wrk-ork](https://github.com/tetherto/miningos-wrk-ork) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-09 |
| [miningos-wrk-powermeter-abb](https://github.com/tetherto/miningos-wrk-powermeter-abb) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [miningos-wrk-powermeter-satec](https://github.com/tetherto/miningos-wrk-powermeter-satec) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [miningos-wrk-powermeter-schneider](https://github.com/tetherto/miningos-wrk-powermeter-schneider) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [miningos-wrk-sensor-temp-seneca](https://github.com/tetherto/miningos-wrk-sensor-temp-seneca) | JavaScript, Shell | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-06-02 |
| [pear-apps-lib-feedback](https://github.com/tetherto/pear-apps-lib-feedback) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 |
| [pear-apps-lib-ui-react-hooks](https://github.com/tetherto/pear-apps-lib-ui-react-hooks) | JavaScript | @torkinos (recent-committer) | 2026-06-01 |
| [pear-apps-utils-avatar-initials](https://github.com/tetherto/pear-apps-utils-avatar-initials) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 |
| [pear-apps-utils-date](https://github.com/tetherto/pear-apps-utils-date) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 |
| [pear-apps-utils-generate-unique-id](https://github.com/tetherto/pear-apps-utils-generate-unique-id) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 |
| [pear-apps-utils-pattern-search](https://github.com/tetherto/pear-apps-utils-pattern-search) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 |
| [pear-apps-utils-qr](https://github.com/tetherto/pear-apps-utils-qr) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 |
| [pear-apps-utils-validator](https://github.com/tetherto/pear-apps-utils-validator) | JavaScript | @giorgikh93 (recent-committer) | 2026-06-01 |
| [pearpass-app-browser-extension](https://github.com/tetherto/pearpass-app-browser-extension) | JavaScript, TypeScript, CSS, HTML | @giorgikh93 (recent-committer) | 2026-06-08 |
| [pearpass-app-desktop](https://github.com/tetherto/pearpass-app-desktop) | TypeScript, JavaScript, Shell, PowerShell, HTML, CSS | @ndolidzee (recent-committer) | 2026-06-10 |
| [pearpass-app-mobile](https://github.com/tetherto/pearpass-app-mobile) | JavaScript, TypeScript, Java, Swift, Shell, Kotlin, Objective-C, CSS | @ndolidzee (recent-committer) | 2026-06-15 |
| [pearpass-lib-constants](https://github.com/tetherto/pearpass-lib-constants) | JavaScript | @torkinos (recent-committer) | 2026-06-01 |
| [pearpass-lib-data-export](https://github.com/tetherto/pearpass-lib-data-export) | JavaScript | @torkinos (recent-committer) | 2026-06-02 |
| [pearpass-lib-data-import](https://github.com/tetherto/pearpass-lib-data-import) | JavaScript | @torkinos (recent-committer) | 2026-06-02 |
| [pearpass-lib-native-messaging-bridge](https://github.com/tetherto/pearpass-lib-native-messaging-bridge) | JavaScript | @shavtvalishvili (recent-committer) | 2026-06-01 |
| [pearpass-lib-ui-react-native-components](https://github.com/tetherto/pearpass-lib-ui-react-native-components) | JavaScript | @torkinos (recent-committer) | 2026-06-01 |
| [pearpass-lib-ui-theme-provider](https://github.com/tetherto/pearpass-lib-ui-theme-provider) | JavaScript | @torkinos (recent-committer) | 2026-05-28 |
| [pear-wrk-wdk](https://github.com/tetherto/pear-wrk-wdk) | JavaScript | @jonathunne (recent-committer) | 2026-04-09 |
| [qvac-actions](https://github.com/tetherto/qvac-actions) | JavaScript, Dockerfile | @GSServita (recent-committer) | 2026-06-10 |
| [qvac-rnd-fabric-llm-finetune](https://github.com/tetherto/qvac-rnd-fabric-llm-finetune) | Python | @nurmanmus (recent-committer) | 2026-01-27 |
| [svc-facs-httpd](https://github.com/tetherto/svc-facs-httpd) | JavaScript | @vigan-abd (recent-committer) | 2026-05-26 |
| [svc-facs-logging](https://github.com/tetherto/svc-facs-logging) | JavaScript | @vigan-abd (recent-committer) | 2026-04-30 |
| [svc-facs-miningos-net](https://github.com/tetherto/svc-facs-miningos-net) | JavaScript | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [svc-facs-miningos-thg-write-calls](https://github.com/tetherto/svc-facs-miningos-thg-write-calls) | JavaScript | @tetherto/miningos-bk-merge (CODEOWNERS) | 2026-05-21 |
| [svc-facs-modbus](https://github.com/tetherto/svc-facs-modbus) | JavaScript | @chetasr (recent-committer) | 2026-05-06 |
| [svc-facs-mqtt](https://github.com/tetherto/svc-facs-mqtt) | JavaScript | @chetasr (recent-committer) | 2026-04-30 |
| [svc-facs-tcp](https://github.com/tetherto/svc-facs-tcp) | JavaScript | @vigan-abd (recent-committer) | 2026-04-30 |
| [tether-dev-docs](https://github.com/tetherto/tether-dev-docs) | JavaScript | @torkinos (recent-committer) | 2026-05-28 |
| [tether-svc-test-helper](https://github.com/tetherto/tether-svc-test-helper) | JavaScript | @s-badran (recent-committer) | 2026-05-05 |
| [tether-wrk-base](https://github.com/tetherto/tether-wrk-base) | JavaScript, Shell | @vigan-abd (recent-committer) | 2026-06-15 |
| [wdk](https://github.com/tetherto/wdk) | JavaScript | @AlonzoRicardo (recent-committer) | 2026-06-12 |
| [wdk-asset-registry](https://github.com/tetherto/wdk-asset-registry) | JavaScript | @sontuphan (recent-committer) | 2026-06-11 |
| [wdk-backup-cloud-react-native](https://github.com/tetherto/wdk-backup-cloud-react-native) | TypeScript, JavaScript | @jonathunne (recent-committer) | 2026-05-06 |
| [wdk-docs](https://github.com/tetherto/wdk-docs) | MDX, JavaScript, TypeScript, CSS, Nunjucks | @ihsraham (recent-committer) | 2026-06-15 |
| [wdk-examples](https://github.com/tetherto/wdk-examples) | TypeScript, Python | @ihsraham (recent-committer) | 2026-06-15 |
| [wdk-failover-provider](https://github.com/tetherto/wdk-failover-provider) | JavaScript | @jonathunne (recent-committer) | 2026-05-07 |
| [wdk-indexer-http](https://github.com/tetherto/wdk-indexer-http) | JavaScript | @gatteo (recent-committer) | 2026-01-09 |
| [wdk-mcp-toolkit](https://github.com/tetherto/wdk-mcp-toolkit) | JavaScript | @jonathunne (recent-committer) | 2026-06-10 |
| [wdk-pricing-bitfinex-http](https://github.com/tetherto/wdk-pricing-bitfinex-http) | JavaScript | @jonathunne (recent-committer) | 2026-06-09 |
| [wdk-pricing-provider](https://github.com/tetherto/wdk-pricing-provider) | JavaScript | @jonathunne (recent-committer) | 2026-06-09 |
| [wdk-protocol-bridge-usdt0-evm](https://github.com/tetherto/wdk-protocol-bridge-usdt0-evm) | JavaScript | @jonathunne (recent-committer) | 2026-05-15 |
| [wdk-protocol-fiat-moonpay](https://github.com/tetherto/wdk-protocol-fiat-moonpay) | JavaScript | @jonathunne (recent-committer) | 2026-04-18 |
| [wdk-protocol-lending-aave-evm](https://github.com/tetherto/wdk-protocol-lending-aave-evm) | JavaScript | @jonathunne (recent-committer) | 2026-04-18 |
| [wdk-protocol-swap-velora-evm](https://github.com/tetherto/wdk-protocol-swap-velora-evm) | JavaScript | @jonathunne (recent-committer) | 2026-04-16 |
| [wdk-react-native-core](https://github.com/tetherto/wdk-react-native-core) | TypeScript, JavaScript | @nulllpc (recent-committer) | 2026-06-14 |
| [wdk-react-native-provider](https://github.com/tetherto/wdk-react-native-provider) | TypeScript, JavaScript | @ndrkltsk (recent-committer) | 2026-05-29 |
| [wdk-starter-react-native](https://github.com/tetherto/wdk-starter-react-native) | TypeScript, JavaScript | @ndrkltsk (recent-committer) | 2025-12-24 |
| [wdk-uikit-react-native](https://github.com/tetherto/wdk-uikit-react-native) | TypeScript, JavaScript | @gatteo (recent-committer) | 2026-06-15 |
| [wdk-utils](https://github.com/tetherto/wdk-utils) | JavaScript | @nulllpc (recent-committer) | 2026-06-13 |
| [wdk-worklet-bundler](https://github.com/tetherto/wdk-worklet-bundler) | TypeScript, JavaScript | @jonathunne (recent-committer) | 2026-06-11 |

### Wave 3 - needs-config (4)

| Repo | Language(s) | Blocker(s) | Required config before enabling |
| --- | --- | --- | --- |
| [qvac](https://github.com/tetherto/qvac) | TypeScript, JavaScript, C++, Python, Shell, CMake, PowerShell | large-repo ~300MB (review scope); mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | set `languages:` explicitly (include `c-cpp`); switch Default->Advanced setup, or set `codeql-upload: never`; scope scan with `paths-include`/`paths-exclude` |
| [qvac-bare-addon-example](https://github.com/tetherto/qvac-bare-addon-example) | C++, JavaScript, Mermaid, CMake | mixed-c-cpp (set languages explicitly); existing-default-setup (set codeql-upload:never or switch to advanced) | set `languages:` explicitly (include `c-cpp`); switch Default->Advanced setup, or set `codeql-upload: never` |
| [qvac-football-predictor](https://github.com/tetherto/qvac-football-predictor) | JavaScript, HTML | existing-default-setup (set codeql-upload:never or switch to advanced) | switch Default->Advanced setup, or set `codeql-upload: never` |
| [qvac-rnd-fabric-llm-bitnet](https://github.com/tetherto/qvac-rnd-fabric-llm-bitnet) | Python | existing-default-setup (set codeql-upload:never or switch to advanced) | switch Default->Advanced setup, or set `codeql-upload: never` |

### Archive-candidate (2) - decide in Wave 0

| Repo | Language(s) | Last commit | Maintainer (source) |
| --- | --- | --- | --- |
| [svc-facs-dhcp-kea](https://github.com/tetherto/svc-facs-dhcp-kea) | JavaScript | 2024-01-09 | @Kumar-Kishan (recent-committer) |
| [tether-api-client-ruby](https://github.com/tetherto/tether-api-client-ruby) | Ruby | 2016-05-27 | @Aldekein (recent-committer) |

### Out-of-scope (29)

| Repo | Reason |
| --- | --- |
| [active_attr](https://github.com/tetherto/active_attr) | fork |
| [bare-crypto](https://github.com/tetherto/bare-crypto) | fork |
| [fast-text-encoding](https://github.com/tetherto/fast-text-encoding) | fork |
| [flathub](https://github.com/tetherto/flathub) | fork |
| [lib-pear-pass](https://github.com/tetherto/lib-pear-pass) | fork |
| [miningos-wrk-minerpool-luxor](https://github.com/tetherto/miningos-wrk-minerpool-luxor) | already archived |
| [omnicore](https://github.com/tetherto/omnicore) | fork |
| [oss-actions](https://github.com/tetherto/oss-actions) | no code detected yet (empty/placeholder repo) |
| [pub](https://github.com/tetherto/pub) | no code detected yet (empty/placeholder repo) |
| [qvac-examples](https://github.com/tetherto/qvac-examples) | no code detected yet (empty/placeholder repo) |
| [qvac-ext-bergamot-translator](https://github.com/tetherto/qvac-ext-bergamot-translator) | fork |
| [qvac-ext-ggml](https://github.com/tetherto/qvac-ext-ggml) | fork |
| [qvac-ext-lib-whisper.cpp](https://github.com/tetherto/qvac-ext-lib-whisper.cpp) | fork |
| [qvac-ext-marian-dev](https://github.com/tetherto/qvac-ext-marian-dev) | fork |
| [qvac-ext-stable-diffusion.cpp](https://github.com/tetherto/qvac-ext-stable-diffusion.cpp) | fork |
| [qvac-fabric-llm.cpp](https://github.com/tetherto/qvac-fabric-llm.cpp) | fork |
| [qvac-registry-vcpkg](https://github.com/tetherto/qvac-registry-vcpkg) | no CodeQL-supported language (dominant: CMake) |
| [Tether-Near](https://github.com/tetherto/Tether-Near) | fork |
| [tether-wallet-app-releases](https://github.com/tetherto/tether-wallet-app-releases) | no code detected yet (empty/placeholder repo) |
| [tmp-test-0](https://github.com/tetherto/tmp-test-0) | no code detected yet (empty/placeholder repo) |
| [wdk-agent-skills](https://github.com/tetherto/wdk-agent-skills) | no code detected yet (empty/placeholder repo) |
| [wdk-backup-cloud](https://github.com/tetherto/wdk-backup-cloud) | no code detected yet (empty/placeholder repo) |
| [wdk-backup-remote](https://github.com/tetherto/wdk-backup-remote) | no code detected yet (empty/placeholder repo) |
| [wdk-cli](https://github.com/tetherto/wdk-cli) | no code detected yet (empty/placeholder repo) |
| [wdk-pricing-coingecko-http](https://github.com/tetherto/wdk-pricing-coingecko-http) | no code detected yet (empty/placeholder repo) |
| [wdk-safe-core-sdk](https://github.com/tetherto/wdk-safe-core-sdk) | fork |
| [wdk-safe-protocol-kit](https://github.com/tetherto/wdk-safe-protocol-kit) | no code detected yet (empty/placeholder repo) |
| [wdk-safe-relay-kit](https://github.com/tetherto/wdk-safe-relay-kit) | no code detected yet (empty/placeholder repo) |
| [wdk-signer-local](https://github.com/tetherto/wdk-signer-local) | no code detected yet (empty/placeholder repo) |

## Escalation path (critical finding on a public repo)

1. The scheduled run fails the severity gate (`high`/`critical` -> `error`) and uploads SARIF to the repo **Security** tab.
2. The repo's `CODEOWNERS` (the weekly triage owner) are notified and a tracking issue labelled `security` is opened.
3. A critical finding on a **public** repo is a potential public exposure: escalate immediately to DevOps + Olu (TL). SLA: triage within **24h (critical)** / **48h (high)**; remediate or apply a documented mitigation.
4. Temporarily making a repo private or taking down content is the last-resort escalation and is decided by Olu + repo owner; it is outside this plan.

## Triage ownership & review

- **Weekly triage owner:** repo `CODEOWNERS` triage their own repo's findings. Repos without `CODEOWNERS` (see inventory `maintainer (source) = unknown/recent-committer`) are owned by the DevOps team until owners are assigned - a Wave 0 task.
- **Escalation backstop:** DevOps team.
- **Reviewer / approver:** Olu (TL).

## From plan to execution tickets

- One ticket per repo (or per wave batch) that adds `weekly-codescan.yml`; the repo list comes straight from the wave tables above.
- `needs-config` tickets include the "Required config" cell as their definition of done.
- `archive-candidate` tickets are archive-or-keep decisions, not scan-enablement.
- No rediscovery is required: every in-scope repo already carries its language, maintainer, last-commit, CodeQL status, and blocker in the inventory.

## Acceptance criteria mapping

- Inventory lists every public org repo with the captured fields -> [public-repo-inventory.md](public-repo-inventory.md).
- Rollout plan defines waves with target start dates within Q3 (Jul 1 - Sep 30) -> wave plan above.
- Reviewed by Olu (TL); weekly triage owner named (per-repo CODEOWNERS + DevOps backstop).
- Q3 execution tickets can be carved off the wave plan without redoing discovery.

