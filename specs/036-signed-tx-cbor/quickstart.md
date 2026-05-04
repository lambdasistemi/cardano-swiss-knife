# Quickstart: Patch Generated VKey Witnesses into Transaction CBOR

## Baseline

```bash
nix develop
npm install
just build
just bundle
just wasm-assets
PLAYWRIGHT_BROWSERS_PATH=$(nix build "path:$PWD#playwright-browsers" --no-link --print-out-paths) npx playwright test --reporter=list
```

## Regression Cycle

```bash
PLAYWRIGHT_BROWSERS_PATH=$(nix build "path:$PWD#playwright-browsers" --no-link --print-out-paths) \
  npx playwright test tests/transactions.spec.ts --reporter=list
```

## Manual Browser Check

1. Open the Transactions page.
2. Paste the fixture transaction CBOR and inspect it.
3. Paste a compatible `addr_xsk` and sign the transaction body.
4. Confirm the result shows detached witness details and a signed transaction CBOR artifact.
5. Reinspect the signed transaction CBOR and confirm the witness set reflects the signer.
