# Data Model: Replace JS Crypto with WASM

## Entities

### WasmModule

Single compiled WebAssembly module cached in the browser.

- `module :: WebAssembly.Module` — compiled module (reusable across all calls)
- `status :: Loading | Ready | Failed String` — initialization state
- Binary: `cardano-addresses.wasm` (~5MB, ~1.5MB gzipped)

### WasmRequest

JSON payload sent to the WASM executable via stdin. The `cmd` field selects the operation.

- `cmd :: String` — operation: `"inspect"`, `"derive"`, `"make-address"`, `"sign"`
- `...fields` — operation-specific input data (see protocol schemas below)

### WasmResponse

JSON payload received from WASM executable via stdout.

- `success :: Boolean` — whether the operation succeeded
- `result :: JSON` — operation-specific output data
- `error :: Maybe String` — error message if failed

## Protocol Schemas

### cmd: inspect

**Input** (stdin):
```json
{"cmd": "inspect", "address": "addr1q..."}
```

**Output** (stdout):
```json
{
  "address_style": "Shelley",
  "network_tag": 1,
  "stake_reference": "by value",
  "address_type": 0,
  "spending_key_hash": "abc123...",
  "spending_key_hash_bech32": "addr_vkh1...",
  "stake_key_hash": "def456...",
  "stake_key_hash_bech32": "stake_vkh1..."
}
```

### cmd: derive

**Input** (stdin):
```json
{
  "cmd": "derive",
  "mnemonic": "exercise club noble adult miracle ...",
  "passphrase": "",
  "style": "shelley",
  "path": "1852H/1815H/0H/0/0"
}
```

**Output** (stdout):
```json
{
  "extended_signing_key": "hex...",
  "extended_verification_key": "hex...",
  "key_hash": "hex...",
  "bech32_signing_key": "addr_xsk1...",
  "bech32_verification_key": "addr_xvk1..."
}
```

### cmd: make-address

**Input** (stdin):
```json
{
  "cmd": "make-address",
  "type": "base",
  "network": "mainnet",
  "payment_key_hash": "hex...",
  "stake_key_hash": "hex..."
}
```

**Output** (stdout):
```json
{
  "address_bech32": "addr1q...",
  "address_hex": "hex..."
}
```

### cmd: sign

**Input** (stdin):
```json
{
  "cmd": "sign",
  "signing_key": "hex...",
  "message": "hex..."
}
```

**Output** (stdout):
```json
{
  "signature": "hex...",
  "verification_key": "hex..."
}
```

## State Transitions

### WASM Module Lifecycle

```
[Page Load] → Loading → Ready → [Available for calls]
                     ↘ Failed(error) → [Show error to user, retry on next call]
```

### Operation Call Flow

```
[User input] → Serialize JSON → Write to WASI stdin → Start WASM
            → Read stdout → Parse JSON → Update UI
            → (on error) Read stderr → Show error
```

## Relationships

- Each PureScript FFI function maps to one WASM call with a specific `cmd` value
- The single `WasmModule` is shared across ALL operations (compiled once, ~9ms)
- WASI FDs (stdin/stdout/stderr) are created fresh per invocation (~3ms overhead)
- The PureScript types (`InspectResult`, `DerivedKey`, `Address`, `Signature`) remain unchanged — only the JS FFI implementation changes
