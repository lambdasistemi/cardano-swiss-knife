# Implementation Plan: Inspectable transaction inputs

**Branch**: `feat/64-input-reference-resolution` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/064-input-reference-resolution/spec.md`

## Summary

Extend the existing WebUI adapter for `tx.witness.plan` with a typed projection
of the ledger engine's `resolved_inputs` and `resolved_reference_inputs`,
including the raw output reference, resolution status/source, address,
lovelace, and flattened native assets. Render that same authoritative model in
Witness and alongside matching Structure input rows. Add a Halogen action that
loads the producing transaction hash through the current `Cardano.Provider`
selection. Prove the complete journey at the existing mocked provider boundary.

## Technical Context

**Language/Version**: PureScript 0.15.16; JavaScript browser adapter/tests on Node.js 22
**Primary Dependencies**: Halogen 7, shared `Cardano.Provider`, version-pinned ledger-inspector WASM, Playwright
**Storage**: Existing browser settings only; no new persistence
**Testing**: Focused inspector Playwright journey plus repository `./gate.sh`
**Target Platform**: Static WebUI
**Constraints**: No new dependencies, no provider duplication, no host-side Cardano semantics, RED before GREEN, one behavior commit
**Scale/Scope**: One typed result projection, two tab presentations, one producer drill action, one integrated browser regression

## Architecture Boundaries

- `Cardano.Provider.resolveProducerTxContext` remains the sole owner of
  provider selection, authentication, network mapping, producer-CBOR fetches,
  and unique-producer deduplication.
- Ledger-inspector WASM remains the sole owner of decoding producer CBOR and
  resolving an input index to `tx_out`.
- `FFI.Json` performs presentation-only normalization of returned JSON: string
  preservation, asset-map flattening, and typed records. It derives no Cardano
  semantics.
- `Main.purs` owns only Halogen state transitions and rendering. Producer
  drill-in switches to hash mode and reuses the normal `Decode` path.

## Project Structure

```text
docs/inspector/
├── src/Main.purs
├── src/FFI/Json.purs
├── src/FFI/Json.js
└── tests/tx-identify.spec.mjs

specs/064-input-reference-resolution/
├── spec.md
├── plan.md
└── tasks.md

gate.sh
```

## Slice Design

### Slice A — resolved input context and producer drill-in

Owned files:

- `docs/inspector/src/FFI/Json.purs`
- `docs/inspector/src/FFI/Json.js`
- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/tx-identify.spec.mjs`

RED extends the existing producer-CBOR browser journey so the current compact
rows fail assertions for regular/reference classification, full address,
lovelace, native assets, and a producer drill control. It also records unique
producer requests, performs the drill, and keeps the existing zero-`/utxos`
assertion. Navigator approval of the failing handoff is required before GREEN.

GREEN adds the typed presentation projection and renders it in both tabs,
matching Structure rows by the full `txId#index`. The drill control dispatches
an action that sets hash mode/hash and invokes the existing provider-backed
decode path. Missing resolution keeps the raw reference and reason.

Focused proof:

```sh
nix run .#ci-inspector-playwright -- --grep "resolves input and reference input context"
```

Commit: `feat(inspector): expose resolved transaction inputs`

### Orchestrator-owned final gate extension

After the behavior slice is accepted, extend—not replace—the accumulated
`gate.sh` with anchors for the typed projection, both-tab rendering, producer
drill action, provider request accounting, and missing-context proof. Run the
full gate and commit the extension separately.

## Risk Controls

- Preserve raw references and engine reasons even when no `tx_out` exists.
- Keep all quantities as strings so large Cardano values are never rounded by
  JavaScript numbers.
- Flatten assets deterministically without interpreting policy or asset-name
  bytes.
- Match Structure rows only by exact full output references, never compacted
  display text.
- Reuse `Decode` for drill-in so credentials, selected provider, network,
  errors, and loading behavior cannot diverge.
- Retain explicit request counters proving deduplication and zero direct UTxO
  endpoint use.

## Complexity Tracking

No architecture or constitution violations. The persistent accumulated
`gate.sh` is repository convention and is not dropped at finalization.
