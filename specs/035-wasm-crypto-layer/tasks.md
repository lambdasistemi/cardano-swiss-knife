# Tasks: Replace JS Crypto with WASM

**Input**: Design documents from `/specs/035-wasm-crypto-layer/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: WASM bridge infrastructure and dependency setup

- [x] T001 Add `@bjorn3/browser_wasi_shim` to `package.json` dependencies
- [x] T002 Create WASM bridge module `lib/src/Cardano/Address/Wasm.js` — implement `loadWasmModule` (fetch + compile), `callWasm` (WASI stdin/stdout JSON protocol using OpenFile, ConsoleStdout, WASI from browser_wasi_shim)
- [x] T003 Create PureScript FFI types `lib/src/Cardano/Address/Wasm.purs` — `WasmModule` type, `loadWasmModule :: String -> Effect (Promise WasmModule)`, `callWasm :: WasmModule -> String -> Effect (Promise (Either String String))`
- [x] T004 Add WASM binary fetch path configuration — base URL for `.wasm` files relative to `dist/`
- [x] T005 Build `inspect-address.wasm` from `paolino/cardano-addresses` using `wasm32-wasi-cabal --project-file=cabal-wasm.project build inspect-address` and place in `dist/`

**Checkpoint**: WASM bridge loads and can execute `inspect-address.wasm` in browser

---

## Phase 2: Foundational — Single Haskell WASM Executable

**Purpose**: Refactor `inspect-address` into a unified `cardano-addresses.wasm` with JSON command dispatch. Each subsequent phase adds a new command to this executable.

- [ ] T006 Refactor `browser/inspect.hs` → `browser/Main.hs` in `paolino/cardano-addresses` — add JSON command dispatcher that reads `{"cmd":"inspect", ...}` from stdin; move existing inspect logic under the `inspect` command. Rename executable from `inspect-address` to `cardano-addresses-wasm` in cabal.
- [ ] T007 Add `derive` command to `browser/Main.hs` — reads `{"cmd":"derive", "mnemonic":"...", "path":"1852H/1815H/0H/0/0"}`, outputs all derived keys as JSON (root, account, address, stake — both xsk and xvk hex-encoded)
- [ ] T008 Add `make-address` command to `browser/Main.hs` — reads `{"cmd":"make-address", "payment_key":"...", "stake_key":"...", "network":"mainnet", "type":"base"}`, outputs address as JSON (bech32, hex)
- [ ] T009 Add `sign` command to `browser/Main.hs` — reads `{"cmd":"sign", "key":"...", "message":"..."}`, outputs JSON (signature hex, verification key)
- [ ] T010 Test all commands with `wasmtime`: pipe known test vector inputs as JSON, verify outputs match expected values
- [ ] T011 Update `.github/workflows/wasm.yml` in `paolino/cardano-addresses` to build and publish `cardano-addresses.wasm` as release artifact

**Checkpoint**: Single WASM binary handles all 4 commands, passes wasmtime tests, available as CI artifact

---

## Phase 3: User Story 1 — Address Inspection via WASM (Priority: P1) MVP

**Goal**: Replace hand-written JS CBOR inspection with `cardano-addresses.wasm` `inspect` command

**Independent Test**: Paste any bech32/base58 address in Inspect panel, verify output matches test vectors

### Implementation for User Story 1

- [x] T012 [US1] Rewrite `lib/src/Cardano/Address/Inspect.js` — replace `inspectLegacyAddressImpl` and `inspectShelleyAddressImpl` with calls to `Wasm.callWasm(inspectModule, addressString)`, parse JSON response into existing result shape
- [x] T013 [US1] Update `lib/src/Cardano/Address/Inspect.purs` — change FFI imports to use async WASM calls (Effect Promise instead of pure), add WasmModule parameter or module-level initialization
- [x] T014 [US1] Update `app/src/App.purs` inspect handler — adapt to async WASM call pattern (Aff instead of pure), ensure loading state shown during WASM cold start
- [ ] T015 [US1] Copy `cardano-addresses.wasm` to `dist/wasm/` and update build scripts (`justfile`, `nix/packages/`) to include WASM binary in distribution
- [ ] T016 [US1] Run PureScript test vectors (`npx spago test`) — verify all inspection vectors pass against WASM backend
- [ ] T017 [US1] Run Playwright tests (`tests/inspect.spec.ts`) — verify UI behavior unchanged

**Checkpoint**: Inspect panel works via WASM. All inspect test vectors and Playwright tests pass.

---

## Phase 4: User Story 2 — Key Derivation via WASM (Priority: P2)

**Goal**: Replace `cardano-crypto.js` key derivation with `cardano-addresses.wasm` `derive` command

**Independent Test**: Enter known mnemonic, verify derived keys at all levels match test vectors

### Implementation for User Story 2

- [ ] T018 [US2] Rewrite `lib/src/Cardano/Address/Derivation.js` — replace `deriveRootKeyImpl`, `deriveAccountKeyImpl`, `deriveAddressKeyImpl`, `deriveStakeKeyImpl` with calls to `Wasm.callWasm(deriveModule, jsonPayload)`
- [ ] T019 [US2] Update `lib/src/Cardano/Address/Derivation.purs` — adapt FFI signatures to async WASM pattern, preserve existing PureScript types (`XPrv`, `XPub`, `DerivationPath`)
- [ ] T020 [US2] Rewrite `lib/src/Cardano/Address/Bootstrap.js` — replace Byron/Icarus key derivation with calls to `derive-key.wasm` using `style: "byron"` / `style: "icarus"`
- [ ] T021 [US2] Update `lib/src/Cardano/Address/Bootstrap.purs` — adapt FFI signatures to async WASM pattern
- [ ] T022 [US2] Rewrite `lib/src/Cardano/Mnemonic.js` — replace `@scure/bip39` entropy extraction with pass-through (mnemonic text goes directly to `derive-key.wasm`)
- [ ] T023 [US2] Update `lib/src/Cardano/Mnemonic.purs` — simplify to text validation only, entropy conversion handled by WASM
- [ ] T024 [US2] Update `app/src/App.purs` derivation handlers — adapt to async WASM calls for all derivation paths
- [ ] T025 [US2] Run PureScript test vectors — verify all derivation, bootstrap, and mnemonic vectors pass
- [ ] T026 [US2] Run Playwright tests (`tests/derivation.spec.ts`, `tests/mnemonic.spec.ts`, `tests/legacy-bootstrap.spec.ts`) — verify UI unchanged

**Checkpoint**: Full derivation pipeline works via WASM. All derivation/bootstrap/mnemonic tests pass.

---

## Phase 5: User Story 3 — Address Construction via WASM (Priority: P3)

**Goal**: Replace JS address construction with `cardano-addresses.wasm` `make-address` command

**Independent Test**: Given known keys and network, verify constructed addresses match test vectors

### Implementation for User Story 3

- [ ] T027 [US3] Rewrite `lib/src/Cardano/Address/Shelley.js` — replace enterprise, base, reward, pointer address construction with calls to `Wasm.callWasm(makeAddressModule, jsonPayload)`
- [ ] T028 [US3] Update `lib/src/Cardano/Address/Shelley.purs` — adapt FFI signatures to async WASM pattern, preserve existing address types
- [ ] T029 [US3] Rewrite `lib/src/Cardano/Address/Script.js` — replace script hash computation with WASM call
- [ ] T030 [US3] Update `lib/src/Cardano/Address/Script.purs` — adapt FFI signatures
- [ ] T031 [US3] Delete `lib/src/Cardano/Address/Hash.js` — Blake2b hashing now done inside WASM executables
- [ ] T032 [US3] Update `lib/src/Cardano/Address/Hash.purs` — remove JS FFI, re-export from WASM if still needed or remove entirely
- [ ] T033 [US3] Update `app/src/App.purs` address construction handlers — adapt to async WASM calls
- [ ] T034 [US3] Run PureScript test vectors — verify all Shelley address and script hash vectors pass
- [ ] T035 [US3] Run Playwright tests (`tests/scripts.spec.ts`) — verify UI unchanged

**Checkpoint**: Address construction works via WASM. All Shelley/script tests pass.

---

## Phase 6: User Story 4 — Signing via WASM (Priority: P4)

**Goal**: Replace JS Ed25519 signing with `cardano-addresses.wasm` `sign` command

**Independent Test**: Sign known message with known key, verify signature matches test vectors

### Implementation for User Story 4

- [ ] T036 [US4] Rewrite `lib/src/Cardano/Address/Signing.js` — replace Ed25519 sign/verify with calls to `Wasm.callWasm(signModule, jsonPayload)`
- [ ] T037 [US4] Update `lib/src/Cardano/Address/Signing.purs` — adapt FFI signatures to async WASM pattern
- [ ] T038 [US4] Update `app/src/App.purs` signing handlers — adapt to async WASM calls
- [ ] T039 [US4] Run PureScript test vectors — verify all signing vectors pass
- [ ] T040 [US4] Run Playwright tests (`tests/signing.spec.ts`) — verify UI unchanged

**Checkpoint**: Signing works via WASM. All signing tests pass.

---

## Phase 7: User Story 5 — JS Dependency Removal (Priority: P5)

**Goal**: Remove JS crypto dependencies, keep only `@bjorn3/browser_wasi_shim`

**Independent Test**: Build succeeds, all tests pass, bundle size acceptable

### Implementation for User Story 5

- [ ] T041 [US5] Remove `cardano-crypto.js` from `package.json`
- [ ] T042 [P] [US5] Remove `@noble/hashes` from `package.json`
- [ ] T043 [P] [US5] Remove `@scure/bip39` from `package.json`
- [ ] T044 [US5] Run `npm install` to regenerate `package-lock.json`
- [ ] T045 [US5] Verify `spago build -p cardano-addresses` succeeds with no warnings
- [ ] T046 [US5] Verify `spago build -p cardano-addresses-browser` succeeds
- [ ] T047 [US5] Bundle with esbuild and verify bundle size under 500KB gzipped (excluding WASM binaries)
- [ ] T048 [US5] Run full Playwright test suite — all specs pass
- [ ] T049 [US5] Update `nix/purescript.nix` and `nix/packages/` to include WASM binaries in `web-dist` derivation
- [ ] T050 [US5] Update `flake.nix` to fetch WASM artifacts from `paolino/cardano-addresses` releases as fixed-output derivations
- [ ] T051 [US5] Run `nix flake check` — all Nix checks pass

**Checkpoint**: All JS crypto removed. App fully runs on WASM. CI green.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T052 Update `package.json` description and scripts if needed
- [ ] T053 Update `.specify/memory/constitution.md` — amend Technical Constraints to reflect WASM instead of JS crypto deps
- [ ] T054 Run full CI (`just ci`) — all checks pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Haskell WASM)**: No dependencies on Phase 1 (different repo). Can run in parallel with Phase 1.
- **Phase 3 (US1 Inspect)**: Depends on Phase 1 (bridge) + T006 (`inspect` command in `cardano-addresses.wasm`)
- **Phase 4 (US2 Derive)**: Depends on Phase 1 (bridge) + T007 (`derive` command added to WASM binary)
- **Phase 5 (US3 Address)**: Depends on Phase 1 (bridge) + T008 (`make-address` command added)
- **Phase 6 (US4 Sign)**: Depends on Phase 1 (bridge) + T009 (`sign` command added)
- **Phase 7 (US5 Cleanup)**: Depends on Phases 3-6 all complete
- **Phase 8 (Polish)**: Depends on Phase 7

### Cross-repo dependency

Each phase depends on the corresponding command being added to the single `cardano-addresses.wasm` binary in `paolino/cardano-addresses`. Phase 2 tasks build the Haskell executable; browser repo tasks consume the rebuilt WASM binary.

### Parallel Opportunities

- Phase 1 and Phase 2 can run in parallel (different repos)
- Within Phase 2: T006, T007, T008 can run in parallel
- Once Phase 2 is complete: US1-US4 (Phases 3-6) can run sequentially or in parallel
- Within Phase 7: T041, T042, T043 can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: WASM bridge setup
2. Build inspect-address.wasm (T005, already exists)
3. Complete Phase 3: Replace inspect with WASM
4. **STOP and VALIDATE**: All inspect tests pass, UI works
5. This alone proves the entire pattern

### Incremental Delivery

1. Phase 1 + Phase 2 (parallel) → Foundation ready
2. Phase 3 (US1 Inspect) → MVP, validates pattern
3. Phase 4 (US2 Derive) → Core pipeline works
4. Phase 5 (US3 Address) → Full pipeline
5. Phase 6 (US4 Sign) → All operations migrated
6. Phase 7 (US5 Cleanup) → Dependencies removed
7. Phase 8 (Polish) → Ship it
