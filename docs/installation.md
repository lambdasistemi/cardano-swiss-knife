# Installation

## Local development shell

Use the Nix shell so the Cardano, PureScript, and Haskell toolchain stays reproducible:

```bash
nix develop
npm install
```

## Common commands

```bash
just build
just bundle
just build-docs
just assemble-site
just test
```

## Browser assets

The app needs two WASM artifacts:

- `cardano-addresses.wasm`
- `wasm-tx-inspector.wasm`

The Nix `web-dist` package assembles those assets automatically. `just assemble-site` produces a writable `site-root/` directory with:

- the app at `/`
- the docs manual at `/docs/`

## Local serving

For quick local UI checks:

```bash
npx serve site-root -l 34173
```

Or use the app-only bundle while iterating on the UI:

```bash
just dev
```
