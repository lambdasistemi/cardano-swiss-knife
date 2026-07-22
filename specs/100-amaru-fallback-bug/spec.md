# Specification: Safe Amaru book import

## Priority user story

As a Book importer, I need arbitrary JSON to be rejected unless it matches a supported book format, so the UI never presents unrelated data with false Amaru provenance.

## Functional requirements

- FR-001: `parseBook` MUST retain explicit dispatch for `amaru.book.bundle.v1` and CIP-57 blueprints.
- FR-002: JSON without a supported discriminator MUST reach Amaru rendering only when it has the required top-level `scope_owners` and `treasuries` journal shape.
- FR-003: All other JSON shapes MUST fail with an explicit unsupported/unrecognized-shape error and MUST NOT emit `overlay:amaruTreasury-*` subjects or `Amaru ...` labels.
- FR-004: `bundledAmaruJournal` MUST be populated from the vendored `docs/inspector/protocols/amaru-treasury/journal-2026.json` through the existing build-time `globalThis` injection pattern.
- FR-005: The vendored protocol registry data remains read-only; no duplicate journal literal may remain in `Book.js`.

## Success criteria

- A focused regression proves arbitrary non-Amaru JSON is rejected without Amaru RDF output.
- A focused regression proves the bundled journal equals the vendored journal content after injection.
- Existing bundle, blueprint, SHACL, and valid Amaru journal imports remain green.
- The local gate and fresh GitHub CI pass.

## Scope

Owned implementation is limited to `Book.js`, WebUI global injection, transplanted Playwright global injection, and focused regression tests. No ledger, crypto, RDF fallback, or changes to `cardano-ledger-inspector` are permitted.
