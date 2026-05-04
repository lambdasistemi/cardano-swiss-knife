# Concepts

## One product, two engines

Cardano Swiss Knife is not a fresh cryptography implementation. It is a composed product shell around existing engines:

- `cardano-addresses` handles mnemonic, derivation, address, and raw signing primitives
- `cardano-ledger-inspector` handles transaction decoding and witness-oriented analysis

That keeps behavior closer to the native Cardano tooling instead of reimplementing critical logic in ad hoc JavaScript.

## Browser-first, local-first

The current product surface is a static browser application. Secrets are handled locally:

- mnemonics
- extended signing keys
- Blockfrost project IDs
- Koios bearer tokens

Vault-backed secrets are encrypted at rest in the exported vault file. Provider secrets are no longer persisted in browser-local storage.

## Explicit signing boundaries

There are two separate signing stories in the app:

- payload signing on the Signing page
- transaction witness creation on the Transactions page

The Transactions page does not yet mutate the transaction CBOR. It creates detached witness material so the user can inspect what was signed and how it matches the witness plan.

## CLI parity as a design constraint

The UI is not meant to become the only interface. The intended product line is:

- one operation model
- one shared vocabulary
- browser and CLI hosts over the same core capabilities

That constraint keeps the browser surface honest and makes later automation practical.
