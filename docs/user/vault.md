# Offline vault CLI

`csk vault create`, `list`, `migrate`, and `credential add` operate on portable encrypted `.age` vaults. Passphrases are read from a no-echo terminal prompt or an inherited descriptor (`--passphrase-fd`; migration also has `--input-passphrase-fd`); they are never CLI arguments or environment values. Existing outputs require `--force`; writes are private (`0600`) and atomic. Migration never changes its input or writes decrypted data to disk.

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

## Provider credentials

<!-- release-docs:procedure:provider-credentials -->
Add a named provider credential to an existing vault, then use it for local
transaction validation:

```bash
csk vault credential add --vault vault.age --provider blockfrost --id mainnet-blockfrost --label "Mainnet Blockfrost"
csk vault credential add --vault vault.age --provider koios --id mainnet-koios --label "Mainnet Koios"
csk vault list --vault vault.age
csk tx validate --tx-file transaction.cbor --provider blockfrost --network mainnet --vault vault.age --vault-entry mainnet-blockfrost
```

`--provider blockfrost` stores a `blockfrost-project-id` entry; `--provider
koios` stores a `koios-bearer-token` entry. The command always prompts the
controlling terminal for the credential with echo disabled — there is no
`--passphrase-fd`-style, stdin, argv, or environment source for the
credential itself, only for the vault passphrase. `--id` and `--label` must
be non-whitespace and free of control characters; the credential must be
non-whitespace but is otherwise stored exactly as entered. Adding a
duplicate `--id` is rejected without changing the vault. `vault list`
exposes the id, kind, label, and creation time of every entry, including
provider credentials, and never the credential value.
<!-- /release-docs:procedure:provider-credentials -->

## Credentials and passphrases

<!-- release-docs:procedure:credentials -->
Passphrases are read from a no-echo terminal prompt or an inherited
descriptor via `--passphrase-fd` (migration also accepts
`--input-passphrase-fd`). They must never appear as CLI arguments, in shell
history, or as environment variable values.

Provider API credentials that live inside a vault are decrypted only for the
request that needs them and are not written back in cleartext. Prefer vault
entries over pasting secrets into the browser when automating offline flows.
The provider credential itself is always read from the controlling terminal
with echo disabled, matching the vault passphrase's no-argv/no-environment
policy.
<!-- /release-docs:procedure:credentials -->
