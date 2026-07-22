# Plan: Safe Amaru book import

## Technical approach

Use one vertical RED-to-GREEN slice. Add focused tests around the host-neutral `Book.js` parser and bundled journal injection. Replace catch-all JSON dispatch with a narrow journal-shape predicate requiring own `scope_owners` and `treasuries` properties of the expected basic types. Replace the source literal with a `globalThis` string and seed that global from the existing vendored protocol import in both the browser bootstrap and Nix Playwright transplant.

## Slice 1 — Guard dispatch and inject the source journal

1. RED: prove arbitrary JSON cannot be mislabeled as Amaru and injected bundled data matches the vendored journal.
2. GREEN: add the narrow Amaru journal predicate and explicit unknown-shape error.
3. GREEN: remove the duplicated literal and mirror existing Sundae/SHACL global injection wiring.
4. Run focused proof and `./gate.sh`; commit one bisect-safe change.

## Owned files

- `lib/src/Cardano/Transaction/Book.js`
- `docs/inspector/src/bootstrap.js`
- `nix/apps/inspector-playwright.nix`
- `nix/wasm-ui.nix`
- Focused regression file(s) under `docs/inspector/tests/`
- `specs/100-amaru-fallback-bug/tasks.md` only for checkbox stamping in the accepted slice commit

## Risks and controls

- The global is initialized before module evaluation, matching established injection semantics.
- Shape recognition stays structural and conservative; unknown JSON fails explicitly.
- The source registry is consumed but never edited.
- The WebUI derivation copies the journal from its existing `protocolRegistry` input before esbuild, beside the existing Sundae/SHACL copies.
- Fresh remote CI is required after local acceptance.
