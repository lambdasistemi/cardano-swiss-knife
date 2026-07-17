# Tasks: Loud Amaru book bundle import

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [quickstart.md](quickstart.md), and
`docs/book-interchange.md`

**Story**: US1 is the issue's P1 operator journey. Tests are mandatory and run
RED before implementation. One slice equals one bisect-safe commit.

## Slice 1 — Interchange contract (orchestrator-owned)

**Goal**: Release the agreement surface that unblocks the sibling exporter.

**Independent Test**: Contract inventory and the full repository gate pass.

- [X] T001 [US1] Define and gate the exact bundle/overlay/feedback contract in `docs/book-interchange.md` and `gate.sh` (commit `5ca7dd9`)

**Checkpoint**: Released through the worker STATUS protocol.

## Planning record (orchestrator-owned)

- [X] T002 [US1] Specify, plan, task, and analyze the P1 slice in `specs/40-book-import-bundle/`

## Slice 2 — Bundle import and loud feedback (driver+navigator)

**Goal**: Close the original no-op and make every import result visible.

**Independent Test**: In a clean browser, the exact fixture adds one selected
two-part book; malformed input leaves storage unchanged with a visible reason;
all four paths report successful name/part totals.

- [X] T003 [US1] Copy the exact 2026-07-17 reproducer unchanged into `docs/inspector/tests/fixtures/attx-book-bundle.json`
- [X] T004 [US1] Add RED browser cases for bundle selection/mapping, malformed atomic failure, and every import feedback path in `docs/inspector/tests/tx-identify.spec.mjs`
- [X] T005 [US1] Implement strict `amaru.book.bundle.v1` dispatch, typed ignored-key notice, and contract-pinned part/Turtle mapping in `docs/inspector/src/FFI/OverlayBook.js` and `docs/inspector/src/FFI/OverlayBook.purs`
- [X] T006 [US1] Add mutually exclusive visible Library success/failure feedback to every import action in `docs/inspector/src/Main.purs`
- [X] T007 [US1] Run `nix run .#ci-inspector-playwright` to GREEN and record exact counts in `WIP.md`
- [X] T008 [US1] Run `./gate.sh`, commit the reviewed slice with `Tasks: T003, T004, T005, T006, T007, T008`, and record evidence in `WIP.md`

**Checkpoint**: Driver commits only after navigator approves RED and GREEN;
ticket orchestrator independently reviews, stamps all Slice 2 tasks, reruns the
gate, and pushes.

## Dependencies & Execution Order

- Slice 1 is complete and frozen.
- T003 and T004 establish RED before T005 or T006 begins.
- T005 and T006 jointly flip the P1 journey to GREEN.
- T007 precedes T008; the full gate is the final slice proof.
- No task is parallelized because the same browser journey and test file impose
  a strict RED-to-GREEN dependency chain.

## Implementation Strategy

Deliver only the P1 vertical slice. Do not split parser support from visible
feedback, because either intermediate state would violate the accepted
truthfulness contract. After acceptance, the orchestrator updates PR evidence;
the PR remains draft and unmerged.
