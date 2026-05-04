# Cardano Swiss Knife

Cardano Swiss Knife is a browser-first workspace that combines two authoritative Cardano engines in one static site:

- `cardano-addresses.wasm` for mnemonic, derivation, address, and raw signing primitives
- `wasm-tx-inspector.wasm` for transaction decoding, identity, intent, and witness planning

The live app is published at <https://lambdasistemi.github.io/cardano-swiss-knife/>. This manual is published under `/docs/` on the same site.

## What it does today

- Inspect Cardano addresses locally in the browser
- Generate or restore mnemonics and derive Shelley keys
- Sign arbitrary payloads with extended signing keys
- Inspect transactions by hash or by CBOR hex
- Produce detached witness material from a transaction body hash
- Store mnemonics, signing keys, and provider credentials in the encrypted vault

## Important capability boundary

Transaction signing is intentionally explicit right now. The app can derive the transaction body hash and create detached witness material, but it does **not** patch witnesses back into transaction CBOR yet.

## Project shape

```text
app/      Halogen browser shell
lib/      Shared PureScript address and signing logic
haskell/  Test vector generator
nix/      Reproducible packaging and CI entrypoints
tests/    Playwright browser coverage
docs/     MkDocs project documentation
```

## Next direction

The long-term direction is one operation model with two hosts:

- browser-first UI now
- CLI host later

That keeps naming, inputs, outputs, and test vectors aligned across both surfaces.
