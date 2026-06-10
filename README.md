# qvac-devops

Central operational repository: reusable GitHub Actions workflows and
composite actions shared across the `tetherto` / `qvac` orgs.

## Reusable workflows

- **Canonical security baseline** (TruffleHog + CodeQL) —
  see [`docs/security-baseline.md`](docs/security-baseline.md).

  ```yaml
  uses: tetherto/qvac-devops/.github/workflows/public-reusable-security.yml@main
  ```

Other reusable workflows and composite actions live in
[`.github/workflows/`](.github/workflows) and
[`.github/actions/`](.github/actions).
