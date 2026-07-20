# Inspectable transaction inputs — issue #64

**Feature Branch**: `feat/64-input-reference-resolution`
**Created**: 2026-07-20
**Status**: Draft
**Input**: Resolve transaction inputs and reference inputs through the selected
provider so operators can inspect the spent/referenced output and continue into
its producing transaction.

## User Scenarios & Testing

### User Story 1 — Inspect what an input spends or references (Priority: P1)

As an operator reviewing a transaction with provider context, I can see the
resolved output address and complete value for each regular and reference input
in both Structure and Witness, rather than only a bare `txId#index`.

**Independent Test**: Decode a representative transaction while Blockfrost or
Koios producer-CBOR requests are mocked at the shared provider boundary, then
assert that both tabs show the input reference, full address, lovelace, and all
native-asset quantities returned by the ledger engine.

**Acceptance Scenarios**:

1. **Given** a regular input whose producer transaction resolves, **when** the
   result opens in Structure or Witness, **then** its reference, address,
   lovelace, and every native asset are visible and copyable without consulting
   a second provider implementation.
2. **Given** a reference input whose producer transaction resolves, **when**
   either tab is viewed, **then** the same output context is available and the
   row remains visibly classified as a reference input.
3. **Given** multiple inputs from one producer transaction, **when** resolution
   runs, **then** the producer CBOR is fetched once and each requested output
   index is rendered from the authoritative engine result.

### User Story 2 — Drill into the producer (Priority: P1)

As an operator following transaction provenance, I can activate a resolved
input's producing transaction and inspect it using the current provider and
network settings.

**Independent Test**: Activate the producing-transaction control from a
resolved input, observe a provider request for that exact transaction hash,
and verify the loaded transaction identity changes to the producer.

**Acceptance Scenarios**:

1. **Given** a resolved input, **when** the operator chooses to inspect its
   producer, **then** the inspector loads that transaction hash through the
   selected shared provider while preserving provider/network configuration.
2. **Given** an unresolved input, **when** it is rendered, **then** the raw
   reference and truthful unavailable reason remain visible without fabricated
   address or value data.

### Edge Cases

- Regular inputs and reference inputs that share a producer transaction reuse
  one producer-CBOR fetch.
- Multi-asset values preserve policy id, asset name, and signed quantity; an
  empty native-asset map is shown truthfully rather than omitted ambiguously.
- Long addresses and identifiers remain available in full through copy/title
  affordances even if visual text is compacted.
- Missing credentials, partial provider failure, malformed producer CBOR, and
  out-of-range output indexes retain the input reference and engine/provider
  diagnostic.
- Local raw-CBOR inspection without usable provider context remains functional
  and does not imply that input context was resolved.

## Requirements

### Functional Requirements

- **FR-001**: The WebUI MUST obtain producer transactions only through
  `Cardano.Provider` and the selected Blockfrost/Koios configuration.
- **FR-002**: The host MUST pass producer CBOR into the version-pinned ledger
  engine and MUST render only the engine's resolved input output data.
- **FR-003**: Regular and reference inputs MUST expose their full transaction
  output reference, resolution status, source address, lovelace, and complete
  native-asset value when available.
- **FR-004**: Resolved input context MUST be visible in both Structure and
  Witness and MUST distinguish regular from reference inputs.
- **FR-005**: Full addresses, output references, policy ids, asset names, and
  quantities MUST remain copyable or otherwise recoverable without truncation.
- **FR-006**: A resolved input MUST offer an in-product action that loads the
  producing transaction using the current provider and network.
- **FR-007**: The provider implementation MUST deduplicate producer transaction
  hashes and MUST NOT add direct `/utxos` calls or host-side ledger decoding.
- **FR-008**: Partial and total resolution failures MUST preserve raw input
  references and render truthful unavailable diagnostics.
- **FR-009**: Browser regression proof MUST cover regular and reference input
  presentation, complete value details, producer drill-in, provider selection,
  deduplicated requests, and the absence of a parallel UTxO endpoint.

### Key Entities

- **Transaction input**: A regular or reference `txId#index` consumed by the
  inspected transaction.
- **Resolved input**: The authoritative ledger-engine result pairing an input
  reference with its producing transaction output or a missing reason.
- **Producing transaction**: The transaction whose indexed output is spent or
  referenced by the inspected transaction.
- **Resolved value**: Lovelace plus the complete policy/asset/quantity map from
  the producing output.

## Success Criteria

- **SC-001**: The focused browser journey renders the expected full address,
  lovelace, and every fixture asset for regular and reference inputs in both
  Structure and Witness with zero missing fields.
- **SC-002**: Activating producer drill-in requests and loads the exact 64-byte
  producer transaction id while retaining provider/network selection.
- **SC-003**: The journey observes one producer-CBOR request per unique producer
  hash and zero provider `/utxos` requests.
- **SC-004**: Missing-context coverage shows raw references and diagnostics
  without any fabricated resolved value.
- **SC-005**: The complete repository gate exits with zero failures.

## Assumptions

- The merged #10 provider core is the sole Blockfrost/Koios IO boundary and
  already supplies producer CBOR to ledger operations.
- The ledger engine's `resolved_inputs` and `resolved_reference_inputs`
  structures are authoritative for `tx_out.address_hex`, `coin_lovelace`, and
  `assets`.
- In-product drill-in satisfies the issue's “drill in (or link out)” request;
  no external explorer dependency is required.

## Non-goals

- Querying live unspent status, adding providers, or calling provider-specific
  UTxO endpoints.
- Implementing CBOR, address, value, or ledger semantics in JavaScript or
  PureScript host code.
- Changing validation semantics, metadata decoding, vaults, CLI/Node APIs,
  witness mutation, submission, or sibling-lane surfaces.
