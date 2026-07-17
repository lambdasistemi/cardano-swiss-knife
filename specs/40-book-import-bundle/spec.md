# Feature Specification: Loud Amaru book bundle import

**Feature Branch**: `feat/40-book-import-bundle`
**Created**: 2026-07-17
**Status**: In progress
**Input**: cardano-swiss-knife issue #40 and parent epic #45

## User Scenarios & Testing

### User Story 1 - Import a treasury identity book without silent failure (Priority: P1)

As a workbench user, I import an `amaru.book.bundle.v1` file exported by
amaru-treasury-tx and see it become a selected local resolution book. Every
Library import path tells me which book and how many parts were accepted, or
shows a reason why the input was rejected.

**Why this priority**: The treasury workflow cannot close while the producer's
bundle silently adds nothing. The import result is an operator truth claim.

**Independent Test**: In a clean browser Library, import the checked-in copy of
the 2026-07-17 no-op bundle. Verify a selected **Amaru book bundle** with two
parts appears, then attempt a malformed bundle and verify visible failure with
no storage mutation. Exercise Turtle paste, URL, book file, and store JSON and
verify each reports a visible result.

**Acceptance Scenarios**:

1. **Given** the clean Library and the exact 2026-07-17 bundle, **When** it is
   chosen through Book file, **Then** a selected two-part Amaru book appears
   and success names the book and part count.
2. **Given** a bundle wallet whose address is neither a 28-byte key hash nor a
   Cardano Bech32 address, **When** it is imported, **Then** the store is
   unchanged and a visible entry-specific reason is shown.
3. **Given** valid Turtle, URL, book file, and store JSON inputs, **When** each
   import completes, **Then** visible success reports the imported name and
   part count or aggregate book and part totals.
4. **Given** empty, unreadable, unsupported, or malformed input on any import
   path, **When** the attempt completes, **Then** a visible path-specific reason
   replaces any prior success.

### Edge Cases

- Canonical and compatibility aliases for the same logical bundle key are
  rejected as ambiguous rather than imported twice.
- A supported bundle with no recognized entries is rejected rather than
  creating an empty book.
- Unknown keys may accompany recognized entries, but success must name ignored
  keys; a bundle containing only unknown keys is rejected.
- Reference URI and free-text entries count as retained inert parts but emit no
  RDF and cannot affect resolution.
- A failure after a prior success clears the stale success; a later success
  clears the stale error.
- Store JSON merging preserves unique local book identifiers and reports only
  the imported totals.

## Requirements

### Functional Requirements

- **FR-001**: The Library MUST accept all formats and paths listed in
  `docs/book-interchange.md`.
- **FR-002**: Book file and Book URL MUST recognize the exact
  `amaru.book.bundle.v1` dispatch shape, including the canonical `wallets` key
  and the `named:wallets` compatibility alias used by the 2026-07-17 bundle.
- **FR-003**: A wallet key hash MUST map to `overlay:Owner`; a wallet Cardano
  Bech32 address MUST map to `overlay:Address` and `cardano:bech32`, using the
  exact prefixes and subject IRIs in the interchange contract.
- **FR-004**: A valid bundle MUST add one selected local **Amaru book bundle**
  with source `amaru.book.bundle.v1` and one part per recognized entry.
- **FR-005**: Reference URI and free-text bundle entries MUST be retained as
  labeled inert parts and MUST NOT emit resolution RDF.
- **FR-006**: Import MUST be transactional: malformed recognized input leaves
  the stored books unchanged and displays a reason that identifies the failing
  path or entry.
- **FR-007**: Turtle paste, Book URL, Book file, and Book store JSON file MUST
  display success containing imported book name and part count, or aggregate
  book and part totals for a store document.
- **FR-008**: The exact file `/tmp/attx-csk-journey/attx-book-bundle.json` MUST
  be checked in as the browser regression fixture and used without rewriting
  its JSON shape.
- **FR-009**: Books MUST remain browser-local; this feature MUST introduce no
  server round-trip, telemetry, engine change, rendering change, export path,
  or overlay vocabulary redesign.
- **FR-010**: The extended repository gate MUST prove successful bundle import,
  selectable state, visible malformed failure, loud success on every path, and
  the absence of the original silent no-op.

### Key Entities

- **Bundle**: A versioned JSON object with `kind`, a `books` map, recognized
  canonical or compatibility keys, and ordered entries.
- **Bundle part**: One recognized wallet, reference URI, or free-text entry;
  it has a label, kind, retained source value, and optional resolution Turtle.
- **Local book**: A named, selected, browser-stored collection of parts plus
  source text and combined Turtle.
- **Import feedback**: The latest visible success or failure for a Library
  import attempt, including the path and accepted totals or rejection reason.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Importing the exact 2026-07-17 fixture adds exactly one selected
  book with exactly two parts in a clean Library.
- **SC-002**: Both fixture entries produce the contract-pinned labels and
  resolution triples: one owner key and one Cardano address.
- **SC-003**: A malformed bundle produces a visible reason and zero changes to
  the serialized local book store.
- **SC-004**: All four Library import paths show a visible success or failure;
  automated browser coverage contains no import action whose result is only a
  silent state change.
- **SC-005**: The full extended gate exits 0 with all browser and repository
  checks passing.

## Assumptions

- Bundle JSON uses the current amaru-treasury-tx key taxonomy; prefixed aliases
  are compatibility input, not the canonical output shape.
- Reference and free-text entries are retained as inert parts because dropping
  them would turn accepted input into an unreported loss.
- The existing browser-local book store remains the persistence boundary.
- The repository-owned `gate.sh` is permanent on `main`; this PR extends it and
  does not apply the temporary-gate removal convention.

## Out of Scope

- Resolution rendering changes owned by sibling issue #41.
- Book export from cardano-swiss-knife.
- Engine repository changes or overlay vocabulary additions.
- Changes to amaru-treasury-tx wire formats or existing commands.
