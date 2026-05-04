# Feature Specification: Move Transaction Witness Patching from JS into PureScript

**Feature Branch**: `feat/move-transaction-witness-patching-logic-from-js-in`  
**Created**: 2026-05-04  
**Status**: Draft  
**Input**: lambdasistemi/cardano-swiss-knife#4

## User Scenarios & Testing

### User Story 1 - Keep transaction signing usable while moving patching logic (Priority: P1)

A user signs a transaction in the browser and still receives a patched signed transaction CBOR artifact even after the witness patcher is moved out of JavaScript and into PureScript.

**Why this priority**: The refactor is only acceptable if the transaction signing flow keeps working exactly where users already depend on it.

**Independent Test**: Run the existing browser regression that signs a known transaction fixture and verifies the signed transaction CBOR still contains the generated vkey witness.

**Acceptance Scenarios**:

1. **Given** a transaction fixture and a compatible extended signing key, **When** the user signs the transaction body, **Then** the UI still renders detached witness details plus patched signed transaction CBOR
2. **Given** a transaction that already contains another vkey witness, **When** the user signs with a second key, **Then** the patched transaction still contains both witnesses

---

### User Story 2 - Keep the JavaScript FFI minimal (Priority: P2)

A maintainer can inspect the transaction signing implementation and see that the CBOR parsing, encoding, and witness-set mutation logic lives in PureScript rather than in a large JavaScript helper file.

**Why this priority**: This repository is intentionally PureScript-led. The FFI should stay at the byte-boundary, not own domain logic.

**Independent Test**: Inspect the signing modules and confirm only byte/UTF-8 helpers remain in JavaScript while the CBOR patching path is implemented in PureScript.

**Acceptance Scenarios**:

1. **Given** the transaction signing implementation, **When** a maintainer reviews the modules, **Then** the CBOR parser, encoder, and witness patcher are defined in PureScript
2. **Given** the JavaScript FFI modules, **When** a maintainer reads them, **Then** they only contain the unavoidable low-level helpers needed by PureScript

### Edge Cases

- Transaction and witness CBOR may arrive in uppercase hex and must still normalize correctly
- Existing witness collections may be plain arrays or tagged arrays
- Indefinite-length byte, text, array, or map structures elsewhere in the transaction must still decode for patching

## Requirements

### Functional Requirements

- **FR-001**: The system MUST move transaction witness CBOR parsing, encoding, and patching logic into PureScript
- **FR-002**: The system MUST keep the existing transaction signing browser flow behavior unchanged for supported fixture transactions
- **FR-003**: The JavaScript FFI for transaction signing MUST be reduced to byte-level helpers that are awkward or impossible to express cleanly in PureScript alone
- **FR-004**: The PureScript patcher MUST still insert a new vkey witness when the witness set has no entry for key `0`
- **FR-005**: The PureScript patcher MUST still replace an existing vkey witness for the same verification key instead of duplicating it
- **FR-006**: The refactor MUST preserve the current error behavior for malformed or unsupported transaction CBOR inputs as clear patching failures

## Success Criteria

### Measurable Outcomes

- **SC-001**: `nix develop --quiet -c just bundle` passes after the refactor
- **SC-002**: `npx playwright test tests/transactions.spec.ts --reporter=list` passes after the refactor
- **SC-003**: `app/src/TxInspector/Signing.js` no longer contains the in-tree CBOR parser/encoder/patcher
