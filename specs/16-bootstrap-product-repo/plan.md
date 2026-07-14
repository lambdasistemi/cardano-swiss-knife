# Implementation Plan — Issue 16

## Context

The browser UI executes ledger-inspector operations through
`TxInspector.Inspector`, normalizes their JSON in `TxInspector.Json`, and
renders transaction details in `App.purs`. The upstream WASM bump can change
that operation envelope, so the affected browser flow must be exercised after
locking the new revision.

## Slices

### Slice 1 — License the repository

Add the decided MIT text and replace the README's undeclared-license note.
This is independently reviewable documentation/legal metadata.

### Slice 2 — Refresh inspector and repair transaction rendering

Update only the `cardano-ledger-inspector` lock entry, materialize the WASM
through the existing build, run the focused Transactions Playwright coverage,
and make the smallest envelope-normalization/rendering change required by the
observed regression. The full CI gate proves the complete baseline.

## Verification

- Slice 1: inspect the exact MIT text and README statement, then `./gate.sh`.
- Slice 2: run the focused Transactions Playwright test after RED/GREEN, then
  `./gate.sh` (`nix develop --quiet -c just ci`).
