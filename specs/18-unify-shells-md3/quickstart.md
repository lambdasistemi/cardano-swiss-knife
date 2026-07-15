# Verification quickstart — Issue 18

All commands run from `/code/cardano-swiss-knife-issue-18` on the Nix path.

## Focused build and browser proof

```sh
nix build .#tx-inspector-ui --no-link
nix run .#ci-inspector-playwright
nix run .#ci-playwright
nix run .#ci-ux-capture
nix run .#ci-combined-site-smoke
```

Expected final signals:

- Unified MD3 artifact contains root/direct route entries and three hashed WASM assets (address, inspector, RDF shapes) with compressed companions.
- 55 transplanted inspector cases plus all rewired legacy cases and new unified-shell cases pass.
- 9 UX capture scenarios pass across desktop, laptop, and mobile.
- Canonical and `/inspector/` compatibility routes return 200 and initialize the same shell.

## Secret-storage source audit

```sh
rg -n 'localStorage|sessionStorage|indexedDB|document\.cookie' docs/inspector/src app lib
rg -n 'blockfrost_project_id|koios_bearer_token|persist_api_keys' docs/inspector/src
rg -n 'setItem.*(blockfrost|koios|mnemonic|signing|private)' docs/inspector/src app lib
```

Expected final signal: local storage remains only for theme, library books, and non-secret provider/network preferences; legacy credential identifiers are used only for deletion; no secret write exists.

## Full gate

```sh
./gate.sh
```

Expected final signal: exit 0 at the reviewed head.

## Preview smoke

After CI publishes the PR preview, verify the URL from the PR checks:

```sh
curl --fail --location --silent --show-error '<preview-root>/' >/dev/null
curl --fail --location --silent --show-error '<preview-root>/addresses' >/dev/null
curl --fail --location --silent --show-error '<preview-root>/keys' >/dev/null
curl --fail --location --silent --show-error '<preview-root>/scripts' >/dev/null
curl --fail --location --silent --show-error '<preview-root>/vault' >/dev/null
curl --fail --location --silent --show-error '<preview-root>/library' >/dev/null
curl --fail --location --silent --show-error '<preview-root>/settings' >/dev/null
curl --fail --location --silent --show-error '<preview-root>/inspector/' >/dev/null
```

Also run a browser smoke for route navigation, vault create/open, and the signed-CBOR loop; HTTP 200 alone does not prove the live asset boundary.
