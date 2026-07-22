# Plan: Remove Amaru bundle JSON import

## Technical approach

Use one vertical RED-to-GREEN slice. First change focused Node and browser tests so `amaru.book.bundle.v1` is rejected transactionally while CIP-57 and `cardano-ledger-inspector.books.v1` remain accepted. Then remove the explicit dispatch branch and every helper proven exclusive to it. Finally reduce the interchange document from four accepted forms to three and remove the bundle-specific contract section.

## Slice 1 — Remove bundle import end to end

1. RED: revise focused fixtures and assertions to require explicit bundle rejection while retaining CIP-57/store success assertions.
2. GREEN: delete the bundle dispatch and exclusive helper graph from `Book.js`.
3. GREEN: remove bundle-only Playwright scenarios/fixture usage and replace them with transactional rejection coverage.
4. DOCS: remove the accepted-input row and complete bundle contract section; adjust feedback wording.
5. Run focused Node proof, browser proof where practical, and `./gate.sh`; commit one bisect-safe change.

## Owned files

- `lib/src/Cardano/Transaction/Book.js`
- `docs/book-interchange.md`
- `node/test/fixtures/transaction-books.json`
- `node/test/transaction-books.test.mjs`
- `node/test/api-properties.test.mjs`
- `docs/inspector/tests/tx-identify.spec.mjs`
- `docs/inspector/tests/fixtures/attx-book-bundle.json` (delete if unused)
- `specs/101-drop-bundle-json/tasks.md` only for checkbox stamping in the accepted slice commit

## Risks and controls

- Shared parser primitives are retained unless reference search proves bundle exclusivity.
- CIP-57 and store JSON assertions remain explicit, preventing accidental collateral removal.
- Rejection is checked transactionally so a failed obsolete import cannot mutate local books.
- Fresh remote CI is required after local acceptance.
