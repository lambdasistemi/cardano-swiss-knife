# Implementation Plan: Truthful absent fields

**Branch**: `fix/42-truthful-absent-fields` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

## Root cause

Direct invocation of the pinned inspector WASM proves the engine is truthful
for the treasury fixture. `tx.browse` reports one required signer, an
`invalid_hereafter` of `192815425`, and one withdrawal. `tx.rdf` emits
`cardano:hasRequiredSigner`, `cardano:hasValidityInterval` with
`cardano:intervalEnd 192815425`, and `cardano:hasWithdrawal` whose node has
`cardano:lovelace 0`.

The divergence is local to `normalizeDecodedTreeRows` in
`docs/inspector/src/FFI/RdfShapes.js`: the CDDL-order entries for `ttl`,
`withdrawals`, and `required_signers` unconditionally call `addNullField`.
The PureScript renderer then correctly groups those fabricated null rows into
the absent chips. No engine-side Q-file or re-scope is required.

## Owned implementation files

```text
docs/inspector/src/FFI/RdfShapes.js
docs/inspector/tests/tx-identify.spec.mjs
```

The driver does not edit specs, `gate.sh`, manifests, locks, generated assets,
or PR metadata.

## Slice 1 — engine-versus-CSK diagnosis (orchestrator-owned, complete)

1. Run the fixture through the pinned WASM using the production operation
   envelope for both `tx.browse` and `tx.rdf`.
2. Record the engine values and identify the three unconditional local null
   builders.
3. Publish the root cause in draft PR #50 before any behavior-changing fix.

## Slice 2 — truthful RDF-backed body partition

One driver+navigator RED/GREEN commit owns the regression and minimal adapter
fix because the exact partition is one atomic rendering invariant.

1. Extend the existing issue #41 treasury Playwright journey with the exact
   12-present/9-absent partition, three engine-derived values, and B-Labeled
   owner-label assertion; run the Nix Playwright app and observe RED.
2. Derive only the three currently fabricated rows from their existing RDF
   predicates, preserving CDDL order, identifier evidence, and true-null
   behavior.
3. Prove GREEN with `nix run .#ci-inspector-playwright`, obtain navigator
   approval, run `./gate.sh`, and create one bisect-safe commit.

Commit subject: `fix: render present body fields truthfully`

## Finalization

The ticket orchestrator independently reviews the complete diff and commit,
stamps Slice 2 task accounting into that same commit, reruns the full extended
gate at final HEAD, pushes, and updates draft PR #50. The PR remains draft and
is never marked ready or merged.

## Risks and controls

- **Partial assertion**: compare the complete direct-row partition, not only
  the three repaired labels.
- **Resolution regression**: assert the inherited owner label on the actual
  required-signer row in B-Labeled style.
- **Semantic drift**: query only predicates already present in the pinned RDF;
  no fallback inference or engine changes.
- **Test invocation drift**: use the Nix app as-is because its wrapper does not
  forward focused Playwright arguments (the repository's csk#22 constraint).
