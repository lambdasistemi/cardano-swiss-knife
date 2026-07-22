# Implementation Plan: Blueprint Discovery and Add UX

## Technical context

- PureScript 0.15.16 and Halogen 7.
- Registry artifacts come from the Nix-pinned `cardano-ledger-inspector` `protocol-registry` package.
- `Cardano.Transaction.Book` is PureScript after #102; browser FFI is limited to injected build-time constants.
- `FFI.BookStore` owns browser persistence, while shared catalog/provenance interpretation belongs under `lib/src/Cardano/`.
- The full gate runs PureScript checks/tests, Node API checks, and the 99-test inspector Playwright suite.

## Data design

Add a shared registry module with a pure boundary equivalent to:

```purescript
type Provenance =
  { source :: String
  , ref :: String
  }

type BlueprintCatalogEntry =
  { id :: String
  , path :: String
  , raw :: String
  , provenance :: Provenance
  , onChainHashes :: Array String
  }
```

The exact decoder helpers are an implementation detail, but parsing must join `registry.json` blueprint entries to their named pin and artifact documents, reject missing joins, and combine hashes from both `validators[]` and `instances[]`. Build-time JavaScript only injects raw JSON/text constants; it does not interpret registry semantics.

Persist provenance as total string fields on each `Book` (empty strings represent legacy/local unpinned data) so the existing v1 store remains backwards-compatible. Rendering converts empty provenance to an explicit unpinned label.

## Data flow

```text
Nix-pinned protocol-registry
  -> materialized registry/pin/plutus files
  -> bootstrap raw globals
  -> shared PureScript registry parser
  -> BookStore seed/curated Book records
  -> Library provenance + curated picker
  -> selected books / blueprintArgs

unresolved Structure/Witness script hash
  -> base-aware /library?script_hash=<hash>
  -> validated query scope
  -> shared catalog hash lookup
  -> matching Add action or explicit no-match + fallback
```

## Slice 1 — Pinned provenance display

Lowest-blast-radius deliverable, required first by the agy containment contract.

- Advance only the inspector flake input and verify the resulting lock closure.
- Materialize and inject the settled registry, pins, and referenced artifacts.
- Add the shared pure registry/provenance parser and focused tests.
- Extend BookStore with backwards-compatible provenance persistence.
- Render upstream repository/ref separately from internal paths for loaded and selected books; show explicit unpinned state for local/legacy books.
- Add browser coverage for seeded provenance, legacy migration, and persistence.

Commit: `feat(library): show pinned book provenance`
Trailer: `Tasks: T680, T681, T682, T683, T684`

## Slice 2 — Curated registry picker

- Render the catalog before a collapsed/secondary freeform import area.
- Show label/id, upstream repository/ref, and known hashes.
- Add an unloaded bundled blueprint through the existing BookStore path and prevent a duplicate catalog id/ref.
- Preserve every current freeform import/export behavior.
- Add shared lookup tests and browser coverage for browse/add/reload/fallback.

Commit: `feat(library): add curated blueprint catalog`
Trailer: `Tasks: T685, T686, T687, T688, T689`

## Slice 3 — Point-of-need script discovery

- Parse and validate a base-aware Library `script_hash` query.
- Add unresolved-only Structure and Witness links using the exact script hash.
- Filter/highlight catalog entries for registry hits; render an explicit no-match state for unknown valid hashes.
- Cover root and preview-subpath navigation, Structure/Witness behavior, resolved suppression, invalid scopes, and fallback availability.

Commit: `feat(inspector): link unresolved scripts to library`
Trailer: `Tasks: T690, T691, T692, T693, T694`

## Verification and finalization

- Every slice follows observed RED -> navigator-approved RED -> GREEN -> navigator-approved GREEN -> full gate -> one commit.
- The ticket owner independently diff-polices every agy work period and verifies navigator approval on disk before accepting any commit.
- The ticket owner reruns `./gate.sh`, stamps tasks into each accepted slice commit, pushes, and waits for fresh remote CI.
- Final audit verifies commit messages, all task boxes, the draft PR body, and remote CI; then `gate.sh` is dropped in the final commit and the PR is marked ready.

## Risk controls

- Registry/pin/artifact joins fail closed; source/ref are never inferred from labels or paths.
- The flake update is limited to the named inspector input and reviewed as its own part of Slice 1.
- Legacy store compatibility is a direct test, not an assumed JSON-decoder behavior.
- Scoped hashes are validated before lookup/render.
- The existing freeform flow is retained and regression-tested.
- No runtime network dependency is added for catalog display or Add.
