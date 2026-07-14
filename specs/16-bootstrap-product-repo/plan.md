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

### Slice 3 — Decouple the address WASM build inputs

Classify the lock-node changes caused by the inspector update. Preserve the
reference-confirmed inspection vectors and decouple any moved shared input from
the `cardano-addresses.wasm` build while retaining the refreshed inspector
WASM. Prove both resulting store paths and the full gate.

### Slice 4 — Decouple the test toolchain

Capture the exact `message-byron-mainnet` vector delta, identify which moved
lock node is consumed by `just test`, and bisect those nodes one at a time.
Pin csk's test toolchain independently from inspector inner inputs while
retaining the refreshed inspector lock and unchanged vectors/fixtures.

### Slice 5 — Prove and enforce hermetic test execution

Run the baseline/head × nix-develop/system-node materialization matrix. If the
head is green in the Nix shell, make the in-flight gate execute every CI step
hermetically; otherwise escalate with the matrix evidence.

## Verification

- Slice 1: inspect the exact MIT text and README statement, then `./gate.sh`.
- Slice 2: run the focused Transactions Playwright test after RED/GREEN, then
  `./gate.sh` (`nix develop --quiet -c just ci`).
- Slice 3: compare lock nodes and both WASM store paths, then run `./gate.sh`.
- Slice 4: record the vector delta, prove the culprit node, then run `./gate.sh`.
- Slice 5: log all four materialization outcomes before selecting a repair.
