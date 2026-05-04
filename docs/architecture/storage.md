# Storage and Secrets

## Static assets

The browser bundle and the two WASM binaries are versioned as build outputs and served as static files.

## In-memory state

The application keeps page state, decoded transaction results, and temporary secret inputs in memory while the session is active.

## Encrypted vault

The encrypted vault is the durable secret store for the browser app. Current vault entry kinds include:

- mnemonic phrases
- signing keys
- Shelley root, account, address, and stake private keys
- Blockfrost project IDs
- Koios bearer tokens

The vault is explicit by design:

- create or unlock it with a passphrase
- save compatible entries from feature pages
- peek or pop entries into another page when needed

## What is not persisted

Provider secrets are not meant to live in browser-local storage. If a credential should survive a page reload, it should be saved into the encrypted vault instead.

## Operational consequence

Because the product is browser-first and local-first, losing the vault passphrase or the exported vault file means losing access to the encrypted secret inventory. Backups are the user's responsibility.
