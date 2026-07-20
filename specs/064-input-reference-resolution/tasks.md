# Tasks: Inspectable transaction inputs

**Input**: `spec.md` and `plan.md` in this directory
**Prerequisite**: Merged #10 shared provider IO and current main

## Slice 1 — Resolved context in Structure and Witness (P1)

**Goal**: Show authoritative address/value context for regular and reference
inputs in both inspection tabs and let the operator load the producer.

**Independent Test**: The focused provider-backed browser journey observes
one request per producer, zero `/utxos` calls, exact regular/reference input
details on both tabs, and a successful producer drill-in.

- [X] T641 [US1] Extend the existing producer-CBOR Playwright journey first and capture expected RED for missing full address/value/asset and drill-in behavior.
- [X] T642 [US1] Project ledger `resolved_inputs` and `resolved_reference_inputs` into typed presentation records without numeric coercion or Cardano semantic derivation.
- [X] T643 [US1] Render regular/reference resolution records in Witness with full copyable references, addresses, lovelace, native assets, source/status, and truthful missing reasons.
- [X] T644 [US1] Match the same records to Structure input rows by exact full output reference and expose their address/value context there.
- [X] T645 [US2] Add producer drill-in through the existing hash-mode `Decode` path while preserving current provider/network configuration.
- [X] T646 [US1] Prove unique producer-CBOR requests, zero `/utxos` calls, partial-context truthfulness, focused GREEN, and full `./gate.sh`; commit the reviewed slice.

**Owned Files**:

- `docs/inspector/src/FFI/Json.purs`
- `docs/inspector/src/FFI/Json.js`
- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/tx-identify.spec.mjs`

**Commit Contract**:

```text
feat(inspector): expose resolved transaction inputs

Render authoritative producer-output context in Structure and Witness and let operators inspect the producer through the selected provider.

Tasks: T641, T642, T643, T644, T645, T646
```

## Slice 2 — Orchestrator-owned gate and PR proof

**Goal**: Pin the delivered behavior into the accumulated gate and complete
issue/PR accounting without editing behavior files.

- [ ] T647 Extend the existing `gate.sh` with input-resolution model, rendering, drill-in, provider-accounting, and regression anchors; run `./gate.sh`; commit the gate extension.
- [ ] T648 Audit issue #64 requirements and task accounting, update the draft PR body with exact local proof, and run the final commit/task audit.

**Owned Files**:

- `gate.sh`
- `specs/064-input-reference-resolution/tasks.md`
- Pull request metadata

This slice is explicitly orchestrator-owned. It does not edit production code,
tests, fixtures, dependency manifests, generated artifacts, or configuration
outside `gate.sh`.

## Dependencies & Execution Order

- Slice 1 is one vertical, bisect-safe behavior commit and requires navigator
  approval at both RED and GREEN before commit.
- Slice 2 begins only after Slice 1 is independently reviewed, gated, task-
  stamped, and pushed.
- The accumulated `gate.sh` is extended only after every referenced anchor
  exists; it is never replaced or dropped.
- Between slices the default is to continue automatically. Pause only for a
  Q-file blocker, a repeated gate failure, analyzer surprise, or scope change.

## Parallel Opportunities

There are no implementation-time parallel opportunities inside this ticket.
The adapter, both tab renderings, and drill action form one vertical behavior;
the navigator reviews RED and GREEN concurrently through the handoff protocol.
