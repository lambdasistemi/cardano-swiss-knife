# cardano-swiss-knife

Browser-first Cardano Swiss Knife. Address inspection, mnemonic and derivation flows, payload signing, transaction inspection, and detached witness material in one static web workbench.

- Live app: <https://lambdasistemi.github.io/cardano-swiss-knife/>
- Docs manual: <https://lambdasistemi.github.io/cardano-swiss-knife/docs/>

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
just build-docs
just assemble-site
just test
```

For local browser testing you need both WASM artifacts available under `dist/wasm/`. The Nix `web-dist` package assembles them automatically.

`just assemble-site` produces a writable `site-root/` directory with the app at `/` and the MkDocs manual under `/docs/`.

## Preview Deployments

Pull requests can publish a disposable preview to `surge.sh` at:

```text
https://lambdasistemi-cardano-swiss-knife-pr-<PR_NUMBER>.surge.sh
```

The preview workflow comments that URL back onto the PR when the `SURGE_TOKEN` repository secret is configured.

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
No license has been declared in this repository yet.
