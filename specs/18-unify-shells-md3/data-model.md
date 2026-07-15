# Data model — Issue 18 unified MD3 shell

## Unified route

| Field | Meaning | Rules |
|---|---|---|
| destination | Workbench, Addresses, Keys, Scripts, Vault, Library, or Settings | Exactly the human-approved seven values |
| suffix | Static direct-entry path | Workbench retains the existing inspect/default entry; compatibility aliases resolve to the same destination |
| base path | Deployment prefix | Derived at runtime for root, Pages, preview, and `/inspector/` compatibility |
| active | Current destination | Exactly one top-level destination active |

State transition: browser location or navigation event → route parse → active destination → history update without full reload.

## Keys tab

| Field | Meaning | Rules |
|---|---|---|
| tab | Mnemonic, Restore, Expert, or Sign & verify | Exactly one active within Keys |
| working inputs | Phrase, paths, networks, payloads, or keys | Memory-only for secret values |
| derived outputs | Public addresses/keys and private keys | Secret outputs hidden by default; private outputs may be saved only to vault |

State transitions include Mnemonic → Restore handoff and Restore-derived private key → Vault → Workbench signing handoff.

## Vault entry

| Field | Meaning | Rules |
|---|---|---|
| id | Local stable identifier | Unique UUID |
| kind | Secret compatibility tag | mnemonic, signing-key, root/account/address/stake-private-key, blockfrost-project-id, or koios-bearer-token |
| label | User-facing name | Non-empty after defaulting |
| value | Decrypted secret | Exists only in unlocked in-memory state and encrypted file payload |
| createdAt | Creation timestamp | ISO-8601 |

Vault states: locked → create/open → unlocked clean → persist success (clean) or persist failure (dirty in memory) → lock (entries/passphrase cleared).

Compatibility rules:

- Restore accepts mnemonic entries.
- Keys Sign & verify and Workbench signing accept all signing-compatible private-key kinds.
- Settings accepts only the credential kind matching the selected provider.
- Pop loads the value and removes/persists the entry atomically from the user's perspective.

## Provider state

| Field | Classification | Persistence |
|---|---|---|
| provider | Non-secret preference | Local storage allowed |
| network | Non-secret preference | Local storage allowed |
| credential input | Secret | Memory only |
| saved credential | Secret vault entry | Encrypted vault only |

Initialization removes legacy cleartext keys and never reads them into active credentials.

## Signing result

| Field | Source |
|---|---|
| bodyHashHex | Authoritative transaction identification |
| verificationKeyBech32 | Local signing operation |
| signerHashHex | Authoritative address/signing primitives |
| signatureHex | Local signing operation |
| vkeyWitnessCborHex | Local witness encoding |
| witnessPatchAction | `tx.witness.attach` response |
| signedTxCborHex | `tx.witness.attach` response |

State transition: decoded Workbench transaction + signing-compatible key → local body-hash signature → detached witness → authoritative attachment operation → patched CBOR or explicit failure.

## Parity record

| Field | Meaning |
|---|---|
| source surface | Legacy tab or transplanted MD3 surface group |
| unified home | Approved top-level destination/tab |
| automated evidence | Named browser case or gate check |
| preview evidence | URL/status/browser smoke |

Every source surface requires a unified home and evidence before legacy deletion.
