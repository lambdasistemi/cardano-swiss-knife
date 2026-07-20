# Offline vault CLI

`csk vault create`, `list`, and `migrate` operate on portable encrypted `.age` vaults. Passphrases are read from a no-echo terminal prompt or an inherited descriptor (`--passphrase-fd`; migration also has `--input-passphrase-fd`); they are never CLI arguments or environment values. Existing outputs require `--force`; writes are private (`0600`) and atomic. Migration never changes its input or writes decrypted data to disk.
