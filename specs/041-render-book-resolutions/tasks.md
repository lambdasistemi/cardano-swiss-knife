# Tasks: Render book resolutions

**Input**: [spec.md](spec.md), [plan.md](plan.md), issue #41, parent #45, and A-001.

**Story**: The treasury owner and address names reach the operator in both
views. Tests run RED before implementation. One implementation slice equals
one bisect-safe commit.

## Planning record (orchestrator-owned)

- [X] T001 Specify the live root cause, #42 boundary, shared row-generic design,
  and automatable acceptance proof.

## Slice 1 — Rendered resolution journey (driver+navigator)

**Goal**: Make one existing resolution inventory drive Structure and Witness
without changing resolution semantics.

- [X] T002 Copy the exact reorganize CBOR to
  `docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex` and verify
  SHA-256 `11ba0b62566367e6dfd76eb6d06e4dc6474cf145d434b596d047377b69d1fb75`.
- [X] T003 Add the RED Playwright journey that imports only the exact Amaru
  bundle and proves the scope-owner name missing from Structure and Witness.
- [X] T004 Preserve generic identifier candidates on typed Witness/intent rows
  and expose full `intent.value.outputs[].address_hex` rows without engine or
  resolver changes.
- [X] T005 Add the shared exact-match presentation index, row-generic label
  affordance, and count-matched Structure disclosure; keep raw values copyable.
- [X] T006 Prove the scope owner in Structure disclosure and declared/missing
  Witness rows, output-address resolution, and A-Quiet/B-Labeled behavior.
- [X] T007 Run `nix run .#ci-inspector-playwright` and `./gate.sh`, obtain
  navigator approval, and commit with `Tasks: T002, T003, T004, T005, T006, T007`.

## Finalization (orchestrator-owned)

- [X] T008 Independently review and verify the slice, stamp T002-T007 into its
  commit, extend permanent `gate.sh` with fixture/test inventory, and record
  before/after DOM or screenshot evidence in the draft PR.

## Execution order

T002-T003 establish RED before T004-T005. T006 proves the complete P1 path;
T007 closes the worker slice. T008 starts only after driver `COMMIT` and
navigator `NAVIGATOR-VERIFIED` agree on the same SHA.
