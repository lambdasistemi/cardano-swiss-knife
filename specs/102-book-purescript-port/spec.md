# Specification: Port book parsing to PureScript

## User story

As a Cardano Swiss Knife host, I want every maintained book input classified and rendered by typed PureScript so unsupported JSON cannot silently fall through while Node, CLI, and browser users observe exactly the same imported books and Turtle as before.

## Functional requirements

- FR-001: The library MUST represent the retained input shapes with a PureScript sum type covering pasted Turtle, SHACL Turtle, CIP-57 blueprint JSON, Amaru journal JSON, and `cardano-ledger-inspector.books.v1` store JSON.
- FR-002: Dispatch over the recognized-input sum type MUST be exhaustive; JSON carrying any `kind` other than the store kind MUST retain the explicit `unsupported JSON kind: <kind>.` failure, and other JSON objects MUST retain `unrecognized JSON shape.`.
- FR-003: `Book.purs` MUST own parsing, classification, labels, identifiers, FNV-derived pasted identifiers, book-part construction, blueprint argument construction, and Amaru RDF/Turtle rendering.
- FR-004: `Book.js` MUST contain only the unavoidable `globalThis` reads for the injected SHACL shapes, SundaeSwap blueprint, and Amaru journal constants.
- FR-005: Pasted Turtle, SHACL Turtle, CIP-57 blueprints, Amaru journals, and selected store books MUST preserve their current titles, sources, part fields, ordering, error text, and byte-for-byte Turtle output.
- FR-006: Amaru journal rendering MUST preserve sorted treasury order, optional owner placement, transaction-output-reference normalization, numeric/literal rendering, labels, blank lines, and final newlines.
- FR-007: Store import MUST preserve caller document order, retain only selected store books, and identify their source as `cardano-ledger-inspector.books.v1`.
- FR-008: Node/CLI MUST consume the compiled PureScript book module, and the inspector's `FFI.OverlayBook` module MUST become a typed compatibility facade over the same module.
- FR-009: Existing host-facing inspection APIs and visible behavior MUST remain unchanged.
- FR-010: Golden/characterization tests MUST cover every retained input shape and the previously removed `amaru.book.bundle.v1` rejection before the JavaScript implementation is removed.

## Non-goals

- Reintroducing `amaru.book.bundle.v1`.
- Changing `docs/book-interchange.md` or any maintained wire format.
- Adding host-side ledger, crypto, RDF, SPARQL, or SHACL fallbacks.
- Broadly porting unrelated inspector FFI modules.

## Success criteria

- The focused PureScript tests prove exact records and Turtle strings for Turtle, SHACL, blueprint, Amaru journal, store, and rejection cases.
- The focused Node tests prove the packaged API preserves order, sources, transactionality, and exact imported book content.
- `Book.js` exposes injected constants and no parsing/rendering helpers.
- The branch gate passes locally, then a fresh GitHub Actions run passes before the PR is marked ready.
