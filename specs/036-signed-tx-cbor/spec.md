# Feature Specification: Patch Generated VKey Witnesses into Transaction CBOR

**Feature Branch**: `feat/patch-signed-tx-cbor`  
**Created**: 2026-05-04  
**Status**: Draft  
**Input**: lambdasistemi/cardano-swiss-knife#2

## User Scenarios & Testing

### User Story 1 - Produce a signed transaction artifact locally (Priority: P1)

A user inspects a transaction, chooses a compatible extended signing key, and gets back a full transaction CBOR artifact with the generated vkey witness patched into the witness set locally in the browser.

**Why this priority**: Detached witness material is useful for inspection, but it stops short of the artifact users actually need for downstream validation, reinspection, or submission.

**Independent Test**: Inspect a known transaction CBOR, sign it with a known `addr_xsk`, and verify the returned CBOR re-decodes with the added vkey witness present.

**Acceptance Scenarios**:

1. **Given** an inspected transaction with a derived body hash and a compatible extended signing key, **When** the user signs the transaction body, **Then** the result includes the original detached witness details and a patched transaction CBOR hex artifact
2. **Given** a transaction witness set that already contains other witness classes, **When** the user patches a vkey witness, **Then** the non-vkey witness data remains present in the signed transaction artifact
3. **Given** a patched transaction artifact, **When** the user re-inspects it, **Then** the transaction identity still matches the original body and the witness set reflects the added signer

---

### User Story 2 - Re-sign without duplicating the same signer (Priority: P2)

A user can sign the same transaction again with the same key without inflating the witness set with duplicate entries for the same verification key.

**Why this priority**: Re-running the action is a normal browser workflow. Duplicate witnesses would make the result noisy and misleading.

**Independent Test**: Patch the same transaction twice with the same signing key and verify the vkey witness count for that signer stays stable.

**Acceptance Scenarios**:

1. **Given** a transaction that already contains a vkey witness for the same verification key, **When** the user signs again with that key, **Then** the existing witness is replaced rather than duplicated
2. **Given** a transaction that contains no vkey witness for that signer, **When** the user signs, **Then** the new witness is appended to the existing vkey witness collection

---

### User Story 3 - Fail clearly on unpatchable input (Priority: P3)

A user sees a precise error when the app can sign the body hash but cannot map the generated witness back into the transaction structure.

**Why this priority**: Honest capability boundaries are part of the project constitution. Silent fallback to detached-only output would be misleading once this feature exists.

**Independent Test**: Attempt to patch malformed or unsupported transaction CBOR and verify the signing card surfaces a patching error without pretending a signed transaction exists.

**Acceptance Scenarios**:

1. **Given** malformed transaction CBOR, **When** the app attempts to patch a witness, **Then** the signing result shows a clear patching error
2. **Given** a transaction shape the patcher cannot decode, **When** the app attempts to patch a witness, **Then** the app does not emit a fake signed transaction artifact

### Edge Cases

- A transaction has no existing witness-set map entry for vkey witnesses
- A transaction already contains a vkey witness for the same verification key
- A transaction contains tagged or indefinite CBOR structures elsewhere in the witness set
- A signing key produces detached witness material successfully, but the transaction CBOR cannot be decoded for patching

## Requirements

### Functional Requirements

- **FR-001**: The system MUST patch generated vkey witness material back into the inspected transaction CBOR and return the signed transaction as hex text
- **FR-002**: The system MUST preserve the original transaction body and all non-target witness-set content while patching the vkey witness
- **FR-003**: The system MUST continue to expose detached witness details alongside the patched transaction artifact
- **FR-004**: The system MUST replace an existing vkey witness for the same verification key instead of duplicating it
- **FR-005**: The system MUST surface a user-visible error if detached witness generation succeeds but transaction patching fails
- **FR-006**: The UI and documentation MUST stop describing the transaction-signing flow as detached-only once patched transaction output exists
- **FR-007**: The feature MUST stay scoped to local vkey witness patching; bootstrap witness mutation, script witness synthesis, and submission flows remain out of scope

### Key Entities

- **Witness Material**: The locally generated body-hash signing result, including verification key, signer hash, signature, vkey witness CBOR, and patched transaction CBOR
- **Transaction Witness Set**: The transaction section that carries vkey witnesses and other witness classes and must be preserved while one vkey witness is inserted or replaced
- **Signed Transaction Artifact**: The hex-encoded transaction CBOR produced after witness patching, suitable for reinspection or downstream handling

## Success Criteria

### Measurable Outcomes

- **SC-001**: A browser test can sign a known fixture transaction and observe a patched transaction CBOR result in the UI
- **SC-002**: Re-inspecting the patched transaction shows the same transaction identity and an updated witness set that includes the signer
- **SC-003**: Repeating the signing action with the same key does not increase the witness count for that signer
- **SC-004**: The transaction page no longer claims that signing is detached-only

## Assumptions

- Only transactions that the existing ledger inspector can decode are in scope for patching
- Only extended vkey-style signing keys already supported by the browser signing flow are in scope
- The patched transaction can be re-encoded with definite-length CBOR collections as long as the transaction remains semantically valid for downstream tooling
