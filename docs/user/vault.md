# Offline vault CLI

`csk vault create`, `list`, and `migrate` operate on portable encrypted `.age` vaults. Passphrases are read from a no-echo terminal prompt or an inherited descriptor (`--passphrase-fd`; migration also has `--input-passphrase-fd`); they are never CLI arguments or environment values. Existing outputs require `--force`; writes are private (`0600`) and atomic. Migration never changes its input or writes decrypted data to disk.

## Portable vault lifecycle

<!-- release-docs:procedure:vault-migration -->
Create, inspect, and migrate portable encrypted vaults with the host-owned
CLI surface (`cli/csk.mjs`):

```bash
csk vault create --out vault.age
csk vault list --vault vault.age
csk vault list --vault vault.age --json
csk vault migrate --input old.age --out new.age
```

Migration writes a new encrypted vault and never mutates the input. Use
`--force` only when deliberately overwriting an existing output path.
Vault create/open/export/lock and migration are host storage concerns, not
engine semantics (see capability exclusion `VAULT-LIFECYCLE-001`).
<!-- /release-docs:procedure:vault-migration -->

## Credentials and passphrases

<!-- release-docs:procedure:credentials -->
Passphrases are read from a no-echo terminal prompt or an inherited
descriptor via `--passphrase-fd` (migration also accepts
`--input-passphrase-fd`). They must never appear as CLI arguments, in shell
history, or as environment variable values.

Provider API credentials that live inside a vault are decrypted only for the
request that needs them and are not written back in cleartext. Prefer vault
entries over pasting secrets into the browser when automating offline flows.
<!-- /release-docs:procedure:credentials -->
