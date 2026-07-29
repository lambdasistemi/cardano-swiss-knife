# Tasks — csk#129

## Slice A — pristine-checkout CLI version probe (driver + navigator)

Commit subject: `fix: resolve csk --version without installed or built deps`
Trailer: `Tasks: T129`

- [ ] T129 RED — add pristine-checkout coverage to `node/test/version.test.mjs`:
      build a temp tree from `git ls-files` (working tree, not HEAD), assert
      `csk --version` / `csk -V` exit 0 and print the version there, assert the
      checker exits 0 there with the correct tag, and assert it exits non-zero
      there with a wrong tag (negative control). Watch it fail with
      `ERR_MODULE_NOT_FOUND` before writing any fix.
- [ ] T129 GREEN — defer the heavy imports in `cli/csk.mjs` so module load needs
      only `node/src/version.js` and Node built-ins; every other command path
      loads what it needs at the point of use. Keep `--version`, `-V`, and
      `version.js` textually present in `cli/csk.mjs` (the checker's
      source-level assertions read for them).
- [ ] T129 PROOF — `./gate.sh` green end to end.

## Orchestrator-owned (no slice, no code)

- [ ] T129-O1 finalization audit, drop `gate.sh`, mark ready, merge.
- [ ] T129-O2 drive the 0.1.3 release-please PR to merge.
- [ ] T129-O3 verify the publish chain at `v0.1.3`: npm registry entry, release
      assets (`*.tgz` + `SHA256SUMS`), Pages deploy showing the new version.
- [ ] T129-O4 note on the v0.1.2 release page pointing to 0.1.3 for artifacts.
