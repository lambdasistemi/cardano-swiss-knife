# Tasks — csk#134

## Slice A — publish argument is a path, and a guard that proves it

Commit subject: `fix: publish the built npm tarball by path, not repo shorthand`
Trailer: `Tasks: T134`

- [X] T134 RED — in `node/test/release-workflows.test.mjs`, seed a workflow
      document whose publish step carries the old bare argument
      (`npm publish --access public --provenance node-package/*.tgz`) and assert
      the checker rejects it, naming the publish argument in its message. Watch
      it fail against the current checker before writing the guard.
- [X] T134 GREEN — add the path-shaped-argument guard to
      `scripts/check-release-workflows.mjs` (assert positively that the argument
      is path-shaped; do not blacklist the single bad form), and fix
      `.github/workflows/release.yml` so the publish argument is path-shaped.
- [X] T134 PROOF — `./gate.sh` green, and the seeded control observed red before
      the guard and green after.

## Optional within this slice (desirable, not contractual)

- [X] T134 REHEARSAL — if it stays a small addition to the existing
      `node-package-artifact` job in `ci.yml`, add an `npm publish --dry-run`
      against the built tarball. Drop it and log the reason in `WIP.md` if it
      grows beyond that.

## Orchestrator-owned (no slice, no code)

- [ ] T134-O1 finalization audit, drop `gate.sh`, mark ready, merge.
- [ ] T134-O2 park on the 0.1.4 release-please PR — **do not merge** until the
      desk announces `NPM_TOKEN` exists; verify `secrets.NPM_TOKEN` resolves
      before merging.
- [ ] T134-O3 after a green publish, verify npm registry + release assets, then
      add the pointer note to **both** the v0.1.2 and v0.1.3 release pages.
