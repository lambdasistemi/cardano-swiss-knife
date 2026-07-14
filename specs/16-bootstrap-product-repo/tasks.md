# Tasks — Issue 16

## Slice 1 — License the repository

- [X] T001-S1 Add the decided MIT license and README license statement.
- [X] T002-S1 Run the repository gate and commit the reviewed slice.

## Slice 2 — Refresh inspector and repair transaction rendering

- [X] T003-S2 Update only the `cardano-ledger-inspector` flake lock input.
- [X] T004-S2 Add or update focused Transactions Playwright coverage, observe RED,
  and repair the changed inspector operation envelope.
- [X] T005-S2 Run the full repository gate and commit the reviewed slice.

## Slice 3 — Decouple the address WASM build inputs

- [X] T006-S3 Diagnose the inspector lock-node diff and identify input coupling.
- [X] T007-S3 Decouple moved address-WASM inputs without changing vectors, fixtures,
  or the inspector pin.
- [X] T008-S3 Verify both WASM store paths and the full repository gate.

## Slice 4 — Decouple the test toolchain

- [X] T009-S4 Capture the exact failing vector delta and map moved lock nodes to `just test`.
- [X] T010-S4 Bisect candidate nodes and explicitly decouple csk's test toolchain.
- [X] T011-S4 Prove the inspector pin, vectors, and fixtures remain unchanged; pass the full gate.

## Slice 5 — Prove and enforce hermetic test execution

- [X] T012-S5 Run and record the four-cell runtime/materialization matrix.
- [X] T013-S5 Make the gate hermetic if and only if the matrix selects it.
- [X] T014-S5 Run the full hermetic gate and preserve the refreshed inspector pin.
