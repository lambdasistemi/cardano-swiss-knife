# Tasks: Shared TxEntry Domain

**Input**: [spec.md](spec.md), [plan.md](plan.md), issue #75, parent #66,
release epic #74, and merged dependencies #10/#67

**Story**: One pure shared domain models unsigned multisignature transaction
entries, derives signer completeness/lifecycle, normalizes interoperable
witnesses, and exposes swappable persistence/coordination ports.

## Slice 0 — Intake, specification, and plan (orchestrator-owned)

- [X] T751 Refresh canonical main, read #75/#66/#10/#67, confirm both direct
  dependencies are merged, and inspect their shared Cardano modules.
- [X] T752 Research the existing cardano-multisig entry/store/witness concepts,
  define the strict host/engine boundary, and establish a clean `./gate.sh`
  baseline for the shared test package.
- [X] T753 Author and validate the specification, implementation plan, and
  dependency-ordered slice contract; commit and push the planning artifacts and
  open the issue-linked draft PR.

## Slice 1 — Domain, ports, and direct proof (driver+navigator)

**Goal**: Deliver the complete pure TxEntry surface and adapter seams in one
bisect-safe RED/GREEN commit without adding a backend or semantic fallback.

- [ ] T754 [US1] Add failing direct tests for ordered required, satisfied, and
  missing signer derivation across empty, partial, full, duplicate, and
  unrelated-witness cases.
- [ ] T755 [US1] Add failing direct tests for open/complete derivation, exact
  invalid-after expiry boundary, expiry-over-completeness precedence, and
  submitted/expired terminal preservation.
- [ ] T756 [US2] Add failing direct tests proving raw and `TxWitness ConwayEra`
  inputs normalize to identical collected witness CBOR and update completeness.
- [ ] T757 [US2] Add failing direct tests for wrong envelope/malformed input,
  non-required signer, duplicate refusal, explicit replacement, and terminal
  mutation rejection.
- [ ] T758 [US3] Add compile/runtime proof for every polymorphic `EntryStore`
  and `CoordinationPort` operation through test implementations.
- [ ] T759 [US1] [US2] [US3] Implement the pure TxEntry types, completeness and
  lifecycle functions, #67-backed witness collection, and backend-neutral port
  records with no FFI, manifest, host, provider, or engine change.
- [ ] T760 Obtain navigator RED/GREEN approval, run the focused shared test and
  `./gate.sh`, and commit exactly once with
  `Tasks: T754, T755, T756, T757, T758, T759, T760`.

**Owned files**:

- `lib/src/Cardano/Transaction/Entry.purs`
- `lib/src/Cardano/Transaction/Entry/Ports.purs`
- `test/src/Test/TransactionEntry.purs`
- `test/src/Test/Main.purs`

**Commit contract**:

```text
feat(transaction): add shared TxEntry domain

Model host-neutral transaction entries, derive signer completeness and
lifecycle status, normalize raw/TextEnvelope witnesses, and expose swappable
store and coordination ports.

Tasks: T754, T755, T756, T757, T758, T759, T760
```

## Orchestrator-owned finalization

- [ ] T761 Review the full behavior diff and source boundary, mark T754-T760 in
  the accepted commit, independently run `./gate.sh`, audit commit/task linkage,
  update the draft PR with exact proof, and push the implementation SHA.
- [ ] T762 Verify fresh GitHub Actions green on the implementation SHA, then
  stamp T761-T762 while dropping `gate.sh` in
  `chore: drop gate.sh (ready for review)`, mark the PR ready, and push.
- [ ] T763 Verify fresh GitHub Actions green on the final sentinel SHA, report
  `COMPLETE` with the PR URL to the epic owner, and do not merge.

## Dependencies and execution order

1. T751-T753 establish the issue contract before implementation dispatch.
2. T754-T758 form RED and must be observed and navigator-approved before T759.
3. T759 implements GREEN; T760 closes the paired behavior slice.
4. The ticket orchestrator checks T754-T760 into the same reviewed behavior
   commit before its first push.
5. T761 runs on accepted implementation HEAD. T762 requires remote CI green on
   that exact SHA; T763 requires remote CI green again after the gate sentinel
   is dropped.
6. Driver and navigator are cleared together after the slice. The orchestrator
   never merges the PR.
