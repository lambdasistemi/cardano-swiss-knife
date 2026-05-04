# cardano-swiss-knife

Browser-first Cardano Swiss Knife. Address inspection, mnemonic and derivation flows, payload signing, transaction inspection, and detached witness material in one static web workbench.

## Direction

This repository is the composed product shell:

- `cardano-addresses.wasm` provides mnemonic, derivation, address, and raw signing primitives.
- `wasm-tx-inspector.wasm` provides transaction decoding, transaction identity, signer intent, and witness planning.
- The Halogen frontend keeps those capabilities in one browser-native workspace with a future CLI host planned around the same operation model.

The current transaction signing flow is intentionally explicit: it signs the transaction body hash and exports detached witness material. It does not yet patch that witness back into transaction CBOR.

## Development

```bash
nix develop
npm install
just build
just bundle
just test
```

For local browser testing you need both WASM artifacts available under `dist/wasm/`. The Nix `web-dist` package assembles them automatically.

## Repository Shape

```text
app/          Browser UI shell
lib/          Shared address and signing primitives
haskell/      Test-vector generator
dist/         Static browser output
nix/          Reproducible build and CI packaging
specs/        Spec-driven development artifacts
tests/        Playwright browser coverage
```

## Principles

- One operation model across browser now and CLI later
- Authoritative Cardano engines, not ad hoc crypto rewrites
- Local-first handling of mnemonics and signing keys
- Honest capability boundaries around inspection, signing, validation, and mutation

## License

See `LICENSE`.
