# Implementation Plan: Render book resolutions

**Branch**: `feat/41-render-book-resolutions` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

## Root cause

Live Firefox evidence on untouched main shows the RDF lens successfully maps
the owner hash to `network_compliance scope owner`, while the Witness view
renders the raw required/missing hash twice with no label. The PureScript
Witness row model drops identifier candidates and ignores the engine's
`intent.value.outputs[]`. Structure counts only decoded-tree rows and offers no
inventory, so the owner cannot appear there until #42 adds its currently
false-absent required-signers row. Existing resolved tree rows already contain
labels, but their display and the counter are not a shared presentation model.

## Technical approach

Build one presentation-only resolution inventory in `Main.purs` from the
existing resolved-label lens, decoded-tree rows, and identifier candidates
preserved on Witness/intent rows. Matching stays exact against identifiers and
canonical IRIs already emitted by the pipeline; do not add a new resolver or
suffix heuristic.

- Extend the typed Witness row model with full identifier candidates.
- Materialize `intent.value.outputs[]` as output-address Witness rows without
  shortening `address_hex` before matching/copying.
- Use a row-generic lookup for Structure and Witness label affordances.
- Turn the Structure count into a click/expand disclosure whose unique entries
  are exactly what it counts.
- Keep raw identifier evidence and copy actions intact.

## Owned implementation files

```text
docs/inspector/src/FFI/Json.js
docs/inspector/src/FFI/Json.purs
docs/inspector/src/FFI/RdfShapes.js
docs/inspector/src/FFI/RdfShapes.purs
docs/inspector/src/Main.purs
docs/inspector/dist/styles.css
docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex
docs/inspector/tests/tx-identify.spec.mjs
```

`RdfShapes.*` may be edited only if exact identifier candidates needed by the
generic lookup are not already exposed. No resolver-query semantics may
change. The implementation worker does not edit specs, `gate.sh`, manifests,
locks, or PR metadata.

## Slice 1 — rendered resolution journey

One driver+navigator RED/GREEN commit owns the vertical behavior because the
same generic index must drive the counter disclosure, tree rows, signer rows,
and output-address rows. Splitting them would temporarily make the two tabs
disagree about the same resolution.

1. Copy the exact unsigned transaction fixture and add the P1 browser journey.
2. Observe RED: owner absent from both the Structure disclosure (which does not
   yet exist) and the Witness signer rows; output addresses are absent/dropped.
3. Preserve row identifier candidates and engine output rows in the typed view
   model.
4. Add the shared exact-match index, generic row rendering, and automatable
   Structure disclosure.
5. Prove GREEN in both row styles and Witness, then run the full gate.

Commit subject: `feat: render book resolutions across inspector views`

## Finalization

The ticket orchestrator reviews the full diff, stamps the slice tasks into the
same commit, pushes, then extends permanent `gate.sh` with fixture/test
inventory, reruns the full gate, and updates the draft PR with baseline and
after DOM evidence. The PR remains draft; it is never marked ready or merged.

## Risks and controls

- **Duplicate book labels for one entity**: the test selects only the imported
  bundle; production rendering preserves deterministic pipeline order and
  deduplicates identical label/identifier entries.
- **False count**: count is derived from the disclosure entries themselves.
- **Cross-ticket drift**: no required-signers tree-node correction; #42 owns
  that partition and ratchets the tree-row assertion.
- **Semantic drift**: exact existing candidates only; no new suffix, type, or
  fallback resolution rule.

