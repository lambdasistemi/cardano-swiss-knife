# Feature Specification: Replace JS Crypto with WASM

**Feature Branch**: `feat/replace-js-crypto-with-wasm`
**Created**: 2026-04-09
**Status**: Draft
**Input**: lambdasistemi/cardano-addresses-browser#35

## User Scenarios & Testing

### User Story 1 - Address Inspection via WASM (Priority: P1)

A user pastes a Cardano address (Shelley or Byron) into the inspect panel and sees the same decoded fields as today — network tag, spending credential, stake credential, address type — but the decoding is performed by the real `cardano-addresses` Haskell library compiled to WASM instead of hand-written JS CBOR parsing.

**Why this priority**: Inspection is the most commonly used feature and has the most complex JS reimplementation (hand-written CBOR decoder). A working WASM-based inspect proves the entire integration pattern.

**Independent Test**: Paste any bech32 or base58 address, verify output matches current behavior and Haskell test vectors.

**Acceptance Scenarios**:

1. **Given** a valid Shelley bech32 address, **When** the user pastes it into the inspect panel, **Then** the decoded fields are byte-identical to the output of `cardano-address inspect`
2. **Given** a valid Byron base58 address, **When** the user pastes it into the inspect panel, **Then** Byron-specific fields (derivation path, protocol magic) are correctly displayed
3. **Given** an invalid address string, **When** the user pastes it, **Then** a clear error message is shown (not a WASM crash)

---

### User Story 2 - Key Derivation via WASM (Priority: P2)

A user enters a mnemonic phrase and derives root, account, and address keys. The derivation uses the real Haskell BIP32-Ed25519 implementation compiled to WASM instead of `cardano-crypto.js`.

**Why this priority**: Key derivation is the second most complex JS reimplementation and is required for the full pipeline UX (mnemonic → key → address).

**Independent Test**: Enter a known mnemonic, verify derived keys match Haskell test vectors at every derivation level.

**Acceptance Scenarios**:

1. **Given** a 15-word mnemonic, **When** the user derives a Shelley root key, **Then** the root_xsk matches the Haskell reference output
2. **Given** a root key, **When** the user derives account key at path 1852H/1815H/0H, **Then** the acct_xsk matches test vectors
3. **Given** an account key, **When** the user derives address keys at path 0/0, **Then** the addr_xsk and addr_xvk match test vectors

---

### User Story 3 - Address Construction via WASM (Priority: P3)

A user constructs Shelley addresses (enterprise, base, reward, pointer) from public keys using the real Haskell address construction logic compiled to WASM instead of hand-written JS.

**Why this priority**: Address construction completes the core pipeline. With inspection and derivation already on WASM, this replaces the remaining critical JS crypto code.

**Independent Test**: Given known public keys and network tag, verify constructed addresses match Haskell test vectors.

**Acceptance Scenarios**:

1. **Given** a payment verification key and network mainnet, **When** the user constructs an enterprise address, **Then** the bech32 output matches the Haskell reference
2. **Given** payment and stake verification keys, **When** the user constructs a base address, **Then** the bech32 output matches the Haskell reference
3. **Given** a stake verification key, **When** the user constructs a reward address, **Then** the bech32 output matches

---

### User Story 4 - Signing via WASM (Priority: P4)

A user signs a message with a private key and verifies signatures. The Ed25519 operations use the Haskell implementation via WASM instead of `cardano-crypto.js`.

**Why this priority**: Signing is the last JS crypto operation to replace. Lower priority because it has fewer edge cases than derivation/inspection.

**Independent Test**: Sign a known message with a known key, verify signature matches test vectors.

**Acceptance Scenarios**:

1. **Given** a signing key and a message, **When** the user signs, **Then** the signature matches the Haskell reference output
2. **Given** a verification key, message, and valid signature, **When** the user verifies, **Then** verification succeeds
3. **Given** an invalid signature, **When** the user verifies, **Then** verification fails cleanly

---

### User Story 5 - JS Dependency Removal (Priority: P5)

After all crypto operations are on WASM, the JS crypto dependencies (`cardano-crypto.js`, `@noble/hashes`, `@scure/bip39`, `bech32`, `bs58`) and their FFI files are removed. The only new dependency is `@bjorn3/browser_wasi_shim`.

**Why this priority**: Cleanup step — only possible after all prior stories are complete and verified.

**Independent Test**: Build succeeds with reduced dependencies. All existing tests pass. Bundle size is acceptable.

**Acceptance Scenarios**:

1. **Given** all WASM integrations are working, **When** JS FFI files are removed, **Then** `spago build` succeeds
2. **Given** the reduced dependency set, **When** the app is bundled, **Then** all Playwright tests pass
3. **Given** the new bundle, **When** measured, **Then** bundle size is within the 500KB gzipped quality gate (WASM binaries loaded separately)

---

### Edge Cases

- What happens when WASM module fails to load (network error, unsupported browser)?
- How does cold-start latency (~50ms per module) affect UX compared to instant JS?
- What happens with very large mnemonics (24 words) or unusual derivation paths?
- How does the app handle concurrent WASM calls (e.g., user rapidly changing inputs)?

## Requirements

### Functional Requirements

- **FR-001**: System MUST produce byte-identical output to the Haskell `cardano-addresses` CLI for all supported operations
- **FR-002**: System MUST load WASM modules in the browser via `@bjorn3/browser_wasi_shim`
- **FR-003**: System MUST communicate with WASM executables via stdin/stdout JSON protocol
- **FR-004**: System MUST handle WASM initialization errors gracefully with user-visible feedback
- **FR-005**: System MUST work offline after initial load (WASM binaries cached)
- **FR-006**: System MUST maintain all existing UI interactions unchanged — only the backend computation changes
- **FR-007**: System MUST build WASM binaries from `paolino/cardano-addresses` via CI

### Key Entities

- **WASM Module**: A compiled Haskell executable (`.wasm`) that performs one crypto operation via stdin → stdout
- **WASI Shim**: Browser-side adapter (`browser_wasi_shim`) that provides WASI syscalls to WASM modules
- **FFI Bridge**: Thin PureScript layer that serializes arguments to JSON, calls WASM via the shim, and parses results

## Success Criteria

### Measurable Outcomes

- **SC-001**: All existing Haskell-generated test vectors pass against WASM-backed operations
- **SC-002**: All existing Playwright UI tests pass without modification
- **SC-003**: JS crypto dependencies reduced from 5 packages to 1 (`@bjorn3/browser_wasi_shim`)
- **SC-004**: JS FFI files reduced from 12 to 1 (the WASM bridge)
- **SC-005**: No user-visible behavioral change — the migration is transparent

## Assumptions

- GHC WASM backend produces correct, working binaries for all `cardano-addresses` operations (proven for `inspect`)
- `@bjorn3/browser_wasi_shim` supports all WASI syscalls needed by the compiled Haskell code
- WASM module cold-start latency (~50ms) is acceptable for interactive use
- WASM binaries can be fetched and cached by the browser (service worker or HTTP cache)
- The existing Haskell test vector generator continues to serve as the compatibility oracle
