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

For offline automation, see [the vault CLI](vault.md).

## CLI commands

<!-- release-docs:procedure:cli-commands -->
The `csk` binary shares the same PureScript implementations as the Node API
and WebUI. Common families (see `cli/csk.mjs` for the full usage strings):

```bash
csk --version
csk address inspect --address ADDR
csk mnemonic generate
csk mnemonic validate --mnemonic "..."
csk key derive --mnemonic "..." --account-index 0 --role external --address-index 0
csk vault list --vault PATH
csk tx inspect --cbor-hex HEX
csk tx validate --cbor-hex HEX
csk tx witness plan --cbor-hex HEX
csk tx review --tx-file PATH --book PATH
```

Every capability row in `release/capabilities.json` names its exact CLI
command; the reference page lists them all.
<!-- /release-docs:procedure:cli-commands -->

## Transaction review (CLI)

`csk tx review --tx-file PATH [--protocol-book PATH ...] [--user-book PATH ...]
[--book PATH ...] [--provider blockfrost|koios --network mainnet|preprod|preview]
[--vault PATH --vault-entry ID] [--output json]` renders a deterministic
signer decision view derived entirely from the canonical `tx.review` result:
the transaction header, what is not proven (input context status, net signer
value provability, warnings), every output control group with its
inspector-native category, role, evidence, exact lovelace and per-asset
policy id, name and exact quantity, high-value movements, sources,
collateral, self-declared claims, and book-resolved labels.

- The decision view renders what the inspector reported, in the inspector's
  own vocabulary. It never synthesises a readiness state: input context
  status and net signer value provability are shown exactly as reported.
- `--protocol-book` and `--user-book` are review-only and repeatable;
  protocol books resolve before user books. `--book` is retained as a
  compatibility alias for `--user-book`, interleaved in command-line order.
  Resolutions render in caller book order, duplicates preserved, with raw
  identifiers shown alongside their labels.
- `--output json` returns the same structured result unchanged inside the
  standard `{ "version": 1, "ok": true, "value": ... }` envelope.
- Without `--provider`/`--network`, the review stays fully offline and
  reports an incomplete input context; with a paired provider (and vault
  credential when required), it resolves the producer-transaction context
  once and, when that context is complete, reports the input context as
  complete and the net signer value as provable.
- Addresses and raw identifiers render in full, never truncated.

## Node API

<!-- release-docs:procedure:node-api -->
Import named exports from the scoped package (public surface is
`node/src/index.js` / `node/dist/index.d.ts`):

```js
import {
  inspectAddress,
  generateMnemonic,
  validateMnemonic,
  deriveKeys,
  inspectTransaction,
} from "@lambdasistemi/cardano-swiss-knife";

// inspectAddress takes the address string directly (not an options object).
const inspected = await inspectAddress("addr1...");
if (!inspected.ok) {
  // inspected.error.code is stable (DOMAIN_ERROR / ENGINE_* / …)
} else {
  // inspected.value
}
```

Each capability's Node export is named in `release/capabilities.json` under
`hosts.node.export`. Do not re-export or reimplement engine semantics from
the host application.
<!-- /release-docs:procedure:node-api -->

## Stable outputs and errors

<!-- release-docs:procedure:stable-outputs -->
Use `--output json` on CLI commands for machine-readable results. Successful
JSON is a single object on stdout; failures print a typed error object and
exit non-zero.

Exit codes classify outcomes:

- `0` — success
- `2` — usage / argument errors
- other non-zero — domain, engine (`ENGINE_*`, `RDF_ENGINE_*`), provider, or
  witness failures

Public Node operations resolve structured `CskResult` values — `{ ok: true,
value }` on success or `{ ok: false, error: { code, message } }` on failure.
Prefer branching on the typed `error.code`, not on free-form message text.
<!-- /release-docs:procedure:stable-outputs -->
