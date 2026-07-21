# Feature Specification: Shared TxEntry Domain

**Feature Branch**: `feat/75-txentry-domain`

**Created**: 2026-07-21

**Status**: Draft

**Input**: Issue #75, parent #66, release epic #74, and merged dependencies
#10 and #67

## P1 user story

As a Cardano Swiss Knife host, I can manage unsigned multisignature
transactions through one pure shared domain that reports collected and missing
signers consistently, regardless of whether a later adapter runs in a browser,
CLI, Node process, or remote coordinator.

## User scenarios and testing

### User Story 1 — Derive signer completeness and lifecycle (Priority: P1)

A host holds a transaction entry containing unsigned transaction CBOR, an
ordered required-signer roster, collected detached witnesses, an invalid-after
slot, and its lifecycle status. The shared domain derives the required,
satisfied, and missing signer sets and the current open/complete/expired state.

**Independent Test**: Construct entries in the shared PureScript test package,
vary their signer/witness rosters and current slot, and compare the complete
derived result without any host or engine adapter.

**Acceptance Scenarios**:

1. **Given** no collected witness, **when** completeness is derived, **then**
   every required signer is missing and the live status is open.
2. **Given** witnesses for part of the roster, **when** completeness is
   derived, **then** required-signer order is preserved and the satisfied and
   missing partitions are exact.
3. **Given** every required signer has a witness before expiry, **when** status
   is derived, **then** the entry is complete.
4. **Given** the current slot is at or beyond the invalid-after slot, **when**
   status is derived, **then** a non-submitted entry is expired even when its
   witness roster is complete.
5. **Given** an already submitted or expired entry, **when** status is
   refreshed, **then** its terminal status is preserved.

### User Story 2 — Collect interoperable detached witnesses (Priority: P1)

A host can attach a detached witness to the named required signer using either
raw hexadecimal CBOR or the exact `TxWitness ConwayEra` TextEnvelope form from
#67. The entry stores normalized hexadecimal CBOR and updates completeness
without implementing CBOR, signature, or ledger semantics in the host domain.

**Independent Test**: Add the same synthetic witness as raw hex and as a
TextEnvelope, verify identical stored bytes and completeness, and exercise
non-required, duplicate, replacement, wrong-envelope, and terminal-state
failures.

**Acceptance Scenarios**:

1. **Given** a required signer and raw witness CBOR, **when** the witness is
   collected, **then** normalized CBOR is stored against that signer.
2. **Given** the same witness in a `TxWitness ConwayEra` envelope, **when** it
   is collected, **then** the same normalized CBOR is stored.
3. **Given** a `Tx ConwayEra` envelope, malformed hexadecimal input, or a
   signer outside the roster, **when** collection is attempted, **then** a
   deterministic error is returned and the entry is unchanged.
4. **Given** an already-collected signer, **when** replacement is disabled,
   **then** collection fails; when replacement is explicitly enabled, the
   witness bytes are replaced without duplicating the signer.
5. **Given** an entry whose persisted status is expired/submitted or whose
   invalid-after slot has been reached, **when** collection is attempted,
   **then** the terminal entry cannot be mutated.

### User Story 3 — Swap persistence and coordination adapters (Priority: P1)

A later host can inject persistence and coordination implementations through
record-of-operations ports while depending only on shared domain values.

**Independent Test**: Instantiate both polymorphic port records with an
in-memory/no-op test algebra and exercise every operation through its public
type.

**Acceptance Scenarios**:

1. **Given** an `EntryStore` implementation, **when** a host puts, looks up,
   and lists entries, **then** it uses a host-neutral port with no concrete
   persistence dependency.
2. **Given** a coordination implementation, **when** a host publishes or
   fetches an entry or publishes a collected witness, **then** the seam uses
   the same shared values and has no cardano-multisig-specific wire or service
   type.

## Functional requirements

- **FR-001**: The shared library MUST expose `TxEntry`, entry identifier,
  signer identifier, collected witness, completeness, and lifecycle status
  types under the `Cardano.Transaction.Entry` namespace.
- **FR-002**: `TxEntry` MUST contain unsigned transaction CBOR hexadecimal
  text, an ordered required-signer roster, collected witnesses, an
  invalid-after slot, and one of open, complete, expired, or submitted status.
- **FR-003**: Completeness MUST derive required, satisfied, and missing signers
  deterministically in required-roster order and report whether the roster is
  complete.
- **FR-004**: Status derivation MUST preserve submitted/expired terminal states,
  expire live entries at the invalid-after boundary, and otherwise derive
  complete versus open from signer completeness.
- **FR-005**: Witness collection MUST accept raw hexadecimal CBOR and
  `TxWitness ConwayEra` TextEnvelope input by consuming #67's
  `Cardano.Transaction.Witness.decodeWitnessInput` function.
- **FR-006**: Witness collection MUST normalize stored witness data to CBOR
  hexadecimal text and MUST reject transaction envelopes, malformed input,
  non-required signers, unapproved duplicate replacement, and terminal-entry
  mutation.
- **FR-007**: The shared library MUST NOT parse witness CBOR, derive signer
  hashes, verify signatures, attach ledger witnesses, or provide any host-side
  Cardano semantic fallback; callers supply the engine-derived signer identity.
- **FR-008**: `EntryStore` MUST be a polymorphic record of operations for
  putting, looking up, and listing entries, with no concrete backend and no
  browser, filesystem, or database dependency.
- **FR-009**: The coordination port MUST be a polymorphic record of operations
  for publishing and fetching entries and publishing collected witnesses, with
  no concrete transport or cardano-multisig service dependency.
- **FR-010**: Direct tests MUST cover completeness partitions, lifecycle
  precedence and expiry boundary, raw/TextEnvelope witness parity, collection
  safety failures, and instantiation of every port operation.
- **FR-011**: All new domain and port code MUST be pure/host-neutral and MUST
  require no manifest, browser API, provider, network, storage, or engine
  change.

## Success criteria

- **SC-001**: Direct tests produce zero mismatches for empty, partial, and full
  signer rosters while preserving required-roster order.
- **SC-002**: Direct tests produce exactly open, complete, expired, or submitted
  for all lifecycle precedence and boundary cases.
- **SC-003**: Raw and enveloped representations of the same witness produce the
  same stored CBOR and signer completeness.
- **SC-004**: The store and coordination records compile and every operation is
  exercised through a host-neutral test implementation.
- **SC-005**: `./gate.sh` and fresh GitHub Actions both pass on the final pushed
  SHA before the PR is declared complete.

## Assumptions

- Entry and signer identifiers are opaque textual values at this layer. Their
  ledger derivation belongs to the existing pinned engine boundary.
- `invalidAfterSlot` follows Cardano's exclusive upper-bound convention: an
  entry is expired when `currentSlot >= invalidAfterSlot`.
- Roster order is presentation-relevant and retained; collected witnesses are
  keyed by the engine-derived signer identifier.
- Submitted and expired are terminal states. A complete entry may accept an
  explicitly authorized replacement witness without changing its status.
- Concrete IndexedDB persistence belongs to #76 and provider submission belongs
  to #77.

## Out of scope

- IndexedDB, browser storage, filesystem storage, database schemas, migrations,
  or any concrete `EntryStore` adapter.
- Provider HTTP, submission, receipts, or submission retry behavior.
- UI rendering, CLI parsing, Node exports, or host wiring.
- A cardano-multisig client, wire protocol, authentication, polling, or remote
  service implementation.
- Host-side CBOR decoding, witness signature verification, signer-hash
  derivation, ledger witness attachment, cryptography, RDF, or fallback
  semantics.
