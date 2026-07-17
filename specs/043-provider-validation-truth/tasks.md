# Tasks: Provider and validation truth

**Input**: [spec.md](spec.md), [plan.md](plan.md), issues #43 and #30, parent #45.

**Story**: Decode stays inside the selected provider and the Validation tab
reports unavailable context and incomplete ledger evaluation truthfully. Tests
run RED before implementation. Each implementation slice equals one bisect-safe
commit.

## Slice 1 — Intake and acceptance gate (orchestrator-owned)

- [X] T001 Refresh main, read #43/#30/#45, create the prescribed worktree, and
  establish a clean `./gate.sh` baseline.
- [X] T002 Confirm the provider-dispatch and banner root causes, extend the
  gate, and open draft PR #51 with required metadata.

## Slice 2 — Selected-provider and ledger-verdict truth (driver+navigator)

**Goal**: Make one no-credentials decode prove honest request routing, surfaced
context failure, and an incomplete verdict while retaining a positive complete
valid case.

- [X] T003 Add RED Playwright coverage proving selected Blockfrost sends zero
  Koios requests on the existing no-credentials fixture path.
- [X] T004 Assert the visible missing-credentials/network cause, incomplete
  warning banner, absence of `Validation passed`, and complete-valid positive
  case.
- [X] T005 Remove the Blockfrost-to-Koios fallback and record explicit missing
  credentials without provider I/O.
- [X] T006 Preserve structured ledger verdict fields and provider resolution
  errors through browser normalization, then render the dedicated context notice
  and truthful banner.
- [X] T007 Obtain navigator RED and GREEN approvals, run
  `nix run .#ci-inspector-playwright` and `./gate.sh`, and commit with
  `Tasks: T003, T004, T005, T006, T007`.

## Finalization (orchestrator-owned)

- [X] T008 Independently verify the pair's diff and commit, mark T003-T007 in
  the same commit, run the extended full gate at final HEAD, push, and update
  draft PR #51 without marking it ready.

## Execution order

T001-T002 close before implementation. T003-T004 establish RED before
T005-T006. T007 closes only after the pair agrees on one SHA. T008 begins only
after both driver `COMMIT` and navigator `NAVIGATOR-VERIFIED` records name that
SHA.
