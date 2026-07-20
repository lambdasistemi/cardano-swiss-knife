# Tasks: Bookable decoded-tree identifiers

**Input**: Design documents from `specs/063-bookable-identifier-restriction/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
and `quickstart.md`

## Slice 1 — Shared bookability policy (P2 foundation)

**Goal**: Publish a pure host-neutral classification that accepts only reusable
address, credential-key, and script identifier kinds.

**Independent Test**: The shared test suite accepts `address`, `key`,
`script`, and `script_hash`, rejects representative generic and
transaction-scoped kinds, and exits zero without importing WebUI modules.

- [X] T631 [US2] Add failing accepted/rejected kind assertions in `test/src/Test/BookableIdentifier.purs` and wire them through `test/src/Test/Main.purs`.
- [X] T632 [US2] Implement the minimal pure closed allowlist in `lib/src/Cardano/BookableIdentifier.purs`.
- [X] T633 [US2] Run `nix develop --quiet -c spago test -p cardano-addresses-test` and `./gate.sh`, then commit the reviewed slice with the required task trailer.

**Owned Files**:

- `lib/src/Cardano/BookableIdentifier.purs`
- `test/src/Test/BookableIdentifier.purs`
- `test/src/Test/Main.purs`

**Commit Contract**:

```text
feat(inspector): classify bookable identifier kinds

Define the reusable identifier-kind policy independently of WebUI state.

Tasks: T631, T632, T633
```

## Slice 2 — Restrict the decoded-tree action (P1)

**Goal**: Remove `Label this node` from transaction-scoped and payload-scoped
rows while preserving address and verification-key book workflows.

**Independent Test**: The existing annotation journey shows no action on the
transaction hash, transaction output/reference, auxiliary-data hash,
script-data hash, or datum hash rows; an address can create a local book and a
verification key can append to it.

- [X] T634 [US1] Rewrite the existing annotation journey in `docs/inspector/tests/tx-identify.spec.mjs` to establish RED with absent-action assertions and address-first book creation.
- [X] T635 [US1] Import and apply the shared bookability predicate in `docs/inspector/src/Main.purs` while preserving the existing unresolved/non-empty guards.
- [X] T636 [US1] Run `nix run .#ci-inspector-playwright` and `./gate.sh`, then commit the reviewed slice with the required task trailer.

**Owned Files**:

- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/tx-identify.spec.mjs`

**Commit Contract**:

```text
fix(inspector): restrict labels to bookable identifiers

Hide the annotation action for transaction-scoped identifiers while preserving reusable address and key labeling.

Tasks: T634, T635, T636
```

## Slice 3 — Orchestrator-owned gate and PR proof

**Goal**: Pin the delivered policy and WebUI restriction into the accumulated
repository gate without replacing any existing checks.

- [X] T637 Extend the existing `gate.sh` with predicate, direct-test, WebUI-consumption, and browser-proof anchors; run `./gate.sh`; commit the gate extension.
- [X] T638 Audit all issue #63 requirements and task accounting, update the draft PR body with exact local proof, and run the final commit/task audit.

**Owned Files**:

- `gate.sh`
- `specs/063-bookable-identifier-restriction/tasks.md`
- Pull request metadata

This slice is explicitly orchestrator-owned. It does not edit production code,
tests, fixtures, dependency manifests, generated artifacts, or configuration
outside `gate.sh`.

## Dependencies & Execution Order

- Slice 1 establishes shared policy before any host consumes it.
- Slice 2 depends on the accepted Slice 1 commit and delivers the visible P1
  restriction.
- Slice 3 depends on both behavior slices and pins only already-delivered
  anchors into the accumulated gate.
- RED must be observed and navigator-approved before GREEN in each behavior
  slice.
- The ticket-orchestrator checks each slice's tasks and amends them into that
  slice's reviewed commit before push.

## Parallel Opportunities

There are no safe implementation-time parallel opportunities: Slice 2 imports
Slice 1, both behavior slices share the same gate, and Slice 3 verifies their
combined result. Driver and navigator review run concurrently only through the
paired handoff protocol.

## Implementation Strategy

1. Land and verify the small shared policy foundation.
2. Reuse cleared driver+navigator panes for the WebUI vertical slice.
3. Extend the accumulated gate only after all referenced anchors exist.
4. Run the full final gate and audit PR metadata before marking ready.
