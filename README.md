# cardano-swiss-knife

Browser-first Cardano Swiss Knife. Address inspection, mnemonic and derivation flows, payload signing, transaction inspection, and signed transaction witness attachment in one static web workbench.

- Live app: <https://lambdasistemi.github.io/cardano-swiss-knife/>
- Docs manual: <https://lambdasistemi.github.io/cardano-swiss-knife/docs/>

## Direction

This repository is the composed product shell:

- `cardano-addresses.wasm` provides mnemonic, derivation, address, and raw signing primitives.
- `wasm-tx-inspector.wasm` provides transaction decoding, transaction identity, signer intent, witness planning, and vkey witness attachment.
- The Halogen frontend keeps those capabilities in one browser-native workspace with a future CLI host planned around the same operation model.

The current transaction signing flow is intentionally explicit: it signs the transaction body hash locally, keeps detached witness details visible, and asks the inspector WASM to attach or replace the generated vkey witness in transaction CBOR. Submission, bootstrap witness mutation, and hardware-wallet flows are still separate work.

## Architecture

`cardano-swiss-knife` (csk) is the browser product and workbench; [cardano-ledger-inspector](https://github.com/lambdasistemi/cardano-ledger-inspector) is its ledger engine.

- The workbench consumes the engine through the flake inputs `tx-inspector` and `tx-inspector-rdf`.
- It invokes `wasm-tx-inspector.wasm` through the versioned JSON control-envelope contract, keeping ledger operations in the engine rather than browser JavaScript.

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

Pull requests publish disposable previews to the shared host at:

```text
https://preview.dev.plutimus.com/lambdasistemi/cardano-swiss-knife/pr-<PR_NUMBER>/
```

The preview workflow builds `site-root/` and publishes it with the reusable
`paolino/dev-assets/static-preview` action. No external deploy token is
required.

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
This project is licensed under the [MIT License](LICENSE).
