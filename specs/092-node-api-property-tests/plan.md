# Implementation Plan: Node API Property Tests as Executable Documentation

**Branch**: `feat/92-node-api-property-tests` | **Date**: 2026-07-21 | **Spec**: [spec.md](spec.md)

## Summary

Pin `fast-check` and build one canonical installed-package property suite at
`node/test/api-properties.test.mjs`, extended across three slices to cover the
complete current Node API. Properties use committed vectors/fixtures as valid
semantic seeds, generate legal representation and input variations, assert
exact envelopes/taxonomies, and invoke the real Nix-pinned engines. The only
mock boundary is provider HTTP. Slice 1 wires the canonical file into
`ci-node-api`; later slices extend it without changing the gate path.

## Technical context

**Language/Version**: ESM JavaScript on Node 22

**Primary dependencies**: `fast-check`, Node built-in test/assert/fs/process
modules, existing committed vectors and transaction fixtures, Nix-pinned
cardano-addresses WASI, ledger-inspector WASI, and RDF-shapes WASM artifacts

**Testing**: foreign-CWD npm tarball installation, Node test runner,
`nix run .#ci-node-api`, architecture boundary check, and `./gate.sh`

**Constraints**: no `node/src/` edits without parent Q-file; no host semantic
fallback; keep existing example tests; deterministic/reproducible shrinking;
no secret-bearing diagnostics; #77 absent and explicitly documented

## Current state and seams

- `package.json` / `package-lock.json` have no property-testing library.
- `nix/checks/node-api.nix` installs the packed package into foreign temporary
  projects and explicitly lists every Node test file.
- The public package root currently exposes 25 names: `CskError` plus 24
  operations from `node/src/index.js`.
- Existing examples already provide valid address/key/script/signing,
  transaction, provider, book, ledger, and witness fixtures. Properties must
  compose and vary these contracts rather than duplicate engine semantics.
- csk-93 concurrently owns JSDoc and declaration work in `node/src/`; this plan
  stays in tests, dependency metadata, Nix test wiring, and README prose.

## Property harness contract

Slice 1 creates `node/test/property-support.mjs` for all slices. It provides a
foreign-project lifecycle, offline tarball installation, a helper to run ESM
programs against the installed package, fixture loading, reproducible
fast-check parameters, and common result-envelope assertions. It must not
encode Cardano/ledger/RDF semantics.

Properties use `fc.assert` / `fc.asyncProperty`; expensive real-engine
properties use an explicit run count sufficient to cover their declared
constant matrices, while lightweight input properties use broader generated
runs. Contract comments name valid arbitrary domains, invariants, and expected
error codes. Static inventory maps every current export to one contract group
so coverage cannot silently drift.

## Slice plan

### Slice 1 — Offline API contracts and reusable harness

Add `fast-check`, the reusable installed-package harness, and RED→GREEN
properties for `CskError` plus all 14 offline address/mnemonic/key/payload/script
operations. Cover supported/generated inputs, composition/round trips,
determinism, malformed input taxonomy, applicable engine failures, secret-free
errors, and exact result-envelope shape. Wire the file into `ci-node-api`.

**Owned files**:

- `package.json`
- `package-lock.json`
- `node/test/property-support.mjs`
- `node/test/api-properties.test.mjs`
- `nix/checks/node-api.nix`

**Forbidden scope**: every `node/src/**` file, existing example tests/fixtures,
README/docs, flake inputs, engine pins, and host semantic implementations

**Focused proof**: `nix run .#ci-node-api && ./gate.sh`

**Commit**: `test(node): specify offline API properties`

### Slice 2 — Transaction, provider, and book contracts

Extend the canonical file with RED→GREEN properties for `inspectTransaction`,
`browseTransaction`, `identifyTransaction`, and `transactionIntent`. Vary
raw/TextEnvelope forms, browse paths, malformed/exclusive sources, every
provider/network combination, redacted provider failures, context
completeness, ordered books, RDF resolutions, and ledger/RDF engine
failure/protocol behavior. Use the shared harness without changing production
source or the already-wired gate path.

**Owned files**:

- `node/test/api-properties.test.mjs`

**Forbidden scope**: `node/test/property-support.mjs`, dependency manifests,
every `node/src/**` file, existing example tests/fixtures, README/docs, and
host-side provider/ledger/RDF implementations

**Focused proof**: `nix run .#ci-node-api && ./gate.sh`

**Commit**: `test(node): specify transaction API properties`

### Slice 3 — Witness and ledger truth contracts

Extend the canonical file with RED→GREEN properties for
`prepareTransactionWitness`,
`normaliseTransactionWitness`, `attachTransactionWitness`,
`planTransactionWitnesses`, `validateTransaction`, and
`evaluateTransactionScripts`. Vary witness/transaction representations and
safe options around committed fixtures; assert byte/body identity, signer
transitions, non-target preservation, exact validation/redeemer truth states,
typed malformed/engine/protocol failures, and secret absence. Add a README
pointer to the canonical file; the gate continues using the Slice 1 path.

**Owned files**:

- `node/test/api-properties.test.mjs`
- `README.md`

**Forbidden scope**: `node/test/property-support.mjs`, dependency manifests,
every `node/src/**` file, existing example tests/fixtures, flake inputs/pins,
and host-side CBOR/ledger/crypto/Plutus implementations

**Focused proof**: `nix run .#ci-node-api && ./gate.sh`

**Commit**: `test(node): specify witness and ledger properties`

## Orchestrator-owned finalization

After all three behavior commits are navigator-approved, amend the matching
task checkboxes into each slice commit, independently rerun `./gate.sh`, audit
the complete 25-export inventory and commit messages, update PR #95 with exact
proof and the #77 follow-up gap, and push. Wait for fresh remote CI on the
implementation SHA; after it is green, drop `gate.sh`, mark the PR ready, and
wait for remote CI on the final sentinel SHA before reporting `COMPLETE`.

## Dependency and ordering constraints

1. Slice 1 pins the dependency and creates the shared harness.
2. Slice 2 consumes the frozen harness and extends the canonical property file
   without changing its `ci-node-api` path.
3. Slice 3 extends the same canonical file and adds the package documentation
   pointer.
4. Every slice is RED then GREEN, navigator-approved, one bisect-safe commit,
   and never pushed by the driver.
5. If any slice needs `node/src/index.js`, stop and Q-file the epic owner before
   touching the csk-93 concurrent lane.

## Live-boundary review

**Boundary unit/golden tests can miss**: the Nix package may pass from the
checkout but fail after npm packing, installation into another directory, or
fresh GitHub checkout fixture resolution. Every property therefore imports the
packed artifact from a foreign temporary project, and completion requires fresh
remote CI rather than local green alone.

## Risks and mitigations

- **Random tests that do not document contracts**: adjacent contract comments
  and a complete export inventory are acceptance requirements.
- **Flaky/slow engine properties**: generate host-level variations around
  committed valid vectors, set explicit run budgets, and preserve reported
  seed/path for reproduction.
- **Accidental reference implementation**: helpers may shape inputs and compare
  stable invariants only; architecture checks reject host semantics/fallbacks.
- **Secret leakage during shrinking**: use synthetic sentinels and assert they
  are absent from serialized failures/results.
- **Concurrent csk-93 conflict**: no `node/src/` edits; Q-file before any scope
  expansion into shared source.
- **Future submit gap**: PR and README state #77 is not yet exported and needs
  a follow-up property extension.

## Final verification

The ticket is complete only after every task is checked in its introducing
commit, `./gate.sh` passes at final implementation HEAD, every public export is
accounted for, PR metadata names exact proof and residual gap, fresh GitHub CI
passes, the gate sentinel is dropped, the PR is ready, and CI also passes on
that final pushed SHA. The ticket owner does not merge.
