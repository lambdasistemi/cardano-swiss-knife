# Tasks: Cardano CLI TextEnvelope codec

**Input**: [spec.md](spec.md), [plan.md](plan.md), issue #67, parent #74
**Story**: One host-neutral codec accepts and produces exact cardano-cli Conway
transaction and detached-witness TextEnvelopes.

## Slice 0 — Intake, specification, and plan (orchestrator-owned)

- [X] T671 Refresh canonical main, read #67 and the merged epic map, inspect the
  shared library/test patterns, and establish a clean `./gate.sh` baseline.
- [X] T672 Author and validate the specification, implementation plan, and
  dependency-ordered slice contract in `specs/067-textenvelope-codec/`.
- [X] T673 Commit the planning artifacts, push the branch, and open the draft PR
  with issue linkage and accurate initial metadata.

## Slice 1 — Shared codec and direct contract proof (driver+navigator)

**Goal**: Decode raw hex or either supported Conway TextEnvelope and encode
transaction/witness envelopes with the exact cardano-cli shape.

- [ ] T674 [US1] Add failing direct tests for raw hexadecimal input, transaction
  and witness envelope input, whitespace handling, and deterministic malformed,
  unsupported, missing-field, wrong-field-type, and invalid-hex failures.
- [ ] T675 [US2] Add failing direct tests for exact transaction/witness output
  fields and encode/decode round-trips.
- [ ] T676 [US1] [US2] Implement the host-neutral closed artifact type,
  validation, auto-detection, decoder, and encoder in the shared library.
- [ ] T677 Run the focused shared test command and `./gate.sh`, then commit the
  reviewed slice with the required task trailer.

**Owned Files**:

- `lib/src/Cardano/TextEnvelope.purs`
- `lib/src/Cardano/TextEnvelope.js`
- `test/src/Test/TextEnvelope.purs`
- `test/src/Test/Main.purs`

**Commit Contract**:

```text
feat: add Cardano TextEnvelope codec

Provide host-neutral raw-hex/TextEnvelope decoding and exact Conway transaction
and detached-witness TextEnvelope encoding.

Tasks: T674, T675, T676, T677
```

## Slice 2 — Orchestrator-owned gate and PR proof

**Goal**: Pin the delivered shared API, exact strings, and direct proof into the
existing cumulative gate, then finalize the issue-backed PR.

- [ ] T678 Extend `gate.sh` additively with shared-module, exact-type-string,
  direct-test wiring, rejection, and round-trip proof anchors; run `./gate.sh`;
  commit the gate extension with the required task trailer.
- [ ] T679 Audit all #67 requirements and task/commit linkage, update the draft
  PR body with exact verification evidence, push, and mark the PR ready.

**Owned Files**:

- `gate.sh`
- `specs/067-textenvelope-codec/tasks.md`
- Pull request metadata

This slice is explicitly orchestrator-owned. It does not edit production code,
tests, fixtures, dependency manifests, generated artifacts, or configuration
outside `gate.sh`.

## Dependencies & execution order

- Slice 1 is the only behavior-changing implementation slice.
- Slice 2 depends on the accepted Slice 1 source/test anchors.
- RED must be observed and navigator-approved before GREEN.
- The ticket orchestrator checks completed tasks into the same reviewed commit
  for each slice before pushing.
- Driver and navigator are cleared together after Slice 1 acceptance.
