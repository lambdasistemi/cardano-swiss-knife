# Tasks: Move Transaction Witness Patching from JS into PureScript

**Input**: Design documents from `/specs/037-purs-cbor-patcher/`
**Prerequisites**: `plan.md`, `spec.md`

## Phase 1: Baseline

- [x] T001 Record the clean worktree baseline in `WIP.md`
- [x] T002 Re-run the existing transaction signing regression before refactoring

## Phase 2: PureScript CBOR Layer

- [x] T003 Add a PureScript CBOR module for decoding, encoding, and witness-set mutation
- [x] T004 Rewire `TxInspector.Signing.purs` to call the PureScript patcher instead of a JavaScript patch function
- [x] T005 Reduce `TxInspector/Signing.js` to only the byte-level FFI helpers that remain necessary

## Phase 3: Verification

- [x] T006 Rebuild the browser bundle after the refactor
- [x] T007 Re-run the transaction Playwright regression
- [ ] T008 Run the broader formatting or browser verification gate before pushing
