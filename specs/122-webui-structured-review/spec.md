# Feature Specification: WebUI Structured Signer Review

**Feature Branch**: `feat/122-webui-structured-review`
**Created**: 2026-07-29
**Status**: Draft
**Input**: GitHub issue #122, "Render the shared structured signer review in WebUI
with no parallel interpretation"

## Context

The CLI and the browser workbench both answer the same question — *what am I
about to sign?* — but they answer it from different places.

Since #120 (merged as `afeb71f`) the CLI consumes an inspector-owned structured
review: the engine decides what a control group is, which category it falls in,
what evidence backs the role, and what blocks readiness. The CLI renders that
result and adds nothing of its own. #121 (merged as `4823f8d`) extended it to
per-asset amounts.

The workbench never made that move. It calls `tx.inspect` and `tx.intent`
(`docs/inspector/src/Main.purs`), then reconstructs meaning itself through the
`operation*` parsers in `docs/inspector/src/FFI/Json.purs`, producing an
`IntentSummary` it renders. It never calls `tx.review`.

So today two independent implementations derive signer-facing meaning from the
same transaction. That is not a hypothetical duplication risk — it is the
current architecture, and it is what this ticket removes.

## Why duplicated interpretation is the actual defect

A signer who checks a transaction in the CLI and again in the browser expects
the same answer. Two derivations can disagree, and the disagreement is worst
exactly where it matters most: which outputs are yours, which are external,
what is still blocking. A divergence there is not a cosmetic inconsistency —
it is two tools telling a signer different things about what they are signing.

Ledger semantics belong in the engine. The workbench should render, not decide.

## User Scenarios & Testing

### User Story 1 — One answer, two surfaces (Priority: P1)

A treasury signer opens a transaction in the WebUI and sees the same structured
signer review the CLI shows, derived by the engine rather than re-derived by the
browser.

**Why this priority**: it is the ticket's reason to exist. Every other criterion
is a property of that shared result being rendered faithfully.

**Independent Test**: render a transaction in the workbench and compare the
control categories, evidence provenance, readiness state and blockers against
`csk tx review` for the same transaction; they must agree because they are the
same result, not because two derivations happen to match.

**Acceptance Scenarios**:

1. **Given** a transaction, **When** the workbench reviews it, **Then** the
   rendered categories, provenance, readiness and blockers come from the engine's
   `tx.review` result.
2. **Given** the workbench code, **When** it is inspected for meaning-derivation,
   **Then** no PureScript or FFI code reconstructs control categories, roles,
   evidence or readiness from a raw intent result.

### User Story 2 — Book labels decorate, never re-interpret (Priority: P1)

An operator's book labels appear against the identifiers they name, without the
UI inventing meaning the engine did not provide.

**Acceptance Scenarios**:

1. **Given** operator books, **When** the review renders, **Then** labels
   decorate the engine's result rather than replacing or re-deriving any of it.
2. **Given** a book containing identifiers absent from this transaction, **When**
   the review renders, **Then** only resolutions for identifiers actually present
   are shown.

### User Story 3 — Value that matters is visible at a glance (Priority: P1)

High-value ADA movements and signer-controlled change are visually distinct from
external-key and script-locked value.

**Why this priority**: a review that is technically complete but flat is a review
a signer skims. The engine already separates these; the UI must not bury them.

**Acceptance Scenarios**:

1. **Given** a transaction with mixed control categories, **When** it renders,
   **Then** high-value movements and signer-controlled change are visually
   distinguishable from external-key and script-locked value, not a uniform list.

### User Story 4 — Per-asset amounts, matching the CLI (Priority: P1)

Each control group shows the assets it holds: policy id, asset name and exact
quantity, alongside the distinct-class count.

**Why this priority**: added by acceptance amendment on 2026-07-29. #121 landed
this in the CLI, so "the same review the CLI shows" now includes it. Shipping the
WebUI without it would create the exact CLI/browser divergence this ticket exists
to remove — in the newest field.

**Acceptance Scenarios**:

1. **Given** a control group holding non-ADA assets, **When** it renders, **Then**
   each asset's policy id, asset name and exact quantity are shown.
2. **Given** a control group holding none, **Then** the asset-free case renders
   cleanly.
3. **Given** any group, **Then** the distinct-class count remains, independently
   of the per-asset detail — neither derived from the other, matching upstream.

## Functional Requirements

- **FR-001**: The workbench MUST obtain its signer review from the engine's
  `tx.review` operation.
- **FR-002**: No PureScript or FFI code in the workbench may derive control
  categories, roles, evidence provenance, readiness or blockers from a raw
  intent/inspect result. Parsing the engine's already-decided result into typed
  values is not derivation; recomputing what it means is.
- **FR-003**: Every blocker the engine reports MUST be rendered. Silently
  dropping a blocker is the most dangerous possible failure of this surface.
- **FR-004**: Book labels MUST decorate the engine result, and only for
  identifiers present in the transaction.
- **FR-005**: High-value and signer-controlled value MUST be visually
  distinguishable from external-key and script-locked value.
- **FR-006**: Each control group MUST show per-asset policy id, asset name and
  exact quantity, with `asset_class_count` retained independently.

## Out of Scope

- A new visual design system.
- IPFS fetching or interpretation.
- Signing or submission.
- Refactoring `Main.purs` beyond what removing the parallel interpretation
  requires. It is ~7000 lines; this ticket is not its cleanup.

## Success Criteria

- The workbench renders `tx.review` output; the parallel interpretation path is
  gone, not merely unused.
- Categories, provenance, readiness, blockers, book labels, value emphasis and
  per-asset amounts all render from the shared result.
- A browser-level proof exists — a PureScript renderer can typecheck and render
  nothing.
