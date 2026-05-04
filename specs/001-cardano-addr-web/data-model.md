# Data Model: Cardano Address Toolkit

## Entities

### Address

Binary payload representing a Cardano address. Opaque wrapper around `Uint8Array`.

**Fields**:
- `bytes :: Uint8Array` — Raw address bytes

**Derived properties** (from first byte):
- `addressType :: AddressType` — Header nibble (0-15)
- `networkTag :: NetworkTag` — Low nibble (0-15)
- `stakeReference :: Maybe StakeReference` — By value, by pointer, or none

**Display formats**: bech32 (Shelley), base58 (Byron)

### AddressType

Sum type encoding the 16 possible Shelley address header types.

```
BaseKeyKey       = 0b0000  -- keyhash, keyhash
BaseScriptKey    = 0b0001  -- scripthash, keyhash
BaseKeyScript    = 0b0010  -- keyhash, scripthash
BaseScriptScript = 0b0011  -- scripthash, scripthash
PointerKey       = 0b0100  -- keyhash, pointer
PointerScript    = 0b0101  -- scripthash, pointer
EnterpriseKey    = 0b0110  -- keyhash only
EnterpriseScript = 0b0111  -- scripthash only
Byron            = 0b1000  -- legacy
RewardKey        = 0b1110  -- keyhash (reward account)
RewardScript     = 0b1111  -- scripthash (reward account)
```

### NetworkTag

Integer 0-15 identifying the Cardano network.

**Well-known values**: mainnet = 1, testnet/preview = 0

### ExtendedKey

A BIP32-Ed25519 extended key (private or public).

**Fields**:
- `keyBytes :: Uint8Array` — 32 bytes (signing key or public key)
- `chainCode :: Uint8Array` — 32 bytes
- `depth :: Depth` — Position in derivation hierarchy
- `keyType :: KeyType` — Private or Public

### Depth

Position in the CIP-1852 derivation path.

```
Root       -- m/
Account    -- m/1852'/1815'/N'
Payment    -- m/1852'/1815'/N'/role/index
Delegation -- m/1852'/1815'/N'/2/0
DRep       -- m/1852'/1815'/N'/3/0
CCCold     -- m/1852'/1815'/N'/4/0
CCHot      -- m/1852'/1815'/N'/5/0
```

### CredentialHash

28-byte Blake2b-224 hash of a public key or script.

**Fields**:
- `bytes :: Uint8Array` — 28 bytes

**Display formats**: hex, bech32 (with role-specific HRP)

### RecoveryPhrase

BIP39 mnemonic words.

**Fields**:
- `words :: Array String` — 9, 12, 15, 18, 21, or 24 words
- `entropy :: Uint8Array` — Underlying entropy bytes

### NativeScript

Recursive sum type for Cardano native scripts.

```
ScriptPubkey     KeyHash
ScriptAll        (Array NativeScript)
ScriptAny        (Array NativeScript)
ScriptNOfK       Int (Array NativeScript)
TimelockBefore   Slot
TimelockAfter    Slot
```

### ChainPointer

On-chain location for pointer addresses.

**Fields**:
- `slot :: Natural`
- `txIndex :: Natural`
- `certIndex :: Natural`

## Relationships

```
RecoveryPhrase --[derives]--> ExtendedKey (Root)
ExtendedKey (Root) --[derives]--> ExtendedKey (Account)
ExtendedKey (Account) --[derives]--> ExtendedKey (Payment/Delegation/DRep/...)
ExtendedKey --[toPublic]--> ExtendedKey
ExtendedKey (Public) --[hash]--> CredentialHash
CredentialHash + NetworkTag --[construct]--> Address
NativeScript --[hash]--> CredentialHash
NativeScript --[serialize]--> Uint8Array (CBOR preimage)
Address --[inspect]--> AddressInfo (type, network, credentials)
```

## Validation Rules

- Recovery phrase must be valid BIP39 (correct word count, valid checksum)
- Network tag must be 0-15
- Credential hash must be exactly 28 bytes
- Extended key bytes must be exactly 64 bytes (32 key + 32 chain code)
- Address header byte must encode a valid AddressType
- Script NOfK: N must be <= length of sub-scripts
