# Tasks — Issue 17

## Slice 1 — Pin the workbench artifact inputs

- [X] T001-S1 Refresh `cardano-ledger-inspector` to the inspector source snapshot,
  not earlier than the protocol-registry export commit.
- [X] T002-S1 Add and lock the explicit `rdf-shapes-wasm` flake input at the
  inspector-compatible revision.
- [X] T003-S1 Prove both lock revisions and pass the inherited full gate.

## Slice 2 — Build the transplanted workbench

- [X] T004-S2 Copy `docs/inspector` application sources and static inputs without
  generated JS, WASM, tests, or the protocol registry tree.
- [X] T005-S2 Copy `packages/purescript-rdf-editor` and port the parameterized
  `nix/wasm-ui.nix` builder.
- [X] T006-S2 Consume decoder WASM, RDF-shapes WASM, and exactly
  `packages.${system}.protocol-registry`; adapt registry imports without changing
  workbench behavior.
- [X] T007-S2 Build and inspect `tx-inspector-ui`, prove forbidden artifacts are
  untracked, and pass the full gate.

## Slice 3 — Transplant the browser parity suites

- [X] T008-S3 Copy the two inspector Playwright suites and their configuration.
- [X] T009-S3 Supply engine fixtures from the inspector flake source and registry
  fixtures from the protocol-registry package without vendoring either.
- [X] T010-S3 Expose the inspector Playwright check through a named Nix CI app.
- [X] T011-S3 Run the complete transplanted suite and the extended full gate.

## Slice 4 — Transplant and prove the UX judge loop

- [X] T012-S4 Copy `tools/ux-judge` and retarget its default and documentation to
  the Cardano Swiss Knife `/inspector/` surface.
- [X] T013-S4 Provide a Nix-backed browser runtime and named deterministic UX
  capture check.
- [X] T014-S4 Run the capture check, the full scoring loop, and the extended gate.

## Slice 5 — Publish the combined site

- [ ] T015-S5 Build a combined artifact with the existing shell at `/`, the
  workbench at `/inspector/`, and direct inspector route entry points intact.
- [ ] T016-S5 Publish the combined artifact from both Pages and pull-request
  preview workflows while retaining MkDocs under `/docs/`.
- [ ] T017-S5 Prove combined routes and compressed WASM assets locally and pass
  the final extended gate.
- [ ] T018-S5 Record parity evidence in the living PR body and smoke-check the
  published preview at the final head.
