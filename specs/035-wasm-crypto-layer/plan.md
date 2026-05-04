# Implementation Plan: Replace JS Crypto with WASM

**Branch**: `035-wasm-crypto-layer` | **Date**: 2026-04-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/035-wasm-crypto-layer/spec.md`

## Summary

Replace all JS crypto reimplementations (12 FFI files, 5 npm dependencies) with the real Haskell `cardano-addresses` library compiled to a single WASM binary. Communication via JSON command dispatch over WASI stdin/stdout. Benchmarked at 3-4ms per call (Shelley), 13ms (legacy). Single 5MB binary, ~1.5MB gzipped.

## Technical Context

**Language/Version**: PureScript 0.15.16, Haskell GHC 9.12 (WASM backend)
**Primary Dependencies**: @bjorn3/browser_wasi_shim (browser WASI), wasm32-wasi-cabal (build)
**Storage**: N/A (client-side only)
**Testing**: Playwright E2E, PureScript spago test, wasmtime CLI
**Target Platform**: Browser (Chrome, Firefox, Safari latest)
**Project Type**: Web application (single-page, client-side)
**Performance Goals**: <100ms per WASM operation including cold start
**Constraints**: Offline-capable after initial load, no server backend
**Scale/Scope**: Developer tool, single user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Browser-Native | PASS | WASM runs entirely client-side, no server |
| II. Feature Parity with CLI | PASS | Using the actual CLI library compiled to WASM — parity by construction |
| III. Pipeline UX | PASS | Same UI pipeline, only the backend computation changes |
| IV. PureScript + Halogen | PASS | PureScript layer preserved, only JS FFI changes |
| V. Correctness Over Features | PASS | Byte-identical to Haskell by definition (same code) |
| VI. Reference Semantics | PASS | No longer a reimplementation — IS the reference |

**Post-design re-check**: All gates still pass. WASM approach strengthens correctness guarantees.

## Project Structure

### Documentation (this feature)

```text
specs/035-wasm-crypto-layer/
├── plan.md              # This file
├── research.md          # Architecture decisions
├── data-model.md        # WASM protocol schemas
├── quickstart.md        # Dev setup guide
└── tasks.md             # Implementation tasks (next step)
```

### Source Code (repository root)

```text
lib/
├── src/Cardano/Address/Wasm.js       # NEW: browser_wasi_shim bridge
├── src/Cardano/Address/Wasm.purs     # NEW: PureScript WASM FFI types
├── src/Cardano/Address/Inspect.js    # REPLACED: calls Wasm instead of CBOR parsing
├── src/Cardano/Address/Derivation.js # REPLACED: calls Wasm instead of cardano-crypto.js
├── src/Cardano/Address/Shelley.js    # REPLACED: calls Wasm instead of byte manipulation
├── src/Cardano/Address/Signing.js    # REPLACED: calls Wasm instead of cardano-crypto.js
├── src/Cardano/Address/Hash.js       # DELETED: hashing done inside WASM
├── src/Cardano/Address/Bootstrap.js  # DELETED: absorbed into derive-key.wasm
├── src/Cardano/Mnemonic.js           # DELETED: absorbed into derive-key.wasm
├── src/Cardano/Address/Bech32.js     # KEPT: needed for UI-level encoding (non-crypto)
├── src/Cardano/Address/Base58.js     # KEPT: needed for UI-level encoding (non-crypto)
├── src/Cardano/Address/Hex.js        # KEPT: needed for UI-level hex display
├── src/Cardano/Bytes.js              # KEPT: needed for byte manipulation utilities
└── src/Cardano/Address/Script.js     # REPLACED: script hashing via WASM

dist/
├── app.js                            # Bundled PureScript app
├── index.html                        # Entry point
└── wasm/
    └── cardano-addresses.wasm        # Single WASM binary with cmd dispatch

test/
├── src/Test/Main.purs                # Existing test runner (unchanged)
└── src/Test/Vectors.purs             # Existing vector types (unchanged)

tests/
├── *.spec.ts                         # Existing Playwright tests (unchanged)
```

**Structure Decision**: Minimal structural change. New `Wasm.js`/`Wasm.purs` module added. Existing FFI files replaced in-place. Single WASM binary in `dist/wasm/`.

## Complexity Tracking

No constitution violations.

## Migration Strategy

Single WASM executable in `paolino/cardano-addresses`, growing incrementally. Each user story adds a new command to the Haskell executable and replaces the corresponding JS FFI files in the browser repo.

**Order**: Inspect (P1) → Derive (P2) → Address (P3) → Sign (P4) → Cleanup (P5)

- The WASM bridge (`Wasm.js`/`Wasm.purs`) is built in P1 and reused by all subsequent stories.
- The Haskell executable starts with `inspect` (P1) and gains `derive`, `make-address`, `sign` commands in P2-P4.
- Each story rebuilds the single WASM binary with the new command added.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WASM binary too large | Low | Low | Single binary ~5MB / ~1.5MB gzipped; benchmarked at 9ms compile |
| browser_wasi_shim missing syscalls | Low | High | Proven with inspect-address already |
| Cold start latency noticeable | Low | Low | Module pre-compilation on page load |
| New WASM executables fail to compile | Medium | High | Build incrementally, test with wasmtime first |
| Bech32/Base58 encoding needed outside WASM | N/A | N/A | Keep Bech32.js/Base58.js for UI-level encoding |
