# Specification: Remove Amaru bundle JSON import

## User story

As a Library user, I want the supported book inputs to match the maintained interchange paths so obsolete `amaru.book.bundle.v1` documents fail explicitly and the supported Turtle, CIP-57, and store JSON paths remain dependable.

## Functional requirements

- FR-001: `parseBook` MUST reject JSON tagged `amaru.book.bundle.v1` as an unsupported JSON kind.
- FR-002: Bundle-only parsing, validation, and part-building helpers MUST be removed when they have no remaining callers.
- FR-003: CIP-57 blueprint JSON import MUST retain its existing behavior.
- FR-004: `cardano-ledger-inspector.books.v1` store import MUST retain its existing behavior.
- FR-005: Documentation MUST describe exactly three accepted input forms and MUST remove the obsolete bundle contract.
- FR-006: Tests and fixtures MUST stop treating bundle JSON as accepted input and MUST prove its transactional rejection without weakening retained-format coverage.

## Non-goals

- Changes to Amaru Treasury Tx or its published Turtle export.
- Changes to CIP-57 parsing, store JSON parsing, or their data shapes.
- Host-side Cardano, ledger, crypto, RDF, SPARQL, or SHACL fallbacks.

## Success criteria

- Focused Node tests show the obsolete kind is rejected and accepted documents preserve order and transactionality.
- Browser coverage shows a bundle import visibly fails without mutating the local store.
- CIP-57 and store JSON regression coverage remains green.
- The repository gate and fresh GitHub Actions checks pass.
