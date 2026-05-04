# Feature Specification: Browser-Based Cardano Address Toolkit

**Feature Branch**: `001-cardano-addr-web`
**Created**: 2026-04-05
**Status**: Draft
**Input**: User description: "Browser-based Cardano address toolkit replacing the cardano-addresses CLI with better UX"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect an Existing Address (Priority: P1)

A Cardano developer or user pastes a bech32 or base58 address and immediately sees its decoded structure: address type, network tag, spending credential hash, stake credential hash, and stake reference type.

**Why this priority**: Address inspection is the most common operation — users need to verify what an address contains before trusting it. Zero setup required, works with any address.

**Independent Test**: Paste a known mainnet address and verify all decoded fields match the output of `cardano-addresses address inspect`.

**Acceptance Scenarios**:

1. **Given** the app is open, **When** a user pastes a bech32 Shelley address, **Then** the app shows network tag, address type, spending key hash, stake key hash, and stake reference type.
2. **Given** the app is open, **When** a user pastes a base58 Byron address, **Then** the app shows it as Byron style with appropriate attributes.
3. **Given** the app is open, **When** a user pastes invalid text, **Then** the app shows a clear error message.

---

### User Story 2 - Generate Recovery Phrase (Priority: P1)

A user generates a BIP39 mnemonic recovery phrase of a chosen size (12, 15, 18, 21, or 24 words) displayed as a numbered grid.

**Why this priority**: This is the entry point for all key derivation workflows. Without a mnemonic, users cannot derive keys or addresses.

**Independent Test**: Generate a 24-word phrase and verify each word exists in the BIP39 English wordlist.

**Acceptance Scenarios**:

1. **Given** the mnemonic page is open, **When** a user selects 24 words and clicks Generate, **Then** 24 BIP39 English words are displayed in a numbered grid.
2. **Given** a phrase has been generated, **When** the user clicks Copy, **Then** the space-separated phrase is copied to clipboard.

---

### User Story 3 - Derive Keys from Mnemonic (Priority: P1)

A user enters a recovery phrase and derives a root private key, then an account key, then address and stake keys — each step visible in a pipeline.

**Why this priority**: Key derivation is the foundation for address generation. The pipeline UX makes the BIP44 hierarchy visible and educational.

**Independent Test**: Enter a known 15-word test mnemonic and verify the root key (bech32) matches the output of `cardano-addresses key from-recovery-phrase Shelley`.

**Acceptance Scenarios**:

1. **Given** a valid recovery phrase, **When** the user clicks Derive Root Key, **Then** a bech32-encoded root extended private key is shown.
2. **Given** a root key, **When** the user selects account index 0 and clicks Derive Account Key, **Then** the account extended private key is shown.
3. **Given** an account key, **When** the user selects role (External/Internal/Stake) and address index, **Then** the derived address key is shown.
4. **Given** any private key, **When** the user clicks "To Public Key", **Then** the corresponding extended public key is shown.

---

### User Story 4 - Construct Addresses from Keys (Priority: P2)

A user takes a derived public key (or key hash) and constructs a Shelley payment, delegation, pointer, or stake address for a chosen network.

**Why this priority**: Address construction is the end goal of most key derivation pipelines. Depends on having keys available (from Story 3).

**Independent Test**: Using a known test vector public key, construct a payment address and verify bech32 output matches the Haskell CLI.

**Acceptance Scenarios**:

1. **Given** an address public key and mainnet selected, **When** the user clicks "Payment Address", **Then** a bech32 enterprise address is shown.
2. **Given** a payment address and a stake public key, **When** the user clicks "Delegation Address", **Then** a bech32 base address with both credentials is shown.
3. **Given** a delegation credential, **When** the user clicks "Stake Address", **Then** a bech32 reward account is shown.

---

### User Story 5 - Key Inspection and Hashing (Priority: P2)

A user pastes any bech32-encoded key and sees its type, raw hex bytes, and can compute its Blake2b-224 hash (credential hash).

**Why this priority**: Useful for debugging and composing addresses from key hashes. Bridges the gap between key derivation and address construction.

**Independent Test**: Paste a known key and verify the displayed hash matches `cardano-addresses key hash` output.

**Acceptance Scenarios**:

1. **Given** any bech32 key, **When** pasted into the Key Inspect panel, **Then** the app shows key type, hex-encoded public key, and chain code.
2. **Given** any public key, **When** the user clicks Hash, **Then** the Blake2b-224 credential hash is shown in hex and bech32.

---

### User Story 6 - Script Hash and Validation (Priority: P3)

A user enters a native script expression and gets its script hash, CBOR preimage, and validation result.

**Why this priority**: Script operations are needed for multi-sig addresses but are less common than single-key workflows.

**Independent Test**: Enter a known `all [...]` script and verify the script hash matches `cardano-addresses script hash` output.

**Acceptance Scenarios**:

1. **Given** a valid native script string, **When** the user clicks Hash, **Then** the bech32 script hash is displayed.
2. **Given** a valid native script string, **When** the user clicks Preimage, **Then** the hex CBOR serialization is displayed.
3. **Given** an invalid script, **When** submitted, **Then** a clear validation error is shown.

---

### User Story 7 - Pipeline Flow (Priority: P2)

The UI shows a connected pipeline where output from one step automatically becomes input for the next: Mnemonic -> Root Key -> Account Key -> Address Key -> Public Key -> Address.

**Why this priority**: This is the UX differentiator vs the CLI. Users should not have to copy-paste between commands.

**Independent Test**: Generate a mnemonic, click through the full pipeline to a payment address, and verify each intermediate value is correct.

**Acceptance Scenarios**:

1. **Given** a generated mnemonic, **When** the user clicks "Derive Root Key", **Then** the root key appears in the next step and the "Derive Account Key" button becomes active.
2. **Given** any pipeline step output, **When** the user clicks the forward button, **Then** the value flows to the appropriate next step.
3. **Given** the pipeline is partially filled, **When** the user changes an earlier step, **Then** all downstream values are cleared.

---

### Edge Cases

- What happens when a user pastes a non-Cardano bech32 string (e.g., Bitcoin segwit)? App should show "Unrecognized address format" error.
- How does the app handle an empty mnemonic or one with wrong word count? Show validation error before attempting derivation.
- What happens when deriving with an out-of-range account index? Clamp to valid range (0-2^31-1 for hardened).
- How does the app behave with a key from one network used to construct an address on another? This is valid — network tag is independent of key material.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST decode and display structure of any valid Cardano address (Shelley, Byron, Icarus styles).
- **FR-002**: System MUST generate BIP39 mnemonic recovery phrases of 9, 12, 15, 18, 21, or 24 words using cryptographically secure entropy.
- **FR-003**: System MUST derive Shelley root extended private keys from recovery phrases using BIP32-Ed25519.
- **FR-004**: System MUST derive child keys following the CIP-1852 derivation path (purpose 1852'/coin 1815'/account/role/index).
- **FR-005**: System MUST extract public keys (extended and non-extended) from private keys.
- **FR-006**: System MUST compute Blake2b-224 credential hashes from public keys.
- **FR-007**: System MUST construct Shelley payment (enterprise), delegation (base), pointer, and stake (reward) addresses.
- **FR-008**: System MUST encode addresses in bech32 with correct CIP-5 human-readable prefixes.
- **FR-009**: System MUST support mainnet (tag 1), testnet/preview (tag 0), and custom network tags (0-15).
- **FR-010**: System MUST parse and hash native Cardano scripts (all, any, some, key hash, timelock).
- **FR-011**: System MUST produce CBOR preimages of native scripts.
- **FR-012**: System MUST run entirely in the browser with no server-side processing.
- **FR-013**: System MUST display all key material in bech32 with correct HRP prefixes.
- **FR-014**: System MUST allow copying any output value to clipboard with a single click.
- **FR-015**: System MUST chain pipeline steps so output of one operation flows as input to the next.
- **FR-016**: The core address logic MUST be a standalone library (`cardano-addresses`) usable independently of the browser UI, bundleable as a JS module.

### Key Entities

- **Recovery Phrase**: A BIP39 mnemonic of 9-24 words representing wallet entropy.
- **Extended Key**: A 64-byte key (32-byte key + 32-byte chain code) with depth and type metadata.
- **Credential Hash**: A 28-byte Blake2b-224 hash of a public key or script, used in address payloads.
- **Address**: A binary payload encoding network, credential type, and one or two credential hashes, displayed as bech32 or base58.
- **Native Script**: A simple scripting language for multi-sig with key hash, timelock, all/any/some combinators.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can inspect any Cardano address in under 2 seconds.
- **SC-002**: Users can go from mnemonic generation to a derived payment address in under 30 seconds using the pipeline.
- **SC-003**: All bech32 outputs are byte-identical to the Haskell `cardano-addresses` CLI for the same inputs.
- **SC-004**: The application loads and is interactive in under 3 seconds on a standard broadband connection.
- **SC-005**: All operations work offline after initial page load.
- **SC-006**: 100% of address types supported by the CLI are also supported in the web tool.

## Architecture

The project ships two packages from a single Spago workspace:

- **`cardano-addresses`** (`lib/`) — Pure library implementing all Cardano address operations (encoding, decoding, key derivation, hashing, script handling). No UI dependencies. Independently bundleable and importable by other PureScript or JS projects.
- **`cardano-addresses-browser`** (`app/`) — Halogen web application that depends on the library and provides the interactive browser UI.

The library is the primary deliverable. The browser app is a consumer of it.

## Assumptions

- Users have a modern browser (Chrome 90+, Firefox 90+, Safari 15+).
- English-only BIP39 wordlist is sufficient for the initial version.
- Byron address construction (bootstrap) is lower priority — inspection is sufficient for P1.
- Shared (multi-sig) address style is out of scope for initial version.
- No persistent storage needed — all operations are stateless per session.
- Users understand Cardano address concepts (this is a developer/power-user tool, not an end-user wallet).
