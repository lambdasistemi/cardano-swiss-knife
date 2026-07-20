# Tasks: Decoded auxiliary metadata in Structure

**Input**: `spec.md` and `plan.md` in this directory
**Prerequisite**: Merged `cardano-ledger-inspector#161` and current main

## Slice 1 — Typed metadata tree in Structure (P1)

**Goal**: Consume the engine's decoded metadata union and expose every label and
recursive value to a transaction signer in Structure.

**Independent Test**: Focused browser scenarios render exact Amaru rationale
text and an all-types fixture with lossless scalar strings, nesting, and ordered
map entries.

- [X] T651 [US1] Add focused Playwright assertions first for the treasury rationale and all-types recursive tree; capture RED on the old engine pin/count-only Structure.
- [X] T652 [US2] Advance `flake.lock` to a ledger-inspector revision containing merged typed metadata support and copy the canonical all-types transaction fixture.
- [X] T653 [US2] Project `auxiliary_data.metadata` into recursive PureScript presentation types while preserving exact scalar strings and array order.
- [X] T654 [US1] Render labels and recursive int/bytes/text/list/map nodes in Structure with self-declared-data wording and truthful empty/malformed behavior.
- [X] T655 [US2] Prove non-text/duplicate ordered map keys, nested values, large/negative integers, lowercase bytes, existing no-metadata behavior, focused GREEN, and full `./gate.sh`; commit the reviewed slice.

**Owned Files**:

- `flake.lock`
- `docs/inspector/src/FFI/Json.purs`
- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/fixtures/tx-intent-metadata-all-types.hex`
- `docs/inspector/tests/tx-identify.spec.mjs`

**Commit Contract**:

```text
feat(inspector): render decoded auxiliary metadata

Consume the ledger engine's typed auxiliary metadata and render its complete recursive value tree for signers.

Tasks: T651, T652, T653, T654, T655
```

## Slice 2 — Orchestrator-owned gate and PR proof

**Goal**: Pin the delivered behavior into the accumulated gate and complete
issue/PR accounting without editing behavior files.

- [ ] T656 Extend—not replace—the existing `gate.sh` list with engine pin, typed model, recursive rendering, fixture, and focused browser anchors; run `./gate.sh`; commit the extension.
- [ ] T657 Audit issue #65 requirements and task accounting, update the draft PR body with exact local proof, run the final commit/task audit, and drop `gate.sh` only when marking the PR ready.

**Owned Files**:

- `gate.sh`
- `specs/065-auxiliary-metadata-rendering/tasks.md`
- Pull request metadata

This slice is explicitly orchestrator-owned. It does not edit production code,
tests, fixtures, dependency manifests, generated artifacts, or configuration
outside `gate.sh`.

## Dependencies & Execution Order

- Slice 1 is one vertical, bisect-safe behavior commit and requires navigator
  approval at both RED and GREEN before commit.
- Slice 2 begins only after Slice 1 is independently reviewed, gated, task-
  stamped, and pushed.
- Between slices the default is to continue automatically. Pause only for a
  Q-file blocker, a repeated gate failure, analyzer surprise, or scope change.

## Parallel Opportunities

There are no implementation-time parallel opportunities inside this ticket.
The engine pin, typed adapter, renderer, and browser proof form one vertical
slice; the navigator reviews RED and GREEN through the paired handoff protocol.
