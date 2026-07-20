# Decoded auxiliary metadata in Structure — issue #65

**Feature Branch**: `feat/65-metadata-rendering`
**Created**: 2026-07-20
**Status**: Draft
**Input**: Render the ledger engine's decoded auxiliary metadata map as a
readable recursive value tree in Structure.

## User Scenarios & Testing

### User Story 1 — Read the transaction's stated rationale (Priority: P1)

As a transaction signer, I can expand auxiliary metadata in Structure and read
each metadata label and its complete value tree, so operator-facing descriptions,
justifications, and references are visible without inspecting raw CBOR.

**Independent Test**: Decode the committed Amaru treasury transaction fixture,
open Structure, and verify that metadata label `1694` and its human-readable
rationale fields are visible below `auxiliary_data.metadata` rather than only a
label count.

**Acceptance Scenarios**:

1. **Given** a transaction with auxiliary metadata, **when** Structure is
   expanded, **then** every metadata label and its decoded value tree is visible.
2. **Given** treasury metadata containing a description, justification, or
   reference, **when** a signer reviews Structure, **then** the exact text is
   readable without opening raw JSON or CBOR.
3. **Given** a transaction without auxiliary metadata, **when** Structure is
   rendered, **then** the existing truthful empty/absent presentation remains
   intact and no value is fabricated.

### User Story 2 — Preserve every ledger metadata shape (Priority: P1)

As an advanced reviewer, I can distinguish integers, bytes, text, lists, and
maps and inspect nested values in their original order, so unusual metadata is
not collapsed or silently changed by the host.

**Independent Test**: Decode a committed fixture containing all five metadata
constructors, including a negative/large integer, bytes, nested lists, and a map
with non-text or duplicate keys; assert the recursive Structure presentation
retains the exact strings and entry order.

**Acceptance Scenarios**:

1. **Given** `int`, `bytes`, or `text` metadata, **when** rendered, **then** its
   constructor and exact string/hex value are recoverable without numeric
   coercion or byte re-encoding.
2. **Given** nested `list` metadata, **when** expanded, **then** items appear in
   engine order and recursively expose their constructors and values.
3. **Given** `map` metadata with non-text or duplicate keys, **when** expanded,
   **then** each ordered key/value entry is rendered independently rather than
   collapsed into a JavaScript object.

## Requirements

### Functional Requirements

- **FR-001**: The WebUI MUST consume `result.intent.auxiliary_data.metadata`
  from the version-pinned `cardano-ledger-inspector` `tx.intent` response.
- **FR-002**: The engine input MUST be updated to a revision containing merged
  `cardano-ledger-inspector#160` before typed metadata is consumed.
- **FR-003**: The host MUST NOT decode transaction metadata CBOR or infer
  Cardano metadata semantics in JavaScript or PureScript.
- **FR-004**: Structure MUST render each metadata label and recursively render
  the engine's `int`, `bytes`, `text`, `list`, and `map` tagged values.
- **FR-005**: Decimal labels and integer values MUST remain strings; byte values
  MUST remain the engine-provided lowercase hexadecimal string.
- **FR-006**: Lists and map entries MUST retain engine order; maps MUST retain
  recursive keys and values so non-text and duplicate keys remain distinct.
- **FR-007**: Metadata content MUST be presented as self-declared transaction
  data and MUST NOT be represented as independently verified fact.
- **FR-008**: Missing, malformed, or empty typed metadata MUST fail softly at
  the presentation boundary without breaking the rest of transaction inspection.
- **FR-009**: Browser regression proof MUST cover the Amaru rationale, every
  tagged constructor, recursive nesting, exact scalar strings, and ordered map
  entries.

### Key Entities

- **Metadata entry**: A decimal label string paired with one typed metadata
  value returned by the engine.
- **Metadata value**: The recursive tagged union `int | bytes | text | list |
  map` defined by the engine contract.
- **Map entry**: One ordered recursive key/value pair; it is not a JSON object
  property and may repeat an earlier key.

## Success Criteria

- **SC-001**: The focused treasury journey visibly renders label `1694` and the
  fixture's exact operator-facing rationale in Structure.
- **SC-002**: The all-types journey visibly distinguishes all five constructors
  and retains every asserted scalar value and nesting relationship.
- **SC-003**: Ordered-map assertions demonstrate that duplicate/non-text keys
  survive as separate rendered entries.
- **SC-004**: Existing no-metadata inspection behavior remains green.
- **SC-005**: The complete repository gate exits with zero failures.

## Assumptions

- Merged engine PR `cardano-ledger-inspector#161` is authoritative and exposes
  typed metadata at `result.intent.auxiliary_data.metadata`.
- The existing `tx.intent` operation already runs during every successful
  transaction decode, so no new engine invocation or provider request is needed.
- The existing Structure tab is the required product surface; Witness claims
  remain a compatibility summary and are not a replacement for the full tree.

## Non-goals

- Decoding CBOR, validating metadata schemas, or assigning trust to claims in
  host code.
- Converting maps into JSON objects, sorting engine arrays, or normalizing
  integers/bytes beyond presentation.
- Changing provider IO, transaction validation, witness flows, RDF semantics,
  CLI/Node APIs, vaults, or sibling ticket #71.
