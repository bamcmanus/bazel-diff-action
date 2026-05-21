# bazel-diff-action

[![CI](https://github.com/bamcmanus/bazel-diff-action/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/bamcmanus/bazel-diff-action/actions/workflows/ci.yaml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/bamcmanus/bazel-diff-action/badge)](https://securityscorecards.dev/viewer/?uri=github.com/bamcmanus/bazel-diff-action)
[![Renovate enabled](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)

A GitHub Action that computes impacted Bazel targets between two Git revisions
using [bazel-diff](https://github.com/Tinder/bazel-diff) by
[Tinder](https://github.com/Tinder).

This action handles downloading bazel-diff, generating target hashes at two
revisions, and computing the diff. It outputs the list of impacted targets for
use in subsequent workflow steps. It does **not** run builds or tests — you
decide what to do with the results.

## Prerequisites

Your workflow must provide:

- **Full git history** — use `actions/checkout` with `fetch-depth: 0`
- **Bazel** — install via
  [bazelbuild/setup-bazelisk](https://github.com/bazelbuild/setup-bazelisk) or
  equivalent
- **Java 8+** — pre-installed on `ubuntu-latest`; self-hosted runners may need
  [actions/setup-java](https://github.com/actions/setup-java)

## Usage

### Basic — test only changed targets

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: bazelbuild/setup-bazelisk@v3

      - uses: bamcmanus/bazel-diff-action@v1
        id: diff

      - name: Test impacted targets
        if: steps.diff.outputs.has-changes == 'true'
        run: bazel test $(cat ${{ steps.diff.outputs.impacted-targets-file }})
```

### Filter to specific target types

```yaml
- uses: bamcmanus/bazel-diff-action@v1
  id: diff
  with:
    target-type: "*_test"
    use-cquery: true
```

### With distance metrics

```yaml
- uses: bamcmanus/bazel-diff-action@v1
  id: diff
  with:
    include-distance: true

- name: Show impact report
  if: steps.diff.outputs.has-changes == 'true'
  run: cat ${{ steps.diff.outputs.impacted-targets-file }}
  # Output is JSON with label, targetDistance, packageDistance
```

### Explicit base ref

```yaml
- uses: bamcmanus/bazel-diff-action@v1
  id: diff
  with:
    base-ref: main
```

## Inputs

| Input                      | Default     | Description                                                                                             |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `base-ref`                 | auto-detect | Git ref to compare against. Auto-detected from PR, push, or merge_group events. Falls back to `HEAD~1`. |
| `head-ref`                 | `HEAD`      | Git ref representing the current changes.                                                               |
| `workspace-path`           | `.`         | Path to the directory containing the Bazel WORKSPACE or MODULE.bazel file.                              |
| `bazel-path`               | `bazel`     | Path to the Bazel binary.                                                                               |
| `bazel-diff-version`       | `latest`    | Version of bazel-diff to download (e.g. `22.0.0`).                                                      |
| `target-type`              |             | Comma-separated target types to filter (e.g. `java_library,go_test`).                                   |
| `use-cquery`               | `false`     | Use cquery instead of query. Requires Bazel 6.2+.                                                       |
| `exclude-external-targets` | `true`      | Exclude targets from external repositories.                                                             |
| `include-distance`         | `false`     | Include target/package distance metrics in output (JSON format).                                        |
| `bazel-startup-options`    |             | Additional Bazel startup options.                                                                       |
| `bazel-command-options`    |             | Additional Bazel query command options.                                                                 |

All inputs are optional.

## Outputs

| Output                  | Description                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `impacted-targets`      | Newline-separated list of impacted Bazel targets (or JSON when `include-distance` is true).                        |
| `impacted-targets-file` | Absolute path to a file containing the impacted targets. Preferred for large repos to avoid shell variable limits. |
| `has-changes`           | `true` if any targets were impacted, `false` otherwise.                                                            |
| `target-count`          | Number of impacted targets.                                                                                        |

## How it works

1. Downloads the [bazel-diff](https://github.com/Tinder/bazel-diff) JAR from
   GitHub Releases
2. Generates target hashes at the current (head) revision
3. Checks out the base revision and generates target hashes there
4. Computes the diff between the two hash sets to find impacted targets
5. Restores the original git ref

For details on how bazel-diff computes target hashes and determines impacted
targets, see the
[bazel-diff documentation](https://github.com/Tinder/bazel-diff#readme).

## Supported events

Base ref auto-detection works with:

- `pull_request` — uses the PR base SHA
- `push` — uses the before SHA
- `merge_group` — uses the merge group base SHA

For other event types (e.g. `workflow_dispatch`), provide `base-ref` explicitly
or the action will fall back to `HEAD~1`.

## Security

All releases include a [SLSA provenance attestation](https://slsa.dev) that can
be used to verify the `dist/index.js` artifact was built from this source. See
[SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

MIT

## Credits

This action is a wrapper around
[bazel-diff](https://github.com/Tinder/bazel-diff), created and maintained by
[Tinder](https://github.com/Tinder). All target diffing logic is theirs — this
action provides the GitHub Actions integration layer.
