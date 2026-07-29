# Spec — csk#129: publish-on-tag jobs fail at `check-release-version`

Issue: https://github.com/lambdasistemi/cardano-swiss-knife/issues/129
Milestone: M1 — mainnet-review UX & interop hardening

## Problem in one paragraph

Cutting a release tag is supposed to publish three things: the npm package, the
release bundle attached to the GitHub release, and the documentation site. For
`v0.1.2` it published none of them. Both publish jobs check out the release tag
into a directory that contains only the files git tracks — no installed npm
dependencies, no compiled PureScript — and the very first thing they do is run
the release-version checker, which starts the `csk` command-line tool to read
back the version it prints. Starting `csk` requires the whole program to load,
and the program cannot load without those missing pieces, so the check dies
before it has checked anything. Everything downstream is skipped. The tag and
the release page exist; they are empty.

## P1 user story

**As the maintainer cutting a release**, when release-please merges the release
PR and the tag is created, I want the publish pipeline to run to completion, so
that the npm package, the release assets, and the docs site all land without
manual intervention.

## Supporting user stories

- **As a reviewer of a future PR** that adds a new runtime dependency to the
  command-line tool, I want the test suite to fail if that dependency makes
  `csk --version` unable to start from a bare checkout, so the release pipeline
  cannot silently break again between releases.
- **As a reader of the v0.1.2 release page**, I want to be told where to find
  the artifacts, since that release will remain permanently empty.

## Functional requirements

- **FR-1** — `csk --version` and `csk -V` must print the version and exit 0 from
  a checkout that contains only git-tracked files: no `node_modules`, no
  `output/` (compiled PureScript) tree.
- **FR-2** — `scripts/check-release-version.mjs --tag v<version>` must exit 0 in
  that same pristine checkout.
- **FR-3** — The check must keep its teeth. In the pristine environment it must
  still exit non-zero for a tag that does not equal `v<package.json version>`.
  No branch of the checker may become a silent no-op because inputs are absent.
- **FR-4** — Every other CLI behaviour is unchanged: offline commands
  (`address`, `mnemonic`, `key`, `script`, `payload`), transaction commands
  (`tx …`), vault commands (`vault create|list|migrate|credential add`), the
  `--help` text, exit codes, and JSON error envelopes — from both the source
  entrypoint and the packaged, bundled build.
- **FR-5** — The ordering guard at `scripts/check-release-workflows.mjs:695`
  (version check runs before any external publish/upload step) must still hold,
  and both publish jobs must stay Nix-shaped where they already are: no
  conversion of a `nix run`/`nix build` job into an npm-driven job.
- **FR-6** — Regression coverage exercises FR-1/FR-2/FR-3 in a genuinely
  pristine tree constructed from git-tracked files only, so a future top-level
  runtime import in the CLI reintroduces a red test rather than a red release.

## Out of scope

- Retagging, moving, or deleting `v0.1.2` — forbidden.
- Any change to `ci.yml` or to workflows unrelated to publication.
- Any change to what the checker asserts (its assertions are correct; only the
  environment it can run in is wrong).

## Success criteria

- **SC-1** — In a tree built from `git ls-files` alone, `node
  scripts/check-release-version.mjs --repo-root <tree> --tag v<version>` exits 0.
- **SC-2** — In that same tree, the same command with a wrong tag exits non-zero.
  (Negative control: proves the check can still fail there.)
- **SC-3** — `./gate.sh` green: CLI/Node API suites, vault CLI suite, version
  contract, package contract, workflow-structure guard.
- **SC-4** — The next release (0.1.3) publishes fully green: `Release / publish`
  with the npm tarball on the registry and `*.tgz` + `SHA256SUMS` attached to
  the release; `Pages / build` + `deploy` green with the live site showing the
  new version.
- **SC-5** — The v0.1.2 release page carries a note pointing to 0.1.3 for
  artifacts.

SC-4 is the contractual proof of this ticket. A locally-simulated pristine run
proves the mechanism; only a green publish at a real tag closes the issue.

## Baseline evidence (measured 2026-07-29, at `9ed254b`)

Tree built from `git ls-files` into a temp dir, then:

```
node <tree>/scripts/check-release-version.mjs --repo-root <tree> --tag v0.1.2
→ exit 1
```

The complete set of reported failures, with all stack-trace lines removed:

```
csk --version failed: … Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'age-encryption'
                        imported from <tree>/lib/src/Cardano/Vault.js
csk -V failed:        … (same)
```

Two failures, both the CLI probe; every other assertion in the checker already
passes in a pristine tree. This is the measurement that makes the CLI probe the
whole problem, and it is why no workflow edit is required.
