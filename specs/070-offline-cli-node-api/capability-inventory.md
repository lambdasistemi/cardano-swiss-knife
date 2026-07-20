# Checked backend-independent capability inventory

**Baseline**: `4061f083ba48456f9e63383c2c797396ef272d5e`

**Source surfaces**: `docs/inspector/src/Main.purs`, `lib/src/Cardano/**`,
`tests/{inspect,mnemonic,derivation,legacy-bootstrap,signing,scripts}.spec.ts`,
and `docs/inspector/tests/unified-{keys,address-scripts}.spec.mjs`.

This inventory treats a capability as deterministic domain work that can be
invoked without a provider, browser persistence, or presentation state. Reveal,
copy, tabs, routing, vault shelves, and reactive refresh are host behavior, not
separate operations. Provider-backed and later-epic transaction behavior is
classified below rather than silently omitted.

| ID | Operation | WebUI behavior at baseline | Authoritative shared implementation | Required CLI family |
|---|---|---|---|---|
| ADDR-001 | Inspect Cardano address | Decode Shelley bech32 or bootstrap base58 into style, type, network, stake reference, and credential hashes | `Cardano.Address.Inspect.eitherInspectAddress` plus pinned address WASI | `csk address inspect` |
| MN-001 | Generate BIP-39 mnemonic | Generate 12, 15, 18, 21, or 24 words locally | `Cardano.Mnemonic.generateMnemonic` | `csk mnemonic generate` |
| MN-002 | Validate BIP-39 mnemonic | Reject invalid word lists/checksums before restore | `Cardano.Mnemonic.validateMnemonic` | `csk mnemonic validate` |
| KEY-001 | Derive Shelley keys | Derive root, account, address/stake private keys and public keys by account, role, and index | `Cardano.Address.Derivation.derivePipeline` plus pinned address WASI | `csk key derive` |
| KEY-002 | Construct Shelley addresses | Build payment, base, and reward addresses for mainnet, preprod, preview, or custom network tag | `Cardano.Address.Shelley.constructShelleyAddresses` | `csk key address shelley` |
| KEY-003 | Restore Icarus address | Derive an Icarus bootstrap address from mnemonic, account, role, index, and network | `Cardano.Address.Bootstrap.constructIcarusAddressFromMnemonic` plus pinned address WASI | `csk key restore icarus` |
| KEY-004 | Restore Byron address | Derive a Byron bootstrap address from mnemonic, account, index, and network | `Cardano.Address.Bootstrap.constructByronAddressFromMnemonic` plus pinned address WASI | `csk key restore byron` |
| KEY-005 | Construct Icarus address | Build an Icarus bootstrap address from an address xpub and network | `Cardano.Address.Bootstrap.constructIcarusAddress` plus pinned address WASI | `csk key address icarus` |
| KEY-006 | Construct Byron address | Build a Byron bootstrap address from address/root xpubs, path, and network | `Cardano.Address.Bootstrap.constructByronAddress` plus pinned address WASI | `csk key address byron` |
| PAY-001 | Sign arbitrary payload | Sign UTF-8 text or hex bytes with an extended signing key and return signature, payload hex, and xvk | `Cardano.Address.Signing.signPayload` plus pinned address WASI | `csk payload sign` |
| PAY-002 | Verify arbitrary payload | Verify UTF-8 text or hex bytes, signature, and extended verification key | `Cardano.Address.Signing.verifySignature` plus pinned address WASI | `csk payload verify` |
| SCR-001 | Analyze native-script CBOR | Decode canonical preimage, validate, hash, and render canonical JSON | `Cardano.Address.Script.analyzeNativeScriptHex` parity-locked to Haskell vectors | `csk script inspect` |
| SCR-002 | Author native script from JSON | Parse JSON and return canonical CBOR/JSON, validation, and hashes | `Cardano.Address.Script.analyzeNativeScriptJson` parity-locked to Haskell vectors | `csk script author` |
| SCR-003 | Analyze ScriptTemplate | Validate cosigners/template and derive the canonical native script when valid | `Cardano.Address.Script.analyzeScriptTemplateJson` parity-locked to Haskell vectors | `csk script template` |

## Explicitly classified exclusions

| Surface | Classification | Owner/reason |
|---|---|---|
| Reveal/hide/copy/handoff buttons, reactive tab state, routing, theme | Host presentation | Thin-host behavior, not a domain operation |
| Vault create/open/export/lock/shelves and migration | Backend-independent but reserved sibling scope | #69 owns schema, age crypto, migration, adapters, and CLI vault surface |
| Transaction CBOR loading and validation context | Provider-backed | #71 consumes #10's shared provider core |
| Transaction witness planning, signing/attachment, ledger validation, script evaluation | Later parity scope | #72 |
| Provider submission | Later shared capability | #77 under #66 |
| Library/RDF book CRUD, SPARQL, and SHACL UI | Separate product domain absent from issue #70 command families | Not part of the #70 address/mnemonic/key/script/payload deliverable; RDF semantics remain in the pinned engine |
| Backlog capabilities not present in the child baseline | Unimplemented | Explicit issue non-goal, including #14 and #15 |

## Inventory gate

Implementation proof must keep this table in one-to-one correspondence with:

1. the shared PureScript facade exports;
2. the public ESM exports;
3. the CLI command registry after #69 releases its parser; and
4. success and failure vectors/tests.

The architecture check must fail when an inventory ID lacks any required host
mapping or when a host adds substitute engine-owned semantics.
