# Implementation Plan: Patch Generated VKey Witnesses into Transaction CBOR

**Branch**: `feat/patch-signed-tx-cbor` | **Date**: 2026-05-04 | **Spec**: `specs/036-signed-tx-cbor/spec.md`
**Input**: Feature specification from `/specs/036-signed-tx-cbor/spec.md`

## Summary

Extend the existing transaction-signing flow so it still produces detached witness details but also mutates the inspected transaction CBOR locally by inserting or replacing the generated vkey witness in the witness set. Keep the browser UI honest by rendering the signed transaction artifact and removing detached-only wording.

## Technical Context

**Language/Version**: PureScript 0.15 with JavaScript FFI on Node 24 / browser  
**Primary Dependencies**: Halogen, existing `cardano-addresses` signing primitives, existing ledger-inspector WASM bridge  
**Storage**: Browser-local app state plus encrypted vault for secrets; no new persistent storage  
**Testing**: Playwright browser tests, `spago build`, existing `just` wrappers  
**Target Platform**: Static browser app with Node-based local test harness  
**Project Type**: Browser application backed by reusable PureScript modules and WASM helpers  
**Performance Goals**: Keep transaction patching fast enough to feel immediate on fixture-sized transactions  
**Constraints**: Preserve local-first secret handling, preserve non-target witness content, do not widen scope into submission or hardware signing  
**Scale/Scope**: One vertical slice on the Transactions page plus supporting FFI and docs updates

## Constitution Check

- **One operation model, multiple hosts**: Pass. The new output extends the transaction-signing operation rather than inventing a browser-only workflow.
- **Browser-first, CLI-parity-conscious**: Pass. Patching is modeled as transaction mutation output that a future CLI can expose with the same shape.
- **Authoritative Cardano engines**: Pass with constraint. Signing and witness planning remain on existing Cardano engines; the new logic is limited to CBOR witness-set mutation, not ledger reimplementation.
- **Local-first secret handling**: Pass. Signing keys remain local and no provider secret path changes.
- **Honest capability boundaries**: Pass only if UI/docs stop claiming detached-only output and the scope remains limited to vkey witness patching.

## Project Structure

### Documentation (this feature)

```text
specs/036-signed-tx-cbor/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── tx-signing-result.md
└── tasks.md
```

### Source Code (repository root)

```text
app/src/
├── App.purs
└── TxInspector/
    ├── Signing.js
    └── Signing.purs

docs/
├── concepts.md
└── index.md

tests/
└── transactions.spec.ts
```

**Structure Decision**: Keep the change inside the existing transaction-signing slice: Playwright regression, signing FFI patcher, app rendering, and documentation wording updates.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Small in-tree CBOR patcher | Needed to mutate witness sets locally without a new backend | Extending the ledger-inspector WASM would take a wider cross-repo change for a narrow witness-set mutation |
