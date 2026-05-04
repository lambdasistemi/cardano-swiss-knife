# Implementation Plan: Browser-Based Cardano Address Toolkit

**Branch**: `001-cardano-addr-web` | **Date**: 2026-04-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-cardano-addr-web/spec.md`

## Summary

A PureScript Spago workspace delivering two packages: `cardano-addresses` (standalone library porting the Haskell cardano-addresses logic) and `cardano-addresses-browser` (Halogen web app consuming the library). The library handles bech32/base58 encoding, Blake2b-224 hashing, BIP32-Ed25519 key derivation, Shelley address construction/inspection, and native script operations — all via FFI to established JS crypto libraries. The browser app provides a pipeline UI where each derivation step feeds into the next.

## Technical Context

**Language/Version**: PureScript 0.15.16, Spago workspace format
**Primary Dependencies**: Halogen 7 (UI), @noble/hashes (Blake2b), bech32 (encoding), @scure/base (base58), @scure/bip39 (mnemonics), cardano-crypto.js (BIP32-Ed25519)
**Storage**: N/A (stateless, browser-only)
**Testing**: spago test (PureScript spec), manual test vectors from Haskell cardano-addresses
**Target Platform**: Modern browsers (Chrome 90+, Firefox 90+, Safari 15+)
**Project Type**: library + web-app (two Spago packages in one workspace)
**Performance Goals**: All operations < 2s, initial load < 3s
**Constraints**: Offline-capable after first load, bundle < 500KB gzipped, no server
**Scale/Scope**: Single-page app, ~8 UI panels, ~15 library modules

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Browser-Native | PASS | All crypto via JS FFI, no server |
| II. Feature Parity with CLI | PASS | All 17 CLI commands mapped to library functions |
| III. Pipeline UX | PASS | User Story 7 explicitly covers pipeline flow |
| IV. PureScript + Halogen | PASS | Spago workspace, Halogen 7, esbuild bundling |
| V. Correctness Over Features | PASS | Test vectors from Haskell reference; SC-003 mandates byte-identical output |

No violations. Gate passes.

## Project Structure

### Documentation (this feature)

```text
specs/001-cardano-addr-web/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── library-api.md
└── tasks.md
```

### Source Code (repository root)

```text
lib/
├── spago.yaml                          # cardano-addresses package
└── src/
    ├── Cardano/
    │   ├── Address.purs                # Address type, bech32/base58 encode/decode
    │   ├── Address/
    │   │   ├── Bech32.purs             # Bech32 encoding FFI wrapper
    │   │   ├── Base58.purs             # Base58 encoding FFI wrapper
    │   │   ├── Hex.purs                # Hex encoding utilities
    │   │   ├── Hash.purs               # Blake2b-224 credential hashing
    │   │   ├── Derivation.purs         # Key types, XPrv/XPub, derivation
    │   │   ├── Style/
    │   │   │   └── Shelley.purs        # Shelley address construction/inspection
    │   │   ├── Script.purs             # Native script types + hashing
    │   │   ├── Script/
    │   │   │   ├── Parser.purs         # Script expression parser
    │   │   │   └── Cbor.purs           # Script CBOR serialization
    │   │   └── Inspect.purs            # Address inspection (all styles)
    │   ├── Mnemonic.purs               # BIP39 mnemonic generation/validation
    │   └── Codec/
    │       └── Bech32/
    │           └── Prefixes.purs       # CIP-5 HRP constants
    └── FFI/
        ├── Bech32.js                   # FFI: bech32 npm package
        ├── Blake2b.js                  # FFI: @noble/hashes blake2b
        ├── Base58.js                   # FFI: @scure/base base58
        ├── Mnemonic.js                 # FFI: @scure/bip39
        └── Crypto.js                   # FFI: cardano-crypto.js (ed25519-bip32)

app/
├── spago.yaml                          # cardano-addresses-browser package
└── src/
    ├── Main.purs                       # Halogen mount point
    ├── App.purs                        # Root component, sidebar + routing
    ├── Component/
    │   ├── Sidebar.purs                # Navigation sidebar
    │   ├── AddressInspect.purs         # Address inspection panel
    │   ├── MnemonicGen.purs            # Mnemonic generation panel
    │   ├── KeyDerivation.purs          # Key derivation pipeline panel
    │   ├── KeyInspect.purs             # Key inspection + hashing panel
    │   ├── AddressConstruct.purs       # Address construction panel
    │   ├── ScriptOps.purs              # Script hash/preimage/validate panel
    │   ├── Pipeline.purs               # Full pipeline flow panel
    │   └── Common/
    │       ├── Output.purs             # Output display with copy button
    │       ├── NetworkSelector.purs    # Network tag pill selector
    │       └── InputField.purs         # Styled input/textarea
    └── Util/
        └── Clipboard.purs             # Clipboard API FFI

dist/
├── index.html                          # Static HTML shell
└── app.js                              # esbuild bundle output (gitignored)
```

**Structure Decision**: Two-package Spago workspace. `lib/` is the standalone library with zero UI dependencies. `app/` is the Halogen consumer. FFI JS files live alongside PureScript source in `lib/src/FFI/`. Build produces two bundles: `dist/app.js` (full app) and `dist/cardano-addresses.js` (library-only).
