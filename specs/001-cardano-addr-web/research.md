# Research: Browser-Based Cardano Address Toolkit

## R1: BIP32-Ed25519 Key Derivation in the Browser

**Decision**: Use `cardano-crypto.js` (emscripten-compiled C library) for BIP32-Ed25519 operations.

**Rationale**: This is the same crypto core used by Cardano wallets (Nami, Eternl). It provides `emip3_derive_hardened`, `emip3_derive_normal`, `emip3_to_public`, and mnemonic-to-entropy conversion compatible with the Haskell `cardano-crypto` package. The key derivation scheme (CIP-1852, BIP32-Ed25519 with DerivationScheme2) requires specific clamping and scalar operations that generic Ed25519 libraries don't support.

**Alternatives considered**:
- `@noble/ed25519` — Lacks BIP32 derivation (only basic Ed25519 sign/verify). Would require reimplementing the full derivation scheme.
- Custom WASM build of cardano-crypto — More work for the same result. The JS build is well-tested.

## R2: Bech32 Encoding

**Decision**: Use the `bech32` npm package (v2.x).

**Rationale**: De facto standard for bech32/bech32m in JS. Tiny (2KB), no dependencies, well-maintained. Supports both bech32 and bech32m variants. Cardano uses bech32 (not bech32m).

**Alternatives considered**:
- Hand-rolled PureScript implementation — Unnecessary complexity, error-prone.

## R3: Blake2b Hashing

**Decision**: Use `@noble/hashes` for Blake2b-224 and Blake2b-256.

**Rationale**: Pure JS, audited, no WASM/native dependencies. Provides `blake2b` with configurable output length (28 bytes for credential hashes, 32 bytes for script hashes). Same author as `@noble/ed25519`, widely used in crypto ecosystem.

**Alternatives considered**:
- `blakejs` — Older, less maintained. @noble/hashes is the modern replacement.
- `cardano-crypto.js` includes blake2b — Could use it, but @noble/hashes is lighter and more idiomatic.

## R4: Base58 Encoding (Byron Addresses)

**Decision**: Use `@scure/base` for Base58 with Bitcoin alphabet.

**Rationale**: Same family as @noble/hashes, provides configurable base encoding. Byron addresses use Base58 with the Bitcoin alphabet. Supports encode/decode with proper validation.

**Alternatives considered**:
- `bs58` — Works but @scure/base covers multiple encodings (base58, base16, base64) in one package.

## R5: BIP39 Mnemonic Generation

**Decision**: Use `@scure/bip39` for mnemonic generation and validation.

**Rationale**: Provides `generateMnemonic`, `mnemonicToEntropy`, `validateMnemonic` with English wordlist. Uses `crypto.getRandomValues()` for entropy (Web Crypto API). Compatible with the BIP39 spec used by Cardano.

**Alternatives considered**:
- `bip39` (bitcoinjs) — Larger, more dependencies. @scure/bip39 is lighter.

## R6: CBOR Serialization (Script Preimages)

**Decision**: Hand-roll minimal CBOR encoding in PureScript for script preimages.

**Rationale**: Cardano native scripts use a small subset of CBOR (arrays, integers, byte strings). The encoding is deterministic and simple — roughly 50 lines of PureScript. No need for a full CBOR library.

**Alternatives considered**:
- `cbor-web` npm — Overkill for the tiny subset needed. Adds unnecessary bundle size.
- `borc` — Similar concern, plus unmaintained.

## R7: PureScript FFI Pattern

**Decision**: Each JS dependency gets a dedicated FFI file in `lib/src/FFI/`. PureScript modules in `lib/src/Cardano/` import via `foreign import`.

**Rationale**: Clean separation. JS files are ES modules importing from npm packages. PureScript sees only the typed interface. The FFI boundary is explicit and auditable.

**Pattern**:
```javascript
// FFI/Bech32.js
import { bech32 } from "bech32";
export const encode = (hrp) => (bytes) => bech32.encode(hrp, bech32.toWords(bytes));
export const decode = (str) => { ... };
```
```purescript
-- Cardano/Address/Bech32.purs
foreign import encode :: String -> Uint8Array -> String
foreign import decode :: String -> { hrp :: String, bytes :: Uint8Array }
```
