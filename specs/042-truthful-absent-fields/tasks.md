# Tasks: Truthful absent fields

**Input**: [spec.md](spec.md), [plan.md](plan.md), issue #42, parent #45, and issue #41.

**Story**: Structure's direct body rows exactly partition into truthful present
and absent sets. Tests run RED before implementation. Each implementation
slice equals one bisect-safe commit.

## Slice 1 — Engine-versus-CSK diagnosis (orchestrator-owned)

- [X] T001 Invoke the pinned WASM directly for `tx.browse` and `tx.rdf`, prove
  the signer, ttl, and withdrawal are present, and locate the local fabricated
  null rows.
- [X] T002 Publish the engine evidence and CSK root cause in draft PR #50 before
  behavior-changing implementation begins.

## Slice 2 — Truthful RDF-backed body partition (driver+navigator)

**Goal**: Make the existing Structure adapter agree with the engine while
preserving exact CDDL order and issue #41's generic resolution behavior.

- [ ] T003 Add the RED Playwright proof for the exact 12-present/9-absent
  direct body-field partition on the existing treasury fixture.
- [ ] T004 Assert the engine-derived ttl, withdrawal, and signer values plus
  `network_compliance scope owner` on the B-Labeled required-signer row.
- [ ] T005 Replace the three unconditional null builders with minimal
  RDF-backed rows that remain null only when their predicates are absent.
- [ ] T006 Obtain navigator RED and GREEN approvals, run
  `nix run .#ci-inspector-playwright` and `./gate.sh`, and commit with
  `Tasks: T003, T004, T005, T006`.

## Finalization (orchestrator-owned)

- [ ] T007 Independently verify the pair's diff and commit, mark T003-T006 in
  the same commit, run the extended full gate at final HEAD, push, and update
  draft PR #50 without marking it ready.

## Execution order

T001-T002 close before implementation. T003-T004 establish RED before T005.
T006 closes only after the pair agrees on one SHA. T007 begins only after both
driver `COMMIT` and navigator `NAVIGATOR-VERIFIED` records name that SHA.
