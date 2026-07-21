# Feature Specification: Provider Submission for Completed Entries

**Feature Branch**: `feat/77-provider-submit`

**Created**: 2026-07-21

**Status**: Draft

**Input**: Issue #77, parent #66, release epic #74, merged dependencies #10
and #75, and concurrent browser-adapter ticket #76

## P1 user story

As a Cardano Swiss Knife host, I can explicitly submit a fully witnessed,
unexpired transaction entry through the same configured Blockfrost or Koios
provider used for transaction lookup, while incomplete entries fail closed
before any provider request is attempted.

## User scenarios and testing

### User Story 1 — Submit through the shared provider core (Priority: P1)

A host supplies a `TxEntry`, the current slot, and engine-assembled signed
transaction CBOR to one shared operation. The operation consumes #75's
completeness/lifecycle derivation, rejects every state except complete, sends
raw CBOR bytes through #10's selected provider transport, and returns a typed
receipt containing the provider transaction id and the entry transitioned to
submitted.

**Independent Test**: Inject a recording transport into the shared PureScript
provider module and prove exact Blockfrost/Koios request contracts, response
decoding, receipt/status transition, and pre-transport rejection.

**Acceptance Scenarios**:

1. **Given** a complete live entry and signed transaction CBOR, **when**
   Blockfrost is selected, **then** the shared transport sends `POST
   /tx/submit` with `project_id`, `Content-Type: application/cbor`, and the raw
   CBOR bytes represented by the supplied hex.
2. **Given** the same entry and Koios, **when** submission runs, **then** the
   shared transport sends `POST /submittx` with the existing optional bearer
   authentication policy, the CBOR content type, and the same bytes.
3. **Given** a provider success containing a 64-character hexadecimal
   transaction id, **when** it is decoded, **then** the receipt retains that id
   and returns the same entry with terminal `Submitted` status.
4. **Given** an incomplete, expired, or already-submitted entry, **when**
   submission is requested, **then** a deterministic entry error is returned
   before transport or credential handling.
5. **Given** malformed signed-CBOR hex, a rejected provider request, malformed
   receipt JSON, or an invalid transaction id, **when** submission runs,
   **then** it fails with the shared typed error surface and never invents a
   receipt.

### User Story 2 — Consume one operation from Node and CLI (Priority: P1)

Node callers and CLI operators can pass a completed entry plus signed
transaction CBOR, provider, network, and provider credential source through
thin host adapters. Endpoint selection, authentication, binary encoding,
receipt decoding, and completeness policy remain entirely in the shared
PureScript operation.

**Independent Test**: Exercise the packed Node artifact with intercepted
`fetch` for both providers and the CLI with fixture entry/transaction files;
verify request routing, coded failures, JSON output, and secret redaction.

**Acceptance Scenarios**:

1. **Given** a JSON-compatible completed entry and signed CBOR, **when** the
   Node API submits it, **then** it resolves to the existing non-throwing
   `CskResult` shape with a submission receipt.
2. **Given** the same files and explicit `csk tx submit`, **when** the operator
   confirms the command, **then** the CLI delegates through the Node adapter
   and renders either the receipt or a coded failure.
3. **Given** Blockfrost, **when** the CLI needs a project id, **then** it uses
   the established vault/secret path; credentials never enter command
   arguments, output, errors, or receipts.
4. **Given** incomplete entry input, **when** either host invokes submission,
   **then** no intercepted provider request occurs.

### User Story 3 — Submit explicitly from the workbench (Priority: P1)

Once #76's entry-driven workbench exists, a user sees a submission action only
for the active complete, unexpired entry. Submission is separate from witness
attachment, requires an explicit confirmation, uses the current provider
selection, and persists the returned submitted entry only after provider
acceptance.

**Independent Test**: Build on #76's committed entry-list/action structure and
run a browser test that cancels confirmation, rejects incomplete entries
without network traffic, and accepts a complete entry through intercepted
provider submission with the persisted status becoming submitted.

**Acceptance Scenarios**:

1. **Given** an incomplete or expired active entry, **when** the workbench is
   rendered, **then** submission is unavailable and no attach action can
   implicitly submit.
2. **Given** a complete active entry, **when** submit is selected, **then** a
   confirmation names the provider/network and cancellation performs no
   request or state change.
3. **Given** confirmation and a successful provider receipt, **when** the
   operation finishes, **then** the receipt is shown and the `EntryStore`
   persists the returned `Submitted` entry.
4. **Given** a provider failure, **when** submission finishes, **then** the
   entry remains complete, the actionable shared error is shown, and retry is
   still explicit.

## Functional requirements

- **FR-001**: `Cardano.Provider` MUST expose one provider-neutral submit
  operation and injectable-transport variant that consume the existing
  `Provider`, `Network`, credential, and `Transport` abstractions.
- **FR-002**: Submission MUST accept a #75 `TxEntry`, caller-supplied current
  slot, and signed transaction CBOR hex assembled by the authoritative ledger
  engine; it MUST NOT attach witnesses or implement transaction semantics.
- **FR-003**: Submission MUST call #75's lifecycle/completeness derivation and
  MUST reject incomplete, expired, and already-submitted entries before
  invoking transport.
- **FR-004**: Blockfrost submission MUST use `POST <network-base>/tx/submit`,
  `project_id`, `Content-Type: application/cbor`, and raw decoded CBOR bytes.
- **FR-005**: Koios submission MUST use `POST <network-base>/submittx`, the
  existing optional bearer-token policy, `Content-Type: application/cbor`, and
  the same raw decoded CBOR bytes.
- **FR-006**: A successful provider response MUST decode a JSON string
  containing exactly 64 hexadecimal characters and return a receipt with the
  transaction id and the input entry transitioned to terminal `Submitted`.
- **FR-007**: Malformed input hex, provider rejection, malformed success JSON,
  and invalid transaction ids MUST fail through deterministic shared errors;
  credential material MUST be redacted from every rendered error.
- **FR-008**: Provider endpoint/auth/request/response policy MUST remain only
  in `lib/src/Cardano/Provider.*`; WebUI, Node, and CLI code MUST delegate and
  the architecture-boundary gate MUST continue to reject duplicates.
- **FR-009**: The Node API MUST expose a typed, non-throwing submission result,
  and the CLI MUST expose an explicit submit command using file input and the
  established secret-source contract, without adding a second provider
  implementation.
- **FR-010**: The workbench action MUST be separate from attach, unavailable
  for non-complete entries, confirmation-gated, and persist `Submitted` only
  after provider acceptance.
- **FR-011**: Workbench integration MUST consume #76's actual merged UI/store
  shape. This ticket MUST NOT guess or pre-create a competing entry list,
  action area, IndexedDB adapter, or storage schema.
- **FR-012**: Tests MUST prove both provider wire contracts, fail-closed
  pre-transport gating, receipt/status behavior, host delegation, confirmation
  cancellation, persistence on success only, provider failures, and credential
  redaction.

## Success criteria

- **SC-001**: Direct shared tests observe zero transport calls for incomplete,
  expired, submitted, and malformed-hex cases.
- **SC-002**: Direct tests observe the exact endpoint, method, headers, and
  body hex for all six provider/network combinations and accept the documented
  Blockfrost 200 and Koios 202 success statuses.
- **SC-003**: Packed Node and CLI contract tests prove both hosts route through
  the shared operation and preserve the repository's coded-result and secret
  handling contracts.
- **SC-004**: Browser tests prove cancel/no-request, fail-closed incomplete
  behavior, successful receipt rendering, and submitted-state persistence on
  top of #76's workbench.
- **SC-005**: A safe live-boundary smoke reaches both real submit endpoints
  with intentionally invalid CBOR, observes rejection (never acceptance), and
  records redacted output without using a real transaction or credential.
- **SC-006**: `./gate.sh` and fresh GitHub Actions both pass on the exact final
  pushed SHA before the PR is declared complete.

## Assumptions

- The caller uses the pinned ledger engine to assemble the signed transaction
  CBOR from the entry's unsigned transaction and collected witnesses. The
  provider layer validates hexadecimal encoding but cannot claim semantic
  correspondence between that byte string and the entry.
- `currentSlot` comes from the host's existing provider/inspection context.
  The shared operation owns lifecycle gating, not slot acquisition.
- Both current official provider contracts accept raw binary serialized CBOR:
  Blockfrost `POST /tx/submit` returns 200 and Koios `POST /submittx` returns
  202; both return a JSON transaction-id string.
- A deliberately invalid short CBOR payload is safe for the live-boundary
  smoke because it cannot be accepted as a transaction. Blockfrost is tested
  with a non-secret invalid project id and Koios without a bearer token.
- #76 owns the workbench and IndexedDB shape. Its committed integration point
  is a hard dependency only for the final browser slice, not for the shared or
  Node/CLI slices.

## Out of scope

- N2C, local-node, wallet-extension, cardano-submit-api, or any provider beyond
  Blockfrost and Koios.
- Automatic submission after witness attachment, background retries, mempool
  polling, confirmation tracking, rollback handling, or chain inclusion
  status.
- Reimplementing CBOR, transaction assembly, ledger validation, hashing,
  signature verification, cryptography, RDF, SPARQL, or SHACL in a host.
- A new persistence or coordination adapter, entry schema redesign, remote
  cardano-multisig service, or guessed #76 UI/storage implementation.
- Real-funds CI submission or storing provider credentials in fixtures,
  environment variables, command arguments, logs, or repository files.
