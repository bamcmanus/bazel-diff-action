# bazel-diff-action — Progress & Checkpoints

## Checkpoint 1: Project Scaffolding

- [x] Initialize npm project (`package.json`)
- [x] Install runtime dependencies (`@actions/core`, `@actions/exec`,
      `@actions/tool-cache`, `@actions/io`)
- [x] Install dev dependencies (`@vercel/ncc`, test framework)
- [x] Create `action.yml` with all inputs/outputs defined
- [x] Set up `.gitignore` (ignore `node_modules/`, keep `dist/`)
- [x] Create `src/index.js` entrypoint (empty shell with try/catch structure)

**Done when:** `npm install` succeeds, `action.yml` is valid, and `ncc build`
produces `dist/index.js`.

---

## Checkpoint 2: bazel-diff Download & Validation

- [x] Implement function to resolve the download URL from version input (handle
      `latest` vs specific version)
- [x] Download the JAR using `@actions/tool-cache`
- [x] Verify Java is available on the runner (check `java -version`)
- [x] Surface clear errors if Java is missing or download fails

**Done when:** Given a version input, the action downloads the correct JAR and
confirms it can execute.

---

## Checkpoint 3: Git Ref Resolution & Management

- [x] Implement auto-detection of base ref:
  - PR events: read `pull_request.base.sha` from `GITHUB_EVENT_PATH`
  - Push events: use `before` SHA or fall back to `HEAD~1`
- [x] Accept explicit `base-ref` override from input
- [x] Implement ref save/restore logic (save current HEAD, restore in `finally`)
- [x] Handle edge cases: shallow clones (detect and fail with helpful message),
      detached HEAD

**Done when:** The action can determine the correct base and head refs for PR
and push events, and reliably restores the workspace to its original state.

---

## Checkpoint 4: Hash Generation

- [ ] Build argument array for `generate-hashes` from action inputs
- [ ] Implement helper function to construct args (workspace path, bazel path,
      flags, output path)
- [ ] Execute `generate-hashes` at base ref
- [ ] Execute `generate-hashes` at head ref
- [ ] Optionally generate dependency edges file when `include-distance` is true
- [ ] Handle and surface errors from hash generation (Bazel failures, workspace
      issues)

**Done when:** The action produces two valid hash JSON files (starting and
final) from two different git refs.

---

## Checkpoint 5: Impacted Target Computation & Output

- [ ] Execute `get-impacted-targets` with the two hash files
- [ ] Pass through optional flags (target-type, exclude-external, dep-edges)
- [ ] Write results to a temp file
- [ ] Parse the output (newline-separated list or JSON depending on
      `include-distance`)
- [ ] Set all action outputs:
  - `impacted-targets` (string)
  - `impacted-targets-file` (path)
  - `has-changes` (boolean string)
  - `target-count` (number string)

**Done when:** All outputs are correctly set and accessible to subsequent
workflow steps.

---

## Checkpoint 6: Error Handling & Cleanup

- [ ] Wrap full flow in try/catch/finally
- [ ] Restore original git ref in `finally` (even on failure)
- [ ] Call `core.setFailed()` with actionable error messages
- [ ] Clean up temp files on failure
- [ ] Add debug logging (`core.debug()`) for troubleshooting

**Done when:** The action fails gracefully with clear messages and never leaves
the workspace in a broken state.

---

## Checkpoint 7: Build, CI & Documentation

- [ ] Run `ncc build` and commit `dist/index.js`
- [ ] Create `.github/workflows/ci.yml`:
  - Lint/format check
  - Run unit tests
  - Verify `dist/` is up to date (`ncc build && git diff --exit-code dist/`)
- [ ] Write `README.md` (description, inputs, outputs, examples, prerequisites)
- [ ] Add `LICENSE` (MIT)

**Done when:** CI passes, README is complete, action is ready for tagging.

---

## Checkpoint 8: Release

- [ ] Tag `v1.0.0`
- [ ] Create mutable `v1` tag (for `@v1` consumption)
- [ ] Test in a real workflow against a Bazel repository
- [ ] Publish to GitHub Marketplace (optional)

**Done when:** A consumer can use `bamcmanus/bazel-diff@v1` in their workflow
and get impacted targets.
