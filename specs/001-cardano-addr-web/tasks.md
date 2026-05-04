# Tasks: Browser-Based Cardano Address Toolkit

**Input**: Design documents from `/specs/001-cardano-addr-web/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/library-api.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup

**Purpose**: Project initialization, build tooling, FFI foundation

- [ ] T001 Create directory structure per plan (`lib/src/`, `app/src/`, `dist/`) at repository root
- [ ] T002 Write root `spago.yaml` workspace config, `lib/spago.yaml`, `app/spago.yaml` at repository root
- [ ] T003 [P] Write `flake.nix` with purescript-overlay devShell at repository root
- [ ] T004 [P] Write `package.json` with JS dependencies (@noble/hashes, bech32, @scure/base, @scure/bip39, cardano-crypto.js) at repository root
- [ ] T005 [P] Write `justfile` with build/bundle/dev/format/check/ci recipes at repository root
- [ ] T006 [P] Write `dist/index.html` with app shell, CSS, font imports at `dist/index.html`
- [ ] T007 [P] Write `.gitignore` (node_modules, output, .spago, dist/app.js) at repository root
- [ ] T008 Run `npm install && spago install` to verify dependency resolution

---

## Phase 2: Foundational (FFI + Core Types)

**Purpose**: JS FFI bindings and core PureScript types that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T009 [P] Write Bech32 FFI in `lib/src/FFI/Bech32.js` — encode(hrp, bytes), decode(str)
- [ ] T010 [P] Write Blake2b FFI in `lib/src/FFI/Blake2b.js` — blake2b224(bytes), blake2b256(bytes)
- [ ] T011 [P] Write Base58 FFI in `lib/src/FFI/Base58.js` — encode(bytes), decode(str)
- [ ] T012 [P] Write Hex FFI in `lib/src/FFI/Hex.js` — toHex(bytes), fromHex(str)
- [ ] T013 [P] Write Mnemonic FFI in `lib/src/FFI/Mnemonic.js` — generateMnemonic(strength), mnemonicToEntropy(words), validateMnemonic(words)
- [ ] T014 [P] Write Crypto FFI in `lib/src/FFI/Crypto.js` — deriveRootKey(entropy, passphrase), deriveChild(key, index, hardened), toPublic(xprv)
- [ ] T015 [P] Write `lib/src/Cardano/Address/Bech32.purs` — PureScript wrapper for Bech32 FFI with typed encode/decode
- [ ] T016 [P] Write `lib/src/Cardano/Address/Base58.purs` — PureScript wrapper for Base58 FFI
- [ ] T017 [P] Write `lib/src/Cardano/Address/Hex.purs` — PureScript hex encoding utilities
- [ ] T018 [P] Write `lib/src/Cardano/Address/Hash.purs` — CredentialHash newtype, hashCredential (Blake2b-224)
- [ ] T019 Write `lib/src/Cardano/Codec/Bech32/Prefixes.purs` — All CIP-5 HRP constants (addr, addr_test, stake, stake_test, addr_vkh, etc.)
- [ ] T020 Write `lib/src/Cardano/Address.purs` — Address newtype, bech32/base58 encode/decode, unsafeMkAddress, unAddress
- [ ] T021 Write `lib/src/Cardano/Address/Derivation.purs` — XPrv/XPub/Pub newtypes, toXPub, xpubPublicKey, Role type
- [ ] T022 Run `spago build -p cardano-addresses` to verify lib compiles

**Checkpoint**: Library core types and FFI compile. All encoding/hashing primitives work.

---

## Phase 3: User Story 1 — Inspect an Existing Address (Priority: P1) MVP

**Goal**: User pastes any Cardano address, sees decoded structure (type, network, credentials)

**Independent Test**: Paste a known mainnet bech32 address, verify JSON output matches `cardano-addresses address inspect`

### Implementation

- [ ] T023 [US1] Write `lib/src/Cardano/Address/Style/Shelley.purs` — NetworkTag, mkNetworkTag, shelleyMainnet/Testnet, AddressType enum, unpackAddress, parseAddressInfoShelley
- [ ] T024 [US1] Write `lib/src/Cardano/Address/Inspect.purs` — AddressInfo record, inspectAddress dispatching Shelley/Byron/Icarus, eitherInspectAddress
- [ ] T025 [US1] Write `app/src/Component/Common/Output.purs` — Output display component with copy-to-clipboard button
- [ ] T026 [US1] Write `app/src/Component/Common/InputField.purs` — Styled text input and textarea components
- [ ] T027 [US1] Write `app/src/Util/Clipboard.purs` — Clipboard API FFI (writeText)
- [ ] T028 [US1] Write `app/src/Component/AddressInspect.purs` — Address inspection panel: input field, decode on paste/enter, display AddressInfo fields with hex hashes and bech32 variants
- [ ] T029 [US1] Write `app/src/Component/Sidebar.purs` — Navigation sidebar with section list and active state
- [ ] T030 [US1] Write `app/src/App.purs` — Root Halogen component with sidebar + content area, tab switching
- [ ] T031 [US1] Write `app/src/Main.purs` — Halogen mount point, runHalogenAff
- [ ] T032 [US1] Run `spago build && just bundle` — verify app compiles and bundles, open in browser

**Checkpoint**: Address inspection works end-to-end. User can paste addr1... or DdzFF... and see decoded fields.

---

## Phase 4: User Story 2 — Generate Recovery Phrase (Priority: P1)

**Goal**: User generates BIP39 mnemonic of chosen word count, displayed as numbered grid

**Independent Test**: Generate 24-word phrase, verify all words in BIP39 English wordlist

### Implementation

- [ ] T033 [US2] Write `lib/src/Cardano/Mnemonic.purs` — generateMnemonic (Effect), validateMnemonic, mnemonicToEntropy wrapping FFI
- [ ] T034 [US2] Write `app/src/Component/MnemonicGen.purs` — Word count selector (pills: 12/15/18/21/24), Generate button, numbered word grid display, Copy button

**Checkpoint**: Mnemonic generation works. Words display in grid, copy works.

---

## Phase 5: User Story 3 — Derive Keys from Mnemonic (Priority: P1)

**Goal**: User enters mnemonic, derives root → account → address keys in visible pipeline

**Independent Test**: Enter known 15-word test mnemonic, verify root_xsk bech32 matches Haskell CLI

### Implementation

- [ ] T035 [US3] Extend `lib/src/Cardano/Address/Derivation.purs` — deriveRootKey (mnemonic+passphrase→XPrv), deriveAccountKey, deriveAddressKey, deriveStakeKey, deriveAddressPublicKey wrapping Crypto FFI
- [ ] T036 [US3] Write bech32 key serialization in `lib/src/Cardano/Address/Derivation.purs` — xprvToBech32 (with HRP by depth), xpubToBech32, key inspection (type, hex, chain code)
- [ ] T037 [US3] Write `app/src/Component/KeyDerivation.purs` — Pipeline panel: mnemonic input → root key → account index selector → account key → role/index selector → address key → public key. Each step shows bech32 output with copy button. Forward arrows between steps.

**Checkpoint**: Full key derivation pipeline works. Bech32 keys match CLI output for test vectors.

---

## Phase 6: User Story 4 — Construct Addresses from Keys (Priority: P2)

**Goal**: User takes a public key/hash and constructs Shelley payment/delegation/pointer/stake address

**Independent Test**: Use known public key, construct payment address, verify bech32 matches CLI

### Implementation

- [ ] T038 [US4] Extend `lib/src/Cardano/Address/Style/Shelley.purs` — Credential type, paymentAddress, delegationAddress, pointerAddress, stakeAddress, constructPayload, addressType encoding
- [ ] T039 [US4] Write `app/src/Component/Common/NetworkSelector.purs` — Network tag pill selector (Mainnet/Testnet/Custom)
- [ ] T040 [US4] Write `app/src/Component/AddressConstruct.purs` — Address construction panel: input for key/hash, network selector, buttons for Payment/Delegation/Pointer/Stake, output with bech32 address

**Checkpoint**: All four Shelley address types constructable. Bech32 output byte-identical to CLI.

---

## Phase 7: User Story 5 — Key Inspection and Hashing (Priority: P2)

**Goal**: User pastes bech32 key, sees type/hex/chain code, computes credential hash

**Independent Test**: Paste known addr_xvk key, verify hash matches `cardano-addresses key hash`

### Implementation

- [ ] T041 [US5] Write `app/src/Component/KeyInspect.purs` — Key inspection panel: paste bech32 key, detect type from HRP, display hex key + chain code, Hash button showing Blake2b-224 in hex and bech32 (addr_vkh/stake_vkh)

**Checkpoint**: Key inspection and hashing works for all key types.

---

## Phase 8: User Story 6 — Script Hash and Validation (Priority: P3)

**Goal**: User enters native script expression, gets hash/preimage/validation

**Independent Test**: Enter `all [vkh1..., vkh2...]`, verify script hash matches CLI

### Implementation

- [ ] T042 [US6] Write `lib/src/Cardano/Address/Script.purs` — NativeScript ADT, scriptHash (Blake2b-224 of CBOR preimage), validateScript
- [ ] T043 [US6] Write `lib/src/Cardano/Address/Script/Parser.purs` — parseScript: parse `all [...]`, `any [...]`, `some N [...]`, key hash literals, timelock expressions
- [ ] T044 [US6] Write `lib/src/Cardano/Address/Script/Cbor.purs` — scriptPreimage: minimal CBOR encoding for native scripts (arrays, ints, bytestrings)
- [ ] T045 [US6] Write `app/src/Component/ScriptOps.purs` — Script operations panel: textarea for script input, Hash/Preimage/Validate buttons, output display

**Checkpoint**: Script hash, preimage, and validation work for all native script types.

---

## Phase 9: User Story 7 — Pipeline Flow (Priority: P2)

**Goal**: Output from one step automatically feeds into the next across the full derivation chain

**Independent Test**: Generate mnemonic → derive through to payment address without manual copy-paste

### Implementation

- [ ] T046 [US7] Write `app/src/Component/Pipeline.purs` — Full pipeline view: Mnemonic → Root Key → Account Key → Address Key → Public Key → Address. Each step card with forward arrow. Changing earlier step clears downstream. All intermediate values visible.
- [ ] T047 [US7] Update `app/src/App.purs` — Add Pipeline as default/home view, wire sidebar navigation for all panels

**Checkpoint**: End-to-end pipeline works. User goes from mnemonic to address in one flow.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Bundle optimization, final integration

- [ ] T048 [P] Verify `just bundle-lib` produces standalone `dist/cardano-addresses.js` importable from plain JS
- [ ] T049 [P] Verify `just bundle` produces `dist/app.js` under 500KB gzipped
- [ ] T050 [P] Run `purs-tidy format-in-place` on all source files
- [ ] T051 Verify all operations work offline after initial page load
- [ ] T052 Run quickstart.md validation — follow all steps from scratch

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion — BLOCKS all user stories
- **Phase 3 (US1 - Inspect)**: Depends on Phase 2
- **Phase 4 (US2 - Mnemonic)**: Depends on Phase 2 — can run in parallel with US1
- **Phase 5 (US3 - Key Derivation)**: Depends on Phase 2 — can run in parallel with US1/US2
- **Phase 6 (US4 - Address Construct)**: Depends on Phase 2 + T023 (Shelley types from US1)
- **Phase 7 (US5 - Key Inspect)**: Depends on Phase 2
- **Phase 8 (US6 - Scripts)**: Depends on Phase 2
- **Phase 9 (US7 - Pipeline)**: Depends on US1-US5 (integrates all panels)
- **Phase 10 (Polish)**: Depends on all user stories

### User Story Dependencies

- **US1 (Inspect)**: Independent after Phase 2
- **US2 (Mnemonic)**: Independent after Phase 2
- **US3 (Key Derivation)**: Independent after Phase 2
- **US4 (Address Construct)**: Needs Shelley types from US1 (T023)
- **US5 (Key Inspect)**: Independent after Phase 2
- **US6 (Scripts)**: Independent after Phase 2
- **US7 (Pipeline)**: Integrates US1-US5 components

### Within Each User Story

- Library modules before app components
- Core types before construction logic
- Components before integration

### Parallel Opportunities

- T003-T007 (setup files) are all parallel
- T009-T014 (all FFI files) are all parallel
- T015-T019 (all PureScript wrappers) are all parallel
- US1, US2, US3, US5, US6 can all start in parallel after Phase 2
- US4 can start once T023 is done

---

## Parallel Example: Phase 2 FFI

```
# All FFI files can be written simultaneously:
Task T009: lib/src/FFI/Bech32.js
Task T010: lib/src/FFI/Blake2b.js
Task T011: lib/src/FFI/Base58.js
Task T012: lib/src/FFI/Hex.js
Task T013: lib/src/FFI/Mnemonic.js
Task T014: lib/src/FFI/Crypto.js
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (FFI + core types)
3. Complete Phase 3: US1 (Address Inspection)
4. **STOP and VALIDATE**: Paste known addresses, verify output
5. Bundle and serve — functional MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Inspect) → MVP — paste any address, see structure
3. US2 (Mnemonic) + US3 (Key Derivation) → Key operations work
4. US4 (Address Construct) + US5 (Key Inspect) → Full address toolkit
5. US6 (Scripts) → Multi-sig support
6. US7 (Pipeline) → Polished UX with connected flow
7. Polish → Bundle optimization, formatting, offline verification

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
