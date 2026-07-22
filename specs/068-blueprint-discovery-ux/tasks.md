# Tasks: Blueprint Discovery and Add UX

## Slice 1 — Pinned provenance display

Owned files for the driver:

- `flake.lock`
- `nix/wasm-ui.nix`
- `nix/apps/inspector-playwright.nix`
- `docs/inspector/src/bootstrap.js`
- `lib/src/Cardano/Blueprint/Registry.js`
- `lib/src/Cardano/Blueprint/Registry.purs`
- `test/src/Test/BlueprintRegistry.purs`
- `test/src/Test/Main.purs`
- `docs/inspector/src/FFI/BookStore.js`
- `docs/inspector/src/FFI/BookStore.purs`
- `docs/inspector/src/Main.purs`
- `docs/inspector/dist/styles.css`
- `docs/inspector/tests/tx-identify.spec.mjs`

- [X] T680 Pin the merged inspector registry and materialize/inject its raw registry, pin, and referenced artifact documents.
- [X] T681 Add a host-neutral PureScript parser with explicit malformed/missing-join failures and focused RED/GREEN tests.
- [X] T682 Persist source repository and immutable ref backwards-compatibly through BookStore load/save/export/import.
- [X] T683 Render pinned provenance separately from internal source paths, with an explicit unpinned state for local/legacy books.
- [X] T684 Prove seed, legacy, persistence, selected-summary, formatting, build, and browser behavior; commit one bisect-safe slice.

Forbidden scope: `gate.sh`, `specs/`, `docs/book-interchange.md`, `.github/`, git configuration, sibling-ticket files, provider/TextEnvelope/engine semantics, and every file not listed above.

## Slice 2 — Curated registry picker

Owned files for the driver:

- `lib/src/Cardano/Blueprint/Registry.purs`
- `test/src/Test/BlueprintRegistry.purs`
- `docs/inspector/src/FFI/BookStore.purs`
- `docs/inspector/src/Main.purs`
- `docs/inspector/dist/styles.css`
- `docs/inspector/tests/tx-identify.spec.mjs`

- [ ] T685 Add pure catalog lookup/duplicate identity behavior with focused RED/GREEN tests.
- [ ] T686 Render the pinned curated blueprint catalog before the freeform fallback controls.
- [ ] T687 Add an unloaded bundled blueprint through BookStore with exact raw bytes and provenance, selected by default.
- [ ] T688 Prevent duplicate catalog id/ref additions without weakening local/freeform workflows.
- [ ] T689 Prove browse, add, reload, duplicate prevention, fallback regression, build, and browser behavior; commit one bisect-safe slice.

Forbidden scope: `gate.sh`, `specs/`, `docs/book-interchange.md`, `flake.lock`, Nix files, bootstrap injection, `.github/`, git configuration, sibling-ticket files, and every file not listed above.

## Slice 3 — Point-of-need script discovery

Owned files for the driver:

- `lib/src/Cardano/Blueprint/Registry.purs`
- `test/src/Test/BlueprintRegistry.purs`
- `docs/inspector/src/Routing.js`
- `docs/inspector/src/Routing.purs`
- `docs/inspector/src/Main.purs`
- `docs/inspector/dist/styles.css`
- `docs/inspector/tests/tx-identify.spec.mjs`

- [ ] T690 Parse and normalize a valid 56-hex `script_hash` Library scope and ignore invalid values safely.
- [ ] T691 Link unresolved Structure script/script_hash rows to the base-aware scoped Library and suppress resolved/non-script rows.
- [ ] T692 Link unresolved Witness script identifier candidates to the same scoped Library and suppress resolved/non-script rows.
- [ ] T693 Filter/highlight catalog matches and show an explicit no-match state while preserving freeform fallback.
- [ ] T694 Prove root/subpath routing, Structure/Witness links, scope validation, resolved suppression, build, and browser behavior; commit one bisect-safe slice.

Forbidden scope: `gate.sh`, `specs/`, `docs/book-interchange.md`, `flake.lock`, Nix/bootstrap files, `FFI.Json`, `.github/`, git configuration, sibling-ticket files, and every file not listed above.

## Orchestrator-owned finalization

- [ ] T695 Independently run the final gate, audit all commits/tasks and PR metadata, verify fresh remote CI, drop `gate.sh`, stamp this task in that same final commit, push, and mark PR #110 ready.
