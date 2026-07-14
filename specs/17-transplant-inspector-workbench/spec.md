# Issue 17 — Transplant the inspector browser workbench at parity

## P1 User Story

As a workbench user, I open Cardano Swiss Knife's transaction surface and use
the full Ledger Inspector workbench—structure, witness, validation, RDF,
providers, examples, and books—at parity with the published inspector UI.

## Functional Requirements

- FR-001: Build the transplanted `docs/inspector` PureScript/Halogen app and
  `packages/purescript-rdf-editor` package inside this repository using the
  parameterized `nix/wasm-ui.nix` pattern.
- FR-002: Consume `wasm-tx-inspector`, `rdf-shapes-wasm`, and the protocol
  registry through flake inputs. The registry agreement surface is exactly
  `cardano-ledger-inspector.packages.${system}.protocol-registry`.
- FR-003: Do not commit inspector engine source, generated WASM binaries, or a
  copied `docs/inspector/protocols` registry tree.
- FR-004: Publish the workbench below `/inspector/`, including direct entry
  points for `inspect`, `settings`, and `library`, while leaving the existing
  Cardano Swiss Knife shell and its routes unchanged.
- FR-005: Run the transplanted inspector Playwright suites through the Nix CI
  path. Test-only engine fixtures may be supplied from the pinned inspector
  flake source; registry fixtures must come from the protocol-registry output.
- FR-006: Transplant the `tools/ux-judge` capture, scoring, and reporting loop,
  target the Cardano Swiss Knife workbench by default, and provide a hermetic
  capture smoke for the mechanical gate.
- FR-007: Assemble the existing shell, inspector workbench, and MkDocs site
  into the same Pages and pull-request preview artifacts.

## Success Criteria

- `nix build .#tx-inspector-ui` succeeds and its output contains the three SPA
  route entry points plus hashed inspector and RDF-shapes WASM assets.
- The lock records an inspector revision at or after
  `3df3a0e2122e1e8a890d2533f88f1e58df42f626` and an explicitly pinned
  `rdf-shapes-wasm` input.
- `git ls-files` finds neither a transplanted protocol registry tree nor WASM
  binaries.
- The transplanted Playwright suite and UX capture smoke pass through named
  Nix CI apps, and the full `./gate.sh` passes.
- The pull-request preview returns HTTP 200 for `/`, `/inspector/`,
  `/inspector/inspect`, `/inspector/settings`, and `/inspector/library`; a
  browser smoke proves the workbench initializes on the preview host.
- The pull-request body maps routes, tabs, providers, examples, books, and
  SHACL validation to passing automated or live-preview evidence.

## Boundaries

This ticket does not unify the two shells, change workbench features, alter
ledger operations or their JSON envelope, modify the inspector repository, or
remove any inspector-hosted surface.
