# Implementation Plan — Issue 17

## Context

Cardano Swiss Knife already publishes its browser shell at the site root and
consumes `wasm-tx-inspector` from the inspector flake. The source workbench at
`/code/cardano-ledger-inspector` is a separate PureScript workspace with a
CodeMirror-backed extra package, two WASM assets, a protocol registry, a large
Playwright parity suite, and a UX scoring loop. The transplant preserves that
workbench as a separate SPA under `/inspector/`.

The source snapshot for the transplant is inspector `main` at
`c3ccd8d8f8c009dadf7573c09b308990c097d755`. Registry content is injected at
build and test time from the pinned inspector output; it is not copied into the
repository.

| Consumer | Flake-owned input | Agreement |
|---|---|---|
| Workbench decoder | `cardano-ledger-inspector` | `packages.${system}.wasm-tx-inspector` |
| Workbench SHACL runtime | `rdf-shapes-wasm` | `packages.${system}.wasm-pkg` |
| Blueprint and shapes books | `cardano-ledger-inspector` | `packages.${system}.protocol-registry` |

## Slices

### Slice 1 — Pin the workbench artifact inputs

Refresh the inspector input to the source snapshot (which is newer than the
registry-export minimum), add the explicitly pinned `rdf-shapes-wasm` input,
and prove the exact lock revisions. Existing browser behavior and the inherited
gate remain green at this independently bisectable dependency boundary.

### Slice 2 — Build the transplanted workbench

Copy the workbench source and standalone RDF editor package, excluding tests,
generated output, and the protocol registry tree. Port the parameterized Nix
builder and wire all three flake artifacts into a `tx-inspector-ui` package.
Adapt only paths and registry loading needed by the new repository boundary;
do not change workbench behavior.

### Slice 3 — Transplant the browser parity suites

Copy both Playwright suites and their configuration. Parameterize their
upstream fixture paths so a Nix check supplies engine fixtures from the pinned
flake source and registry files from the exact protocol-registry package.
Expose a named CI app and run the complete transplanted suite.

### Slice 4 — Transplant and prove the UX judge loop

Copy the capture/judge/report tooling, retarget its default production URL,
and provide the Playwright runtime through Nix. Add a deterministic capture
check against the built workbench; separately run the full vision-scoring loop
as delivery evidence without making external model access a CI requirement.

### Slice 5 — Publish the combined site

Assemble the existing shell at `/`, the workbench at `/inspector/`, and MkDocs
at `/docs/`. Use the combined artifact in Pages and pull-request preview
workflows, retain direct-route fallbacks and compressed WASM assets, and add a
local combined-site smoke before live-preview verification.

## Verification

- Slice 1: lock-revision predicates for inspector and RDF shapes, then
  `./gate.sh`.
- Slice 2: `nix build .#tx-inspector-ui` plus artifact/no-vendoring assertions,
  then `./gate.sh`.
- Slice 3: the named inspector Playwright CI app, then the extended gate.
- Slice 4: the named UX capture CI app, a full local UX-judge run, then the
  extended gate.
- Slice 5: combined-site route/asset smoke, full extended gate, GitHub checks,
  and live-preview HTTP/browser smoke.

## Final Evidence

The draft PR remains draft for the epic owner. Its living body must contain a
parity table for routes, tabs, providers, examples, books, and SHACL validation,
plus the final gate tail, head SHA, and preview URL.
