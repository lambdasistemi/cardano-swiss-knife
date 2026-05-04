# Quickstart: WASM Crypto Layer

## Prerequisites

- Nix with flakes enabled
- Access to `paolino/cardano-addresses` (for WASM binaries)

## Build WASM Binaries

From `paolino/cardano-addresses`:

```bash
# Build all WASM executables
wasm32-wasi-cabal --project-file=cabal-wasm.project build inspect-address derive-key make-address sign-message

# Test with wasmtime
echo -n 'addr1q...' | wasmtime inspect-address.wasm
```

## Run the App

From `cardano-addresses-browser`:

```bash
# Enter dev shell
nix develop

# Install dependencies
npm install

# Build PureScript
npx spago build -p cardano-addresses-browser

# Bundle
npx esbuild output/Main/index.js --bundle --outfile=dist/app.js --format=esm --minify

# Serve (WASM binaries must be in dist/)
npx serve dist -l 34173
```

## Run Tests

```bash
# PureScript unit tests (test vectors)
npx spago test -p cardano-addresses-test

# Playwright E2E tests
npx playwright test

# Full CI
just ci
```

## Verify WASM Integration

1. Open `http://localhost:34173`
2. Navigate to Inspect tab
3. Paste a known Shelley address
4. Verify output matches `cardano-address inspect` CLI output
