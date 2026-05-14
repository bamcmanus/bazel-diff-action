# bazel-diff-action — Product Requirements Document

## Overview

A public, reusable GitHub Action that wraps the
[Tinder/bazel-diff](https://github.com/Tinder/bazel-diff) tool to compute
impacted Bazel targets between two Git revisions. The action handles downloading
bazel-diff, orchestrating the hash generation and comparison, and exposing the
results as structured outputs for downstream consumption.

The action does **not** execute builds or tests — it is purely an analysis tool.
Consumers decide what to do with the impacted target list.

## Goals

- Provide a simple, well-documented interface for computing impacted Bazel
  targets in GitHub Actions workflows.
- Minimize consumer configuration — auto-detect base refs for PR workflows,
  bundle sensible defaults.
- Output results in a format that is easy to consume in subsequent workflow
  steps (both as an output variable and a file).
- Handle large monorepos gracefully (file-based output to avoid shell variable
  limits).

## Non-Goals

- Running `bazel build` or `bazel test` on impacted targets.
- Managing Bazel installation (consumers are expected to have Bazel available).
- Caching bazel-diff between workflow runs.
- Supporting non-GitHub CI systems.

## Technical Approach

- **Action type:** JavaScript (Node 24), bundled with `@vercel/ncc`.
- **bazel-diff integration:** Download the deploy JAR from GitHub Releases at
  runtime and invoke via `java -jar` using `@actions/exec`.
- **Git orchestration:** Check out base ref, generate hashes, check out head
  ref, generate hashes, compute diff, restore original ref.

## Dependencies

### Runtime (on the GitHub Actions runner)

- **Java 8+** — required to run the bazel-diff JAR. Pre-installed on
  `ubuntu-latest`.
- **Bazel 3.3+** — required for hash generation. Consumer must ensure it is
  available.
- **Git** — required for ref checkout. Always available on GitHub Actions
  runners.

### NPM packages

- `@actions/core` — inputs, outputs, logging, failure handling.
- `@actions/exec` — shelling out to `java`, `git`.
- `@actions/tool-cache` — downloading the bazel-diff JAR.
- `@actions/io` — filesystem utilities.

### Dev dependencies

- `@vercel/ncc` — bundles source + node_modules into `dist/index.js`.
- `jest` or `vitest` — unit testing.

## Inputs

| Input                      | Required | Default     | Description                                                                   |
| -------------------------- | -------- | ----------- | ----------------------------------------------------------------------------- |
| `base-ref`                 | no       | auto-detect | Git ref to compare against. Auto-detected from PR event or `HEAD~1` for push. |
| `head-ref`                 | no       | `HEAD`      | Git ref representing the current changes.                                     |
| `workspace-path`           | no       | `.`         | Path to the directory containing the Bazel WORKSPACE or MODULE.bazel file.    |
| `bazel-path`               | no       | `bazel`     | Path to the Bazel binary.                                                     |
| `bazel-diff-version`       | no       | `latest`    | Version of bazel-diff to download (e.g. `7.0.0`).                             |
| `target-type`              | no       | ``          | Comma-separated target types to filter (e.g. `java_library,go_test`).         |
| `use-cquery`               | no       | `false`     | Use cquery instead of query (requires Bazel 6.2+).                            |
| `exclude-external-targets` | no       | `true`      | Exclude targets from external repositories.                                   |
| `include-distance`         | no       | `false`     | Include target/package distance metrics in output (JSON format).              |
| `bazel-startup-options`    | no       | ``          | Additional Bazel startup options.                                             |
| `bazel-command-options`    | no       | ``          | Additional Bazel query command options.                                       |

## Outputs

| Output                  | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `impacted-targets`      | Newline-separated list of impacted Bazel targets.        |
| `impacted-targets-file` | Absolute path to a file containing the impacted targets. |
| `has-changes`           | `true` if any targets were impacted, `false` otherwise.  |
| `target-count`          | Number of impacted targets.                              |

## Consumer Prerequisites

Consumers must configure their workflow with:

1. **Full git history** — `actions/checkout` with `fetch-depth: 0` so that base
   ref checkout works.
2. **Bazel installed** — via `bazelbuild/setup-bazelisk` or equivalent.
3. **Java available** — pre-installed on `ubuntu-latest`; self-hosted runners
   may need `actions/setup-java`.

## Example Usage

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

      - uses: bamcmanus/bazel-diff@v1
        id: diff

      - name: Test impacted targets
        if: steps.diff.outputs.has-changes == 'true'
        run: bazel test $(cat ${{ steps.diff.outputs.impacted-targets-file }})
```

### Filtered — only test targets

```yaml
- uses: bamcmanus/bazel-diff@v1
  id: diff
  with:
    target-type: "*_test"
    use-cquery: true
```

### With distance metrics

```yaml
- uses: bamcmanus/bazel-diff@v1
  id: diff
  with:
    include-distance: true

- name: Show impact report
  run: cat ${{ steps.diff.outputs.impacted-targets-file }}
  # Output is JSON with label, targetDistance, packageDistance
```

## Error Handling

- If bazel-diff download fails (bad version, network error), the action calls
  `core.setFailed()` with a descriptive message.
- If hash generation fails (Bazel not found, workspace invalid), the error is
  surfaced with the underlying stderr.
- On any failure, the action restores the original git ref in a `finally` block
  so the workspace is not left on a detached HEAD.

## Future Considerations

- PR comment summarizing impacted targets via `@actions/github`.
- Job summary integration via `core.summary`.
- Support for `modified-filepaths` input to seed hashing.
- Support for `seed-filepaths` input.
