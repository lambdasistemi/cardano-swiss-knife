# Plan — csk#129

## The choice: fix the CLI, not the workflows

The issue offers two routes. They are not equally good, and the baseline
measurement in `spec.md` decides between them.

**Route A — install/build the dependencies before the check in each job.**
For the ubuntu publish job that means adding `npm ci`. For the Pages job it
means compiling the entire PureScript tree *before* the cheapest, fastest
guard in the pipeline — inverting the point of a pre-flight check, spending
several minutes of a self-hosted runner before learning the tag is wrong, and
paying that cost in two places that must then be kept in sync forever. It also
leaves the underlying trap armed: the next runtime import added to the CLI
breaks a *third* consumer nobody thought to install dependencies for.

**Route B — make `csk --version` resolvable on its own.** The version lives in
`node/src/version.js`, which reads `package.json` and imports nothing else.
Printing it genuinely requires none of the machinery the CLI currently loads
before it can even look at `process.argv`. JavaScript module imports are
resolved before the first line of the program runs, so today the tool loads the
age-encryption vault stack and the compiled PureScript command modules purely to
answer "what version are you?".

Route B is chosen. It fixes both environments with one change, requires no
workflow edit at all (so FR-5's ordering guard and the Nix-shaped jobs are
untouched by construction), makes `csk --version` fast for every user, and is
the only route that removes the trap rather than working around it.

The measurement backs this: in a pristine tree the checker reports exactly two
failures, both the CLI probe. Every other assertion already passes. Fixing the
probe fixes the whole check.

## What changes

`cli/csk.mjs` defers its heavy imports so that module load requires only
`node/src/version.js` (which reads `package.json`) and Node built-ins. The
version branch answers and exits; every other branch loads what it needs at the
moment it needs it.

The implementation shape inside `cli/` is the pair's call, provided:

- `cli/csk.mjs` stays the entrypoint (`nix/purescript.nix:183` bundles it; the
  published `bin.csk` is the resulting `node/dist/csk.mjs`);
- any new file lives under `cli/` (already copied wholesale by the Nix build)
  and needs no `package.json` `files` change, since only `node/dist` ships;
- `scripts/check-release-version.mjs`'s source-level assertions still hold —
  `cli/csk.mjs` must still visibly mention `--version`, `-V`, and `version.js`.

**Nothing about the checker's assertions changes.** `--help`, error handling,
exit codes, and JSON envelopes keep their current behaviour.

## Risk register

| Risk | How the gate catches it |
| --- | --- |
| A deferred import breaks a command path | `nix run .#ci-node-api` (offline + tx commands, source and bundled) |
| Vault flows break — the age-encryption path is the one that failed | `nix run .#ci-vault-cli` |
| esbuild bundling changes shape and the packaged CLI regresses | `ci-node-api` runs against the built package; `just release-package` checks the tarball contract |
| The check is weakened into a no-op | Negative control in the new test: wrong tag must still fail *in the pristine tree* |
| Workflow ordering guard violated | `just release-workflows` (no workflow file is edited, so this is a guard, not a target) |

## Regression coverage

Added to `node/test/version.test.mjs`, the file that already owns the version
contract. The test builds a pristine tree the same way the baseline measurement
did — copy the files `git ls-files` reports into a temp directory, giving a tree
with no `node_modules` and no `output/` — then asserts three things:

1. `csk --version` and `csk -V` from that tree exit 0 and print the version
   (FR-1);
2. the checker exits 0 there with the correct tag (FR-2);
3. **the checker exits non-zero there with a wrong tag** (FR-3) — the negative
   control that proves the check can still fail in the environment we just made
   it pass in.

Point 3 is not optional. Without it, a future change that makes the checker skip
work when inputs are missing would turn this test green while making the release
gate meaningless.

The test copies from the working tree (not `HEAD`), so it measures the code
under review rather than the last commit.

## Slices

One implementation slice; one commit.

**Slice A — pristine-checkout CLI version probe.** RED: the new pristine test in
`node/test/version.test.mjs` fails against the current `cli/csk.mjs`. GREEN:
`cli/csk.mjs` defers its heavy imports. One bisect-safe commit.

Owned files: `cli/csk.mjs`, `node/test/version.test.mjs`, and any new file
under `cli/`.

Forbidden: `.github/workflows/**`, `scripts/**`, `specs/**`, `gate.sh`,
`package.json`, `package-lock.json`, `nix/**`, `justfile`.

## Orchestrator-owned follow-through (not slices)

- Merge the PR once green.
- Drive the release-please PR for 0.1.3 to merge.
- Verify the full publish chain at tag `v0.1.3`: npm registry, release assets,
  Pages deploy (SC-4).
- Add the pointer note to the v0.1.2 release page (SC-5).

## Docs

No user-facing behaviour changes, so no docs page changes. The reasoning that
matters to a future maintainer — why the CLI defers its imports — belongs in a
comment at the deferral site, not in a docs page.
