# Feature Specification: Blueprint Discovery and Add UX

**Issue**: #68
**Parent**: #74
**Priority**: P1

## P1 user story

As a transaction reviewer, I can discover a trustworthy blueprint at the point where an unknown script hash appears, inspect its immutable upstream provenance, and add it from a curated catalog without already knowing a URL or file format.

## User stories

### US1 — Verify provenance

When a book or blueprint is loaded, the Library and selected-book summary distinguish its internal path from its upstream repository and immutable ref. Curated artifacts show both repository and ref; local/freeform artifacts explicitly say that no pinned upstream provenance is available.

### US2 — Browse curated blueprints

The Library presents the build-pinned `cardano-ledger-inspector` blueprint registry as the primary Add flow. Each entry shows its label, source repository, immutable ref, and known on-chain hashes. A user can add an unloaded entry with one action. Existing Turtle, URL, file, and store-JSON inputs remain available as a clearly labelled fallback.

### US3 — Discover at point of need

An unresolved script hash in either Structure or Witness displays `no blueprint for <hash>` as an accessible link to `/library?script_hash=<hash>`. The Library acknowledges the requested hash and narrows or highlights matching curated entries. If the registry has no match, it says so while retaining the freeform fallback.

## Functional requirements

- **FR-001**: Advance the pinned `cardano-ledger-inspector` input to merged registry commit `cd346f3577dc243df09bf4b141b91d9470c5ec00` or a verified descendant containing the settled `$schema_note` beginning `Build-time registry for tx.intent`.
- **FR-002**: Materialize `registry.json`, referenced blueprint `plutus.json` files, and their `pin.json` files from the pinned Nix input at build/test time; do not fetch registry content at runtime.
- **FR-003**: Parse catalog/provenance data in a host-neutral PureScript module under `lib/src/Cardano/`; WebUI code may render and persist the shared model but must not duplicate registry parsing.
- **FR-004**: A catalog blueprint exposes its registry id/path, raw CIP-57 document, upstream `source`, immutable `ref`, and every matching validator/instance on-chain hash.
- **FR-005**: Missing or malformed registry/pin/artifact data fails explicitly. There is no silent hard-coded fallback catalog.
- **FR-006**: Stored books preserve provenance fields through save/load/export/import. Existing `cardano-ledger-inspector.books.v1` documents without those fields remain readable and receive an explicit unpinned state.
- **FR-007**: Every rendered loaded book shows either upstream repository plus pinned ref/commit, or an explicit `local/freeform — no pinned upstream ref` state. An internal source path is not presented as provenance.
- **FR-008**: The curated blueprint list precedes the existing freeform controls and provides an Add action for unloaded entries without removing or weakening Turtle, URL, file, or store-JSON workflows.
- **FR-009**: Adding a curated entry stores the exact bundled CIP-57 bytes and provenance from the same pinned catalog entry, selects it, and prevents accidental duplicate additions of that catalog id/ref.
- **FR-010**: `script_hash` scope accepts exactly a 56-digit hexadecimal script hash, normalized to lowercase. Invalid query values do not filter the catalog and do not enter rendered HTML unsafely.
- **FR-011**: Structure offers discovery only for unresolved rows whose kind is `script` or `script_hash`; resolved rows and generic non-script hashes do not receive the affordance.
- **FR-012**: Witness offers discovery only for unresolved rows carrying a `urn:cardano:id:script:<hash>` identifier candidate. Resolved witness rows do not receive the affordance.
- **FR-013**: The point-of-need link preserves the deployed route base and opens the hash-scoped Library view on root and preview subpaths.
- **FR-014**: No host-side ledger, crypto, CBOR, RDF, SPARQL, or SHACL fallback is introduced.

## Acceptance scenarios

1. A fresh Library displays the bundled SundaeSwap blueprint with `github.com/SundaeSwap-finance/sundae-contracts` and ref `be33466b7dbe0f8e6c0e0f46ff23737897f45835` separately from its internal file path.
2. A legacy stored local book still loads and is labelled as unpinned rather than receiving invented provenance.
3. The curated list includes both `sundaeswap-v3` and `sundaeswap-treasury-v3`; adding the latter persists its exact pinned provenance and CIP-57 content.
4. `/library?script_hash=32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d` identifies the matching treasury blueprint entry.
5. An unknown valid script hash produces a scoped Library empty-match message while leaving freeform import available.
6. Unresolved Structure and Witness script rows link to the scoped Library; resolved script rows and non-script hashes do not.
7. PureScript tests, the inspector Playwright suite, `./gate.sh`, and fresh remote CI pass.

## Non-goals

- Runtime GitHub discovery or arbitrary registry refresh.
- Automatically trusting or loading a blueprint without the user's Add action.
- Protocol-specific datum decoding beyond the pinned inspector capability.
- Changing provider HTTP, TextEnvelope parsing, or engine-owned semantics.
