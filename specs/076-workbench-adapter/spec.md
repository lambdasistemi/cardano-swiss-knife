# Feature Specification: IndexedDB Transaction Workbench

**Feature Branch**: `feat/76-workbench-adapter`

**Created**: 2026-07-21

**Status**: Draft

**Input**: Issue #76, parent #66, release epic #74, merged #75 and #67,
and concurrent child #77

## P1 user story

As a browser operator, I can keep several unsigned Cardano transactions in a
durable workbench, move between them without losing collected witnesses, and
see exactly which required signers are satisfied or missing before I hand a
complete entry to a later submission action.

## User scenarios and testing

### User Story 1 — Persist transaction entries in the browser (Priority: P1)

The WebUI supplies #75's `EntryStore Aff` port with an IndexedDB adapter. An
entry written in one page lifetime can be listed and looked up after reload,
including its unsigned CBOR, signer roster, collected witnesses, expiry, and
status. Multiple entries remain independent.

**Independent Test**: Exercise put, overwrite, lookup, list, missing lookup,
schema upgrade, and reopen behavior against a deterministic IndexedDB test
double, then prove reload persistence in Playwright against a real browser.

**Acceptance Scenarios**:

1. **Given** an empty browser database, **when** an entry is put, **then** it
   can be looked up by `entryId` and appears exactly once in the list.
2. **Given** an existing entry, **when** the same `entryId` is put again,
   **then** the stored value is replaced rather than duplicated.
3. **Given** two different entries, **when** the store is reopened, **then**
   both round-trip with domain status and witness data intact.
4. **Given** an unknown id, **when** it is looked up, **then** the port returns
   `Nothing` rather than throwing or inventing a value.
5. **Given** an IndexedDB failure or malformed persisted record, **when** an
   operation runs, **then** the Aff fails visibly and the UI reports the error.

### User Story 2 — Manage and inspect multiple entries (Priority: P1)

The workbench loads the durable entry list at startup. The operator can decode
an unsigned transaction, add an engine-derived entry, and switch among saved
entries. Selecting an entry loads its unsigned transaction into the existing
inspection surface; the inspector consumes selected entry state and no longer
defines the durable workbench truth.

**Independent Test**: Create two entries from two decoded transactions, switch
between their list rows, reload, and assert that selection drives the inspector
while both entries remain present.

**Acceptance Scenarios**:

1. **Given** a decoded transaction with an engine body hash, required-signer
   plan, and finite `invalid_hereafter`, **when** it is added, **then** those
   authoritative engine values seed a new #75 `TxEntry` with no host-side CBOR
   interpretation.
2. **Given** a transaction without a finite invalid-after slot, **when** add is
   requested, **then** the workbench explains that #75 requires an expiry and
   does not persist a fabricated sentinel.
3. **Given** several saved entries, **when** one is selected, **then** the list
   marks it active and the existing inspector decodes that entry's unsigned
   transaction.
4. **Given** a page reload, **when** initialization completes, **then** saved
   entries return and the last explicit selection is not required for data
   recovery.
5. **Given** #77 adds a submission control later, **when** it integrates,
   **then** it can target the selected entry through the dedicated workbench
   module without redefining this ticket's state or persistence.

### User Story 3 — Produce and attach interoperable witnesses (Priority: P1)

For a selected entry, the operator sees required, satisfied, and missing
signers from #75. They can produce a detached witness using an unlocked local
vault signing key, or attach a pasted witness in raw CBOR or exact
`TxWitness ConwayEra` TextEnvelope form. Successful collection is persisted
and completeness updates independently for every entry.

**Independent Test**: Produce one missing signer from a vault key, attach a
second signer as raw CBOR and as a TextEnvelope in equivalent runs, switch
entries and reload, and verify the exact required/satisfied/missing partitions.

**Acceptance Scenarios**:

1. **Given** an unlocked compatible vault key for a missing signer, **when**
   produce witness runs, **then** the shared WASM-backed signing path creates a
   detached witness, #75 collects it for the engine-derived signer hash, and
   raw plus TextEnvelope exports are shown.
2. **Given** raw or enveloped pasted witness input, **when** the engine confirms
   it satisfies the selected missing signer, **then** #67 normalizes the input
   and #75 collects the normalized witness.
3. **Given** a wrong envelope, malformed CBOR, unrelated signer, duplicate
   without replacement, or engine rejection, **when** attach runs, **then** the
   entry is unchanged and a specific error is visible.
4. **Given** the final missing signer, **when** collection succeeds, **then**
   completeness becomes complete and the updated entry survives reload.
5. **Given** multiple entries, **when** one entry collects a witness, **then**
   no other entry's signer or witness state changes.

## Functional requirements

- **FR-001**: The browser adapter MUST implement #75's existing
  `EntryStore Aff` record; it MUST NOT redefine `TxEntry`, completeness, status,
  or witness-collection rules.
- **FR-002**: IndexedDB MUST be the durable backend, with a versioned database,
  one object store keyed by `entryId`, idempotent upgrade creation, overwrite
  semantics, deterministic list order, and explicit request/transaction errors.
- **FR-003**: The adapter MUST encode/decode every #75 entry field explicitly,
  including all `EntryStatus` constructors and collected witness records.
- **FR-004**: The app MUST load stored entries on initialization and MUST
  persist each successful creation or witness mutation before claiming success.
- **FR-005**: Entry creation MUST use engine response data for transaction id,
  required signer hashes, and `invalid_hereafter`; it MUST reject missing or
  invalid engine fields rather than parsing CBOR in the browser or inventing a
  fallback expiry.
- **FR-006**: The UI MUST support at least two concurrent entries, an active
  entry list/switcher, and an explicit add-current-transaction action.
- **FR-007**: Selecting an entry MUST drive the existing inspect view from that
  entry's `unsignedTxCborHex`; inspection state MUST NOT replace the durable
  entry state.
- **FR-008**: The UI MUST display #75's derived required, satisfied, and missing
  signer lists and complete/incomplete result per selected entry.
- **FR-009**: Local witness production MUST reuse the existing shared
  WASM-backed `TxSigning.prepareWitness` path and bind collection to its
  engine-derived `signerHashHex`.
- **FR-010**: Pasted witness attachment MUST accept raw and
  `TxWitness ConwayEra` input through #67, validate signer relevance through
  the ledger engine, and call #75's `collectWitness`; it MUST NOT derive signer
  identity by decoding CBOR in JavaScript/PureScript.
- **FR-011**: Duplicate replacement MUST remain explicit, and any failed
  signing, decoding, engine validation, domain collection, or persistence step
  MUST leave the previous stored entry unchanged.
- **FR-012**: Produced witnesses MUST expose both normalized raw CBOR and the
  exact #67 TextEnvelope representation.
- **FR-013**: The browser adapter and workbench MUST add no npm dependency and
  MUST keep cryptography, ledger semantics, CBOR interpretation, and RDF out of
  host code.
- **FR-014**: Provider submission, receipts, confirmation UI, and provider
  transport belong to #77 and MUST NOT be implemented here.
- **FR-015**: Direct adapter tests and browser tests MUST cover persistence,
  switching, raw/enveloped attachment parity, vault production, completeness,
  isolation, errors, and reload behavior.

## Success criteria

- **SC-001**: Store contract tests complete with zero mismatches for create,
  replace, lookup, list, reopen, missing id, and failure cases.
- **SC-002**: Playwright creates and reloads at least two entries and switches
  the inspector between them without data loss.
- **SC-003**: Raw and enveloped versions of the same detached witness yield the
  same persisted signer/witness value.
- **SC-004**: A two-signer entry moves from 0/2 to 1/2 to 2/2 and remains 2/2
  after reload, while a sibling entry is unchanged.
- **SC-005**: `./gate.sh` and fresh GitHub Actions both pass on the final pushed
  SHA before the PR is declared complete.

## Assumptions

- The workbench stores finite-TTL transactions because #75's domain requires an
  `Int` invalid-after slot; unbounded transactions are rejected rather than
  represented with a magic maximum.
- Existing engine responses are the authority for body hash, signer roster,
  validity interval, signer relevance, and witness attachment safety.
- Vault entries are available in memory only after the operator explicitly
  unlocks/imports the vault through the existing flow.
- Deletion and provider submission are not required for this first durable
  workbench slice.

## Out of scope

- Any change to #75's shared domain or ports.
- Blockfrost/Koios submission, confirmation, retry, or submitted-state wiring.
- CLI/Node storage adapters or public surfaces.
- Host-side CBOR, ledger, crypto, signer-hash, signature, or RDF fallback.
- A remote coordination service or cardano-multisig protocol.
