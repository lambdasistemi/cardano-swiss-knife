# Usage

## Inspect page

Paste an address and decode its style, network, header fields, and payload details locally in the browser.

## Mnemonic and Restore pages

Use the Mnemonic page when you want generation and hand-off. Use the Restore page when you already have a phrase and want family-aware derivation.

## Signing page

The Signing page is for arbitrary payload signing. It is not the transaction signer.

## Transactions page

The Transactions page supports two inputs:

- transaction hash plus provider credentials
- raw CBOR hex

When starting from a hash:

1. Choose `Blockfrost` or `Koios`
2. Load the credential from the encrypted vault or paste it manually
3. Choose network
4. Inspect the transaction

When starting from CBOR:

1. Switch to `CBOR hex`
2. Paste the transaction body
3. Inspect locally without provider credentials

The provider credential controls are intentionally hidden in `CBOR hex` mode.

## Vault usage

Use the Vault page to create or unlock the encrypted secret store. Feature pages expose only compatible entries:

- mnemonics on Restore
- signing keys on Signing
- provider credentials on Transactions

This keeps copy-paste of sensitive material to a minimum.
