# Bookable decoded-tree identifiers — issue #63

**Feature Branch**: `feat/63-bookable-identifier-restriction`
**Created**: 2026-07-20
**Status**: Draft
**Input**: Restrict `Label this node` to reusable identifiers that can
meaningfully recur across transactions: credential keys, scripts, and
addresses.

## User Scenarios & Testing

### User Story 1 — See labeling only where a book can match again (Priority: P1)

As an operator reviewing a decoded transaction, I see `Label this node` only
on reusable identities whose labels can resolve in later transactions, so the
Structure view does not invite me to create dead one-off book entries.

**Why this priority**: The current action appears on transaction hashes,
transaction output references, output nodes, datum hashes, and other values
that are scoped to a single transaction. Those entries add noise and cannot
deliver the reusable annotation value promised by books.

**Independent Test**: Decode the representative Conway fixture, expand the
Structure tree, and verify that address and credential-key rows retain the
label action while transaction-scoped hash, output, reference, index, datum,
and raw-payload rows do not expose it.

**Acceptance Scenarios**:

1. **Given** a decoded address, credential key, or script identifier with an
   available annotation identity and no resolved label, **when** the operator
   views its Structure row, **then** `Label this node` is available.
2. **Given** a transaction hash, transaction input/output reference, output
   identity or index, auxiliary-data hash, script-data hash, datum/redeemer
   hash, or raw transaction payload, **when** the operator views its Structure
   row, **then** `Label this node` is absent.
3. **Given** any reusable identifier that already resolves through the selected
   books, **when** the operator views it, **then** the resolved label remains
   visible and no duplicate label action is offered.

### User Story 2 — Reuse one classification across hosts (Priority: P2)

As a maintainer extending another host, I can apply the same bookable-identifier
classification without depending on browser state or presentation code.

**Why this priority**: Bookability is identifier-domain policy, while the
button that invokes editing belongs only to the WebUI. Keeping that boundary
prevents future hosts from inventing conflicting rules.

**Independent Test**: Exercise the classification directly with representative
bookable and non-bookable identifier types, then verify the WebUI action follows
that same result.

**Acceptance Scenarios**:

1. **Given** the supported identifier-type vocabulary, **when** bookability is
   evaluated outside the WebUI, **then** only reusable credential-key, script,
   and address types are accepted.
2. **Given** a future non-browser host, **when** it needs to decide whether an
   identifier belongs in a book, **then** it can consume the classification
   without importing WebUI behavior.

### Edge Cases

- Empty or unknown identifier types are non-bookable.
- A bookable type without a usable annotation identity or value does not expose
  an action.
- A generic hash is non-bookable unless the decoded identity classifies it as
  a credential key or script identifier.
- Existing copy actions, raw-value disclosure, resolution, and saved-book
  behavior remain unchanged when the label action is hidden.

## Requirements

### Functional Requirements

- **FR-001**: The product MUST define one deterministic classification for
  reusable bookable identifier types.
- **FR-002**: The classification MUST accept decoded credential-key, script,
  and address identifier types.
- **FR-003**: The classification MUST reject empty, unknown, generic,
  transaction-scoped, and payload-scoped types.
- **FR-004**: The WebUI MUST offer `Label this node` only when the decoded
  identifier is classified as bookable, has a usable annotation identity and
  value, and has no resolved label.
- **FR-005**: The WebUI MUST withhold the action from transaction hashes,
  transaction input/output references, output identities and indexes,
  auxiliary-data hashes, script-data hashes, datum/redeemer hashes, and raw
  payloads.
- **FR-006**: Hiding the action MUST NOT remove copy controls, raw evidence, or
  existing resolved labels from affected rows.
- **FR-007**: Address and credential-key labeling MUST continue to save and
  resolve through the existing selected-book workflow.
- **FR-008**: The bookability decision MUST be usable independently of the
  WebUI; the editor action and rendering remain WebUI-only.
- **FR-009**: Regression proof MUST demonstrate the classification directly
  and its visible effect across representative bookable and non-bookable
  decoded rows.

### Key Entities

- **Decoded identifier**: A Structure-row identity with a semantic type and,
  when supported, an annotation subject, predicate, and value.
- **Bookable identifier**: A decoded credential-key, script, or address
  identity intended to recur and resolve through books.
- **Transaction-scoped identifier**: A hash, reference, output identity,
  index, or payload identity whose usefulness is limited to one transaction.

## Success Criteria

### Measurable Outcomes

- **SC-001**: The representative browser journey finds zero label actions on
  each asserted transaction-scoped or payload-scoped row.
- **SC-002**: The same journey finds one usable label action on representative
  address and credential-key rows.
- **SC-003**: Direct classification proof covers every supported bookable type
  and at least six non-bookable type families with zero mismatches.
- **SC-004**: Existing address and credential-key save/resolution coverage
  completes with zero regressions.
- **SC-005**: The complete repository gate exits with zero failures.

## Assumptions

- Decoded rows carry a semantic identifier type sufficient to distinguish
  credential keys, scripts, and addresses from generic hashes and transaction
  references.
- Script bookability is part of the shared policy even when a representative
  fixture does not contain a rendered script row.
- Existing selected-book persistence, Turtle generation, and resolution remain
  unchanged.
- The merged shared-core foundation is the established owner for host-neutral
  classification; WebUI rendering remains the only consumer changed by this
  ticket.

## Non-goals

- Adding new decoded script projections or deriving identifiers absent from the
  authoritative decoded transaction graph.
- Changing address presentation (#61) or book serialization/prefix handling
  (#62).
- Changing provider IO, vaults, transaction storage, witness operations,
  submission, CLI commands, Node APIs, or engine semantics.
