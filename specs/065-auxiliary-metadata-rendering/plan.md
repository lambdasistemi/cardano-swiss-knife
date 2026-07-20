# Implementation Plan: Decoded auxiliary metadata in Structure

**Branch**: `feat/65-metadata-rendering` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/065-auxiliary-metadata-rendering/spec.md`

## Summary

Advance the pinned `cardano-ledger-inspector` input from pre-#160 revision
`4384360` to a revision containing merge commit `a4cf31f`. Extend the existing
PureScript `tx.intent` normalization with the engine's recursive tagged metadata
union and render it below the decoded RDF tree in Structure. Prove the signer
journey with the existing treasury fixture and prove losslessness with the
engine's all-types metadata fixture.

## Technical Context

**Language/Version**: PureScript 0.15.16; JavaScript browser tests on Node.js 22
**Primary Dependencies**: Halogen 7, version-pinned cardano-ledger-inspector WASI, Playwright
**Storage**: None
**Testing**: Focused inspector Playwright journey plus repository `./gate.sh`
**Target Platform**: Static WebUI
**Constraints**: No host-side CBOR decoding, no new dependencies, exact strings/order, RED before GREEN, one behavior commit
**Scale/Scope**: One recursive result type, one Structure renderer, one engine pin, two browser scenarios

## Engine Contract

`result.intent.auxiliary_data.metadata` is always an array of:

```text
{ label: String, value: MetadataValue }

MetadataValue =
  { type: "int", value: String }
  | { type: "bytes", hex: String }
  | { type: "text", value: String }
  | { type: "list", items: Array MetadataValue }
  | { type: "map", entries: Array { key: MetadataValue, value: MetadataValue } }
```

The host projects this transport shape for rendering only. It does not parse
CBOR, convert decimal strings to numbers, decode bytes, sort arrays, or turn maps
into objects.

## Architecture Boundaries

- `cardano-ledger-inspector` remains the sole owner of auxiliary-data and
  metadatum decoding.
- `FFI.Json` performs presentation-only tagged-union normalization, retaining
  exact scalar strings and array order. Unknown/malformed nodes normalize to a
  non-fatal presentation fallback rather than throwing.
- `Main.purs` owns recursive Halogen rendering and explicit self-declared-data
  wording. It derives no Cardano meaning from keys or values.
- RDF Structure rendering remains intact; typed intent metadata augments its
  current opaque `auxiliary_data.metadata` count.

## Project Structure

```text
flake.lock
docs/inspector/
├── src/FFI/Json.purs
├── src/Main.purs
└── tests/
    ├── fixtures/tx-intent-metadata-all-types.hex
    └── tx-identify.spec.mjs

specs/065-auxiliary-metadata-rendering/
├── spec.md
├── plan.md
└── tasks.md

gate.sh
```

## Slice Design

### Slice A — consume and render typed metadata

Owned files:

- `flake.lock`
- `docs/inspector/src/FFI/Json.purs`
- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/fixtures/tx-intent-metadata-all-types.hex`
- `docs/inspector/tests/tx-identify.spec.mjs`

RED first extends Playwright with the existing Amaru fixture and the upstream
all-types fixture. Against the old engine pin/current count-only Structure it
must fail because labels and recursive typed values are absent. Navigator
approval of the failing handoff is required before GREEN.

GREEN updates the lock, adds lossless presentation types/readers, and renders a
recursive metadata section in Structure. Lists use indexed items; maps use
ordered entry containers with independent key/value subtrees. Scalar type and
content remain visible and copyable/readable. Empty metadata emits no duplicate
panel and leaves existing RDF absence behavior unchanged.

Focused proof:

```sh
nix run .#ci-inspector-playwright -- --grep "renders decoded auxiliary metadata"
```

Commit: `feat(inspector): render decoded auxiliary metadata`

### Orchestrator-owned final gate extension

After the behavior slice is accepted, append metadata contract, renderer,
fixture, and browser-proof anchors to the accumulated `gate.sh`. Run the full
gate, commit the extension, audit task/commit linkage, update the PR body, and
drop the gate only at final mark-ready per the resolve-ticket lifecycle.

## Risk Controls

- Keep recursive metadata values as an algebraic data type rather than an
  untyped JSON/object renderer.
- Preserve decimal integers and labels as strings to avoid precision loss.
- Preserve list/map arrays exactly as supplied; never sort or objectify maps.
- Treat malformed/unknown tags as localized presentation fallback so the rest
  of inspection remains usable.
- Reuse the merged engine fixture to keep host expectations aligned with the
  canonical engine contract.
- Run the whole gate after updating the Nix lock because the engine revision
  affects multiple operations beyond metadata.

## Complexity Tracking

No architecture or constitution violations. The dependency bump and UI wiring
are intentionally one vertical commit because neither independently delivers a
user-visible, testable metadata tree.
