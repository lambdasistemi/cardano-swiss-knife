# System Architecture

## Runtime shape

The deployed site is a static bundle:

- HTML and CSS shell in `dist/`
- PureScript application bundle compiled to `dist/app.js`
- WASM binaries under `dist/wasm/`

No server-side application is required for the core product.

## Core subsystems

### Browser shell

The Halogen application in `app/` coordinates navigation, form state, vault usage, and rendering.

### Address engine

`cardano-addresses.wasm` is used for:

- address inspection
- mnemonic generation
- wallet restoration
- Shelley key derivation
- raw payload signing and verification

### Transaction engine

`wasm-tx-inspector.wasm` is used for:

- transaction decoding
- transaction identity extraction
- intent summary generation
- witness plan analysis
- transaction tree browsing

### Providers

The Transactions page can fetch CBOR from external providers when the user starts from a transaction hash:

- Blockfrost
- Koios

Those provider credentials are UI inputs, not backend secrets. They belong in the encrypted vault because the app is entirely client-side.

## Deployment shape

GitHub Pages serves the static site from `main`. The published artifact contains:

- the app at `/`
- the documentation site at `/docs/`

Pull requests can also publish disposable preview builds to `surge.sh`.
