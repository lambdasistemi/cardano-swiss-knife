# Address-first decoded-tree labeling — issue #61

**Feature Branch**: `fix/61-address-label-view`
**Created**: 2026-07-19
**Status**: Draft
**Input**: Give decoded transaction addresses their own first-class display and
edit path instead of leaving a payment credential or raw identifier as the
only operator-facing identity.

## User Scenarios & Testing

### User Story 1 — Label a known address by its reusable form (Priority: P1)

As an operator reviewing a decoded transaction, I can recognize and label an
output by its Cardano address, then see that label resolve wherever the same
address appears again.

**Why this priority**: Addresses are the identifiers operators exchange and
recognize in day-to-day workflows. A credential hash or raw encoding alone is
not enough to confirm which wallet or destination is being labeled.

**Independent Test**: Decode the repository's known-address transaction
fixture, locate an Address row in Structure, save a label from that row, and
verify the exported/reloaded local book resolves the same address.

**Acceptance Scenarios**:

1. **Given** a decoded transaction output with a known Cardano address, **when**
   the operator views its Address row, **then** the reusable address form is
   presented as the primary identifier and the existing raw or credential
   identity remains available as secondary evidence.
2. **Given** that Address row, **when** the operator opens `Label this node`,
   **then** the edit path identifies the address being labeled rather than
   presenting only the raw or credential identifier.
3. **Given** a label saved from the Address row, **when** the selected local
   book is inspected and later reloaded, **then** it stores and resolves the
   label through the reusable address form.

### Edge Cases

- If a decoded address row has no reusable address form, the existing raw view
  remains available and the UI must not invent or derive an address.
- If a label is already resolved, the resolved name must not hide the reusable
  address needed to verify what matched.
- Repeated appearances of the same address must use the same address identity;
  no transaction-scoped identifier may replace it.

## Requirements

### Functional Requirements

- **FR-001**: Structure MUST present an available reusable Cardano address as
  the primary identity for an Address row.
- **FR-002**: Structure MUST retain the existing payment-credential or raw
  identity where it is already available, without making it the only view.
- **FR-003**: The decoded-tree label editor MUST visibly identify the reusable
  address that will receive the label.
- **FR-004**: Saving an address label MUST bind it to the reusable address form
  already supplied by the decoded transaction graph.
- **FR-005**: A resolved address label MUST leave the matched address available
  for operator verification.
- **FR-006**: Browser regression proof MUST cover display, edit, save, immediate
  resolution, export, and reload for a known-address transaction node.
- **FR-007**: The change MUST preserve current labeling for non-address rows and
  MUST NOT implement the #63 bookability restriction.
- **FR-008**: The WebUI MUST consume the existing authoritative decoded address
  data and MUST NOT add host-side Cardano address derivation or parsing.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In the known-address browser journey, the address form is visible
  before editing, while editing, and after the saved label resolves.
- **SC-002**: The same journey verifies one secondary raw or credential value
  remains visible and copyable.
- **SC-003**: The generated local book contains the known address binding and a
  clean browser context resolves the saved label after import.
- **SC-004**: The complete repository gate exits with zero failures.

## Assumptions

- The decoded RDF projection already supplies both the reusable address form
  and the existing raw/credential-oriented identity to the WebUI.
- `Label this node` remains broadly available until #63 introduces its separate
  bookable-identifier decision.
- Existing local-book persistence and Turtle generation remain the storage
  mechanism; #62 owns serialization deduplication.

## Non-goals

- Restricting which decoded nodes can be labeled (#63).
- Changing Turtle prefix merge/deduplication (#62).
- Moving provider, capability, or address semantics into a shared core (#10).
- Changing engine semantics, transaction storage, witness, submission, CLI,
  Node, vault, or release behavior.
