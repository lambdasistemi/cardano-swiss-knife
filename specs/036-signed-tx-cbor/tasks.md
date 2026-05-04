# Tasks: Patch Generated VKey Witnesses into Transaction CBOR

**Input**: Design documents from `/specs/036-signed-tx-cbor/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tx-signing-result.md

**Tests**: Playwright regression first, then full browser and build verification.

## Phase 1: Setup

**Purpose**: Align the branch with repo workflow artifacts and lock the green baseline

- [x] T001 Record the green bundled + wasm-assets Playwright baseline in `WIP.md`
- [x] T002 Create spec artifacts under `specs/036-signed-tx-cbor/`

---

## Phase 2: Foundational

**Purpose**: Define the transaction-signing result contract and patching behavior before UI wiring

- [ ] T003 Define the signed transaction output contract in `specs/036-signed-tx-cbor/contracts/tx-signing-result.md`
- [ ] T004 [P] Extend `app/src/TxInspector/Signing.purs` witness material type for patched transaction output
- [ ] T005 [P] Implement CBOR witness-set decoding/patching helpers in `app/src/TxInspector/Signing.js`

**Checkpoint**: The signing module can describe a patched transaction result shape.

---

## Phase 3: User Story 1 - Produce a signed transaction artifact locally (Priority: P1) 🎯 MVP

**Goal**: Return signed transaction CBOR alongside detached witness details

**Independent Test**: Inspect fixture transaction CBOR, sign it, and verify the UI exposes signed transaction CBOR that re-decodes with the signer present.

### Tests for User Story 1

- [ ] T006 [US1] Write a failing regression in `tests/transactions.spec.ts` for signed transaction CBOR output

### Implementation for User Story 1

- [ ] T007 [US1] Extend `app/src/TxInspector/Signing.purs` to patch the inspected transaction CBOR while building witness material
- [ ] T008 [US1] Update `app/src/App.purs` to render signed transaction CBOR and remove detached-only wording
- [ ] T009 [US1] Run the targeted Playwright transaction test and make it pass

**Checkpoint**: The Transactions page emits a signed transaction artifact in one browser flow.

---

## Phase 4: User Story 2 - Re-sign without duplicating the same signer (Priority: P2)

**Goal**: Replace same-key witnesses instead of appending duplicates

**Independent Test**: Patch the same transaction twice with the same key and confirm witness count stability.

### Tests for User Story 2

- [ ] T010 [US2] Extend `tests/transactions.spec.ts` with same-key re-sign coverage

### Implementation for User Story 2

- [ ] T011 [US2] Update `app/src/TxInspector/Signing.js` to replace existing vkey witnesses for the same verification key
- [ ] T012 [US2] Surface patch action details in `app/src/App.purs`

**Checkpoint**: Repeating the same signing action stays stable.

---

## Phase 5: User Story 3 - Fail clearly on unpatchable input (Priority: P3)

**Goal**: Preserve honest capability boundaries when patching fails

**Independent Test**: Force a patching error and confirm no signed transaction artifact is shown.

### Tests for User Story 3

- [ ] T013 [US3] Add an unpatchable-input regression in `tests/transactions.spec.ts`

### Implementation for User Story 3

- [ ] T014 [US3] Return precise patching failures from `app/src/TxInspector/Signing.js`
- [ ] T015 [US3] Render patching errors clearly in `app/src/App.purs`

**Checkpoint**: The signing card reports patching failures honestly.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T016 [P] Update detached-only wording in `README.md`, `docs/index.md`, and `docs/concepts.md`
- [ ] T017 Run `just build` and targeted Playwright verification
- [ ] T018 Run the full Playwright suite

## Dependencies & Execution Order

- Phase 1 must complete first.
- Phase 2 blocks implementation work.
- User Story 1 is the MVP and should land before User Stories 2 and 3.
- User Story 2 depends on the basic patcher from User Story 1.
- User Story 3 depends on the same patcher and error plumbing from User Story 1.
- Polish runs after the desired stories are complete.

## Implementation Strategy

1. Lock the baseline and spec artifacts.
2. Write the failing transaction regression.
3. Implement the minimal patcher and UI contract to satisfy User Story 1.
4. Add duplicate-replacement and error-path coverage only after the MVP is green.
