# Implementation Plan: Bookable decoded-tree identifiers

**Branch**: `feat/63-bookable-identifier-restriction` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/063-bookable-identifier-restriction/spec.md`

## Summary

Define a pure host-neutral predicate in the established shared `lib/` package
that accepts only reusable decoded identifier kinds (address, credential key,
script, script hash). Prove the allowlist directly in the shared PureScript
test suite, then make the WebUI's decoded-tree annotation action require that
predicate in addition to its existing unresolved/non-empty guards. Rewrite the
existing browser labeling journey so an address creates the local book, a
verification key appends to it, and representative transaction-scoped rows
prove the action is absent.

## Technical Context

**Language/Version**: PureScript 0.15.16; JavaScript browser tests on Node.js 22
**Primary Dependencies**: Prelude, Halogen 7, existing `cardano-addresses` shared package, Playwright
**Storage**: Existing browser local-book store; no storage-shape change
**Testing**: Spago `cardano-addresses-test` suite, inspector Playwright journey, repository `./gate.sh`
**Target Platform**: Shared PureScript library plus static WebUI
**Project Type**: Shared library consumed by a browser application
**Performance Goals**: Constant-time identifier-kind classification with no visible rendering delay
**Constraints**: No host-side Cardano semantics, no new dependencies, WebUI action only, RED before GREEN, one commit per slice
**Scale/Scope**: One pure predicate, one WebUI guard, one shared unit-test module, and one existing browser journey

## Constitution Check

- **One operation model, multiple hosts — PASS**: bookability policy lives in
  the shared package and is independent of browser state.
- **Browser-first, CLI-parity-conscious — PASS**: only the editor action is
  WebUI-specific; future hosts can consume the same predicate.
- **Authoritative Cardano engines — PASS**: the change classifies decoded row
  kinds already supplied by the engine; it derives no Cardano identifiers.
- **Local-first secret handling — PASS**: no secret or provider path changes.
- **Honest capability boundaries — PASS**: generic hashes and
  transaction-scoped identities are rejected instead of being presented as
  reusable book entries.
- **Nix and vertical-slice workflow — PASS**: both slices build and test at
  their own commits, and the final repository gate remains authoritative.

Post-design re-check: all gates remain PASS; no exception or complexity waiver
is required.

## Project Structure

### Documentation

```text
specs/063-bookable-identifier-restriction/
├── checklists/requirements.md
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md
```

### Source and tests

```text
lib/src/Cardano/
└── BookableIdentifier.purs

test/src/Test/
├── BookableIdentifier.purs
└── Main.purs

docs/inspector/
├── src/Main.purs
└── tests/tx-identify.spec.mjs

gate.sh
```

**Structure Decision**: The predicate is a small sibling module in the
host-neutral `cardano-addresses` package, alongside the merged shared provider
core. The WebUI imports it through its existing dependency on that package.
Browser rendering and end-to-end proof remain under `docs/inspector/`.

## Slice Design

### Slice A — shared bookability policy

Owned files:

- `lib/src/Cardano/BookableIdentifier.purs`
- `test/src/Test/BookableIdentifier.purs`
- `test/src/Test/Main.purs`

RED adds direct assertions for accepted and rejected semantic kinds and wires
them into the existing shared test main. GREEN adds only the pure allowlist.
Focused proof: `nix develop --quiet -c spago test -p cardano-addresses-test`.

Commit: `feat(inspector): classify bookable identifier kinds`

### Slice B — WebUI restriction and browser regression

Owned files:

- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/tx-identify.spec.mjs`

RED changes the existing local-book journey to assert that transaction hash,
output identity/reference, auxiliary-data hash, script-data hash, and datum
hash rows expose no label action, while address and verification-key rows
retain it. GREEN imports the shared predicate and adds it to the existing
annotation-action guard. Focused proof: `nix run .#ci-inspector-playwright`.

Commit: `fix(inspector): restrict labels to bookable identifiers`

### Orchestrator-owned final gate extension

After both behavior slices are accepted, extend—not replace—the existing
`gate.sh` inventory with anchors for the shared predicate, direct tests,
WebUI consumption, and browser regression. Run `./gate.sh` at the resulting
HEAD before finalization.

## Risk Controls

- Preserve the existing non-empty annotation predicate/value and unresolved
  label guards; the new predicate narrows eligibility only.
- Keep generic `hash`, `tx-out-ref`, `output`, `integer`,
  `raw-bytes`, and unknown kinds rejected even if they carry annotation data.
- Cover script kinds in the direct shared test because the representative
  browser fixture does not render script rows.
- Do not change `FFI/RdfShapes.js` or RDF query semantics; this ticket
  consumes the semantic kinds already emitted.
- Do not alter copy controls, address-first presentation, Turtle generation,
  persistence, or resolution.

## Complexity Tracking

No constitution violations.
