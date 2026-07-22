# Tasks: Remove Amaru bundle JSON import

## Slice 1 — Remove bundle import end to end

- [X] T101-S1 Add RED coverage requiring `amaru.book.bundle.v1` rejection without store mutation.
- [X] T102-S1 Remove the bundle dispatch and all exclusively used helper code.
- [X] T103-S1 Remove bundle acceptance fixtures/scenarios while preserving CIP-57 and store JSON regression proof.
- [X] T104-S1 Update the interchange contract from four accepted forms to three.
- [X] T105-S1 Run focused tests and `./gate.sh`, record evidence, and commit with the required trailer.

## Finalization — orchestrator-owned

- [ ] T106-F1 Audit the PR body, verify fresh remote CI, mark ready, and drop `gate.sh` in the finalization commit.
