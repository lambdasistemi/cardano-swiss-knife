# Unified route and storage contract

## Route/surface parity

| Source surface | Unified home | Canonical entry | Compatibility expectation |
|---|---|---|---|
| Legacy Overview | Workbench landing state | `/` or `/inspect` | Existing `/inspector/` and `/inspector/inspect` load the same shell |
| Legacy Inspect | Addresses | `/addresses` | Direct static entry returns the unified shell |
| Legacy Mnemonic | Keys / Mnemonic | `/keys` | Mnemonic is the initial or selectable in-page tab |
| Legacy Restore | Keys / Restore | `/keys` | In-page tab; phrase handoff preserved |
| Legacy Expert | Keys / Expert | `/keys` | In-page tab |
| Legacy Signing | Keys / Sign & verify | `/keys` | In-page tab |
| Legacy Transactions | Workbench | `/` or `/inspect` | Existing transaction deep links remain valid |
| Legacy Scripts | Scripts | `/scripts` | Direct static entry returns the unified shell |
| Legacy Vault | Vault | `/vault` | Direct static entry returns the unified shell |
| Legacy Library | Library | `/library` | Existing `/inspector/library` loads the same shell |
| MD3 Structure/Witness/Validation/RDF | Workbench result tabs | `/` or `/inspect` | Existing inspector paths remain valid |
| MD3 Settings | Settings | `/settings` | Existing `/inspector/settings` loads the same shell |

Primary navigation order is exactly: Workbench, Addresses, Keys, Scripts, Vault, Library, Settings.

## Persistent storage classification

| Data | Allowed persistent store | Forbidden persistent store |
|---|---|---|
| Theme | Local storage | None |
| RDF/library books | Local storage and exported JSON | None |
| Provider choice/network | Local storage | None |
| Mnemonic/recovery phrase | Encrypted vault file | Local/session storage, cookies, IndexedDB |
| Signing/private keys | Encrypted vault file | Local/session storage, cookies, IndexedDB |
| Blockfrost project ID | Encrypted vault file | Local/session storage, cookies, IndexedDB |
| Koios bearer token | Encrypted vault file | Local/session storage, cookies, IndexedDB |

Legacy keys `blockfrost_project_id`, `koios_bearer_token`, and `persist_api_keys` are removal-only migration identifiers. They may be referenced to delete stale values but must never be read into state or written.

## Engine boundary

The browser may invoke transaction operations only through `cardano-ledger-functional/v1`. This ticket uses the existing `tx.inspect`, `tx.identify`, `tx.intent`, `tx.witness.plan`, `tx.browse`, and `tx.witness.attach` operations without changing their request or response envelopes.
