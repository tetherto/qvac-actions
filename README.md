# qvac-devops

Central operational repository: reusable GitHub Actions workflows and
composite actions shared across the `tetherto` / `qvac` orgs.

## Reusable workflows

- **Canonical security baseline** (TruffleHog + CodeQL) —
  see [`docs/security-baseline.md`](docs/security-baseline.md).

  ```yaml
  uses: tetherto/qvac-devops/.github/workflows/public-reusable-security.yml@main
  ```

## Design docs

- **License / compliance CI gate** (Q2 design; Q3 implementation) —
  see [`docs/license-compliance-ci.md`](docs/license-compliance-ci.md).

Other reusable workflows and composite actions live in
[`.github/workflows/`](.github/workflows) and
[`.github/actions/`](.github/actions).
