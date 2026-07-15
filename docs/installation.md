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

## Browser artifact

The unified MD3 app ships three WASM families:

- `cardano-addresses.*.wasm`
- `inspector.*.wasm`
- `rdf_shapes_wasm_bg.*.wasm`

The Nix `web-dist` package builds the app and assembles those assets automatically at both the canonical root routes and the `/inspector/` compatibility routes. `just assemble-site` produces a writable `site-root/` directory with:

- the same app at `/` and `/inspector/`
- the docs manual at `/docs/`

## Local serving

For quick local UI checks:

```bash
npx serve site-root -l 34173
```

Or build and serve the app-only Nix artifact on port 8080:

```bash
just dev
```
