# Capability reference

This page maps every authoritative entry in `release/capabilities.json` to
its shared implementation, host surfaces, engines, and fixture/proof anchor.
The manifest is the sole source of truth — documentation must not invent or
omit capability ids.

<!-- release-docs:capability:ADDR-001 -->
### ADDR-001

- Operation: Inspect Cardano address
- Implementation: `Cardano.Address.Inspect.eitherInspectAddress`
- Source: `lib/src/Cardano/Offline/Address.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/Main.purs` / `inspectAddressWithSharedWasm`)
- CLI: `csk address inspect`
- Node: `inspectAddress`
- Engines: cardano-addresses
- Proof: `test-vectors/vectors.json` — address inspection vectors; scripts/check-offline-capability-inventory.sh
- Parity: three-host parity
<!-- /release-docs:capability:ADDR-001 -->

<!-- release-docs:capability:MN-001 -->
### MN-001

- Operation: Generate BIP-39 mnemonic
- Implementation: `Cardano.Mnemonic.generateMnemonic`
- Source: `lib/src/Cardano/Offline/Mnemonic.purs`
- WebUI route: `RouteKeys` (`docs/inspector/src/Main.purs` / `generateMnemonic`)
- CLI: `csk mnemonic generate`
- Node: `generateMnemonic`
- Engines: cardano-addresses
- Proof: `tests/mnemonic.spec.ts` — mnemonic generation spec
- Parity: three-host parity
<!-- /release-docs:capability:MN-001 -->

<!-- release-docs:capability:MN-002 -->
### MN-002

- Operation: Validate BIP-39 mnemonic
- Implementation: `Cardano.Mnemonic.validateMnemonic`
- Source: `lib/src/Cardano/Offline/Mnemonic.purs`
- WebUI route: `RouteKeys` (`docs/inspector/src/Main.purs` / `validateMnemonic`)
- CLI: `csk mnemonic validate`
- Node: `validateMnemonic`
- Engines: cardano-addresses
- Proof: `tests/mnemonic.spec.ts` — mnemonic validation spec
- Parity: three-host parity
<!-- /release-docs:capability:MN-002 -->

<!-- release-docs:capability:KEY-001 -->
### KEY-001

- Operation: Derive Shelley keys
- Implementation: `Cardano.Address.Derivation.derivePipeline`
- Source: `lib/src/Cardano/Offline/Key.purs`
- WebUI route: `RouteKeys` (`docs/inspector/src/Main.purs` / `derivePipeline`)
- CLI: `csk key derive`
- Node: `deriveKeys`
- Engines: cardano-addresses
- Proof: `tests/derivation.spec.ts` — key derivation spec
- Parity: three-host parity
<!-- /release-docs:capability:KEY-001 -->

<!-- release-docs:capability:KEY-002 -->
### KEY-002

- Operation: Construct Shelley addresses
- Implementation: `Cardano.Address.Shelley.constructShelleyAddresses`
- Source: `lib/src/Cardano/Offline/Key.purs`
- WebUI route: `RouteAddresses` (`docs/inspector/src/Main.purs` / `constructShelleyAddresses`)
- CLI: `csk key address shelley`
- Node: `constructShelleyAddresses`
- Engines: cardano-addresses
- Proof: `tests/derivation.spec.ts` — shelley address construction spec
- Parity: three-host parity
<!-- /release-docs:capability:KEY-002 -->

<!-- release-docs:capability:KEY-003 -->
### KEY-003

- Operation: Restore Icarus address
- Implementation: `Cardano.Address.Bootstrap.constructIcarusAddressFromMnemonic`
- Source: `lib/src/Cardano/Offline/Key.purs`
- WebUI route: `RouteAddresses` (`docs/inspector/src/Main.purs` / `constructIcarusAddressFromMnemonic`)
- CLI: `csk key restore icarus`
- Node: `constructIcarusAddressFromMnemonic`
- Engines: cardano-addresses
- Proof: `tests/legacy-bootstrap.spec.ts` — icarus restore spec
- Parity: three-host parity
<!-- /release-docs:capability:KEY-003 -->

<!-- release-docs:capability:KEY-004 -->
### KEY-004

- Operation: Restore Byron address
- Implementation: `Cardano.Address.Bootstrap.constructByronAddressFromMnemonic`
- Source: `lib/src/Cardano/Offline/Key.purs`
- WebUI route: `RouteAddresses` (`docs/inspector/src/Main.purs` / `constructByronAddressFromMnemonic`)
- CLI: `csk key restore byron`
- Node: `constructByronAddressFromMnemonic`
- Engines: cardano-addresses
- Proof: `tests/legacy-bootstrap.spec.ts` — byron restore spec
- Parity: three-host parity
<!-- /release-docs:capability:KEY-004 -->

<!-- release-docs:capability:KEY-005 -->
### KEY-005

- Operation: Construct Icarus address
- Implementation: `Cardano.Address.Bootstrap.constructIcarusAddress`
- Source: `lib/src/Cardano/Offline/Key.purs`
- WebUI route: `RouteAddresses` (`docs/inspector/src/Main.purs` / `constructIcarusAddress`)
- CLI: `csk key address icarus`
- Node: `constructIcarusAddress`
- Engines: cardano-addresses
- Proof: `tests/legacy-bootstrap.spec.ts` — icarus construct spec
- Parity: three-host parity
<!-- /release-docs:capability:KEY-005 -->

<!-- release-docs:capability:KEY-006 -->
### KEY-006

- Operation: Construct Byron address
- Implementation: `Cardano.Address.Bootstrap.constructByronAddress`
- Source: `lib/src/Cardano/Offline/Key.purs`
- WebUI route: `RouteAddresses` (`docs/inspector/src/Main.purs` / `constructByronAddress`)
- CLI: `csk key address byron`
- Node: `constructByronAddress`
- Engines: cardano-addresses
- Proof: `tests/legacy-bootstrap.spec.ts` — byron construct spec
- Parity: three-host parity
<!-- /release-docs:capability:KEY-006 -->

<!-- release-docs:capability:PAY-001 -->
### PAY-001

- Operation: Sign arbitrary payload
- Implementation: `Cardano.Address.Signing.signPayload`
- Source: `lib/src/Cardano/Offline/Payload.purs`
- WebUI route: `RouteKeys` (`docs/inspector/src/Main.purs` / `signPayload`)
- CLI: `csk payload sign`
- Node: `signPayload`
- Engines: cardano-addresses
- Proof: `tests/signing.spec.ts` — payload signing spec
- Parity: three-host parity
<!-- /release-docs:capability:PAY-001 -->

<!-- release-docs:capability:PAY-002 -->
### PAY-002

- Operation: Verify arbitrary payload
- Implementation: `Cardano.Address.Signing.verifySignature`
- Source: `lib/src/Cardano/Offline/Payload.purs`
- WebUI route: `RouteKeys` (`docs/inspector/src/Main.purs` / `verifySignature`)
- CLI: `csk payload verify`
- Node: `verifySignature`
- Engines: cardano-addresses
- Proof: `tests/signing.spec.ts` — payload verify spec
- Parity: three-host parity
<!-- /release-docs:capability:PAY-002 -->

<!-- release-docs:capability:SCR-001 -->
### SCR-001

- Operation: Analyze native-script CBOR
- Implementation: `Cardano.Address.Script.analyzeNativeScriptHex`
- Source: `lib/src/Cardano/Offline/Script.purs`
- WebUI route: `RouteScripts` (`docs/inspector/src/Main.purs` / `analyzeNativeScriptHex`)
- CLI: `csk script inspect`
- Node: `analyzeNativeScriptHex`
- Engines: cardano-addresses
- Proof: `tests/scripts.spec.ts` — native script CBOR spec; parity-locked to Haskell vectors
- Parity: three-host parity
<!-- /release-docs:capability:SCR-001 -->

<!-- release-docs:capability:SCR-002 -->
### SCR-002

- Operation: Author native script from JSON
- Implementation: `Cardano.Address.Script.analyzeNativeScriptJson`
- Source: `lib/src/Cardano/Offline/Script.purs`
- WebUI route: `RouteScripts` (`docs/inspector/src/Main.purs` / `analyzeNativeScriptJson`)
- CLI: `csk script author`
- Node: `analyzeNativeScriptJson`
- Engines: cardano-addresses
- Proof: `tests/scripts.spec.ts` — native script author spec
- Parity: three-host parity
<!-- /release-docs:capability:SCR-002 -->

<!-- release-docs:capability:SCR-003 -->
### SCR-003

- Operation: Analyze ScriptTemplate
- Implementation: `Cardano.Address.Script.analyzeScriptTemplateJson`
- Source: `lib/src/Cardano/Offline/Script.purs`
- WebUI route: `RouteScripts` (`docs/inspector/src/Main.purs` / `analyzeScriptTemplateJson`)
- CLI: `csk script template`
- Node: `analyzeScriptTemplateJson`
- Engines: cardano-addresses
- Proof: `tests/scripts.spec.ts` — script template spec
- Parity: three-host parity
<!-- /release-docs:capability:SCR-003 -->

<!-- release-docs:capability:TX-LOAD-001 -->
### TX-LOAD-001

- Operation: Load provider-backed transaction and resolve validation context
- Implementation: `Cardano.Provider.resolveProducerTxContext`
- Source: `lib/src/Cardano/Provider.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/Provider.purs` / `resolveProducerTxContext`)
- CLI: `csk tx inspect --tx-hash HASH --provider P --network N`
- Node: `inspectTransaction`
- Engines: (none — host-owned / provider I/O; see engineNote)
- Engine note: Provider HTTP/context resolution is host-owned shared I/O (Cardano.Provider); no authoritative engine semantics. The loaded transaction is then inspected by cardano-ledger-inspector.
- Proof: `node/test/transaction-provider.test.mjs` — provider context resolution; fixtures node/test/fixtures/provider-failures.json
- Parity: three-host parity
<!-- /release-docs:capability:TX-LOAD-001 -->

<!-- release-docs:capability:TX-INSPECT-001 -->
### TX-INSPECT-001

- Operation: Inspect transaction
- Implementation kind: `engine-protocol`
- Protocol operation: `tx.inspect`
- Protocol source: `node/src/transaction-engine.js`
- Note: Authoritative engine-protocol operation tx.inspect executed by cardano-ledger-inspector (wasm-tx-inspector.wasm); there is no shared PureScript symbol for this operation. Hosts invoke it through the shared runLedgerOperation/runTransactionOperation wrapper.
- WebUI route: `RouteInspect` (`docs/inspector/src/Main.purs` / `"tx.inspect"`)
- CLI: `csk tx inspect`
- Node: `inspectTransaction`
- Engines: cardano-ledger-inspector
- Proof: `node/test/transaction-ledger.test.mjs` — tx inspect; fixtures node/test/fixtures/transaction-ledger.json
- Parity: three-host parity
<!-- /release-docs:capability:TX-INSPECT-001 -->

<!-- release-docs:capability:TX-BROWSE-001 -->
### TX-BROWSE-001

- Operation: Browse transaction
- Implementation kind: `engine-protocol`
- Protocol operation: `tx.browse`
- Protocol source: `node/src/transaction-engine.js`
- Note: Authoritative engine-protocol operation tx.browse executed by cardano-ledger-inspector (wasm-tx-inspector.wasm); there is no shared PureScript symbol for this operation. Hosts invoke it through the shared runLedgerOperation/runTransactionOperation wrapper.
- WebUI route: `RouteInspect` (`docs/inspector/src/Main.purs` / `"tx.browse"`)
- CLI: `csk tx browse`
- Node: `browseTransaction`
- Engines: cardano-ledger-inspector
- Proof: `node/test/transaction-ledger.test.mjs` — tx browse
- Parity: three-host parity
<!-- /release-docs:capability:TX-BROWSE-001 -->

<!-- release-docs:capability:TX-IDENTIFY-001 -->
### TX-IDENTIFY-001

- Operation: Identify transaction
- Implementation kind: `engine-protocol`
- Protocol operation: `tx.identify`
- Protocol source: `node/src/transaction-engine.js`
- Note: Authoritative engine-protocol operation tx.identify executed by cardano-ledger-inspector (wasm-tx-inspector.wasm); there is no shared PureScript symbol for this operation. Hosts invoke it through the shared runLedgerOperation/runTransactionOperation wrapper.
- WebUI route: `RouteInspect` (`docs/inspector/src/Main.purs` / `"tx.identify"`)
- CLI: `csk tx identify`
- Node: `identifyTransaction`
- Engines: cardano-ledger-inspector
- Proof: `node/test/transaction-ledger.test.mjs` — tx identify
- Parity: three-host parity
<!-- /release-docs:capability:TX-IDENTIFY-001 -->

<!-- release-docs:capability:TX-INTENT-001 -->
### TX-INTENT-001

- Operation: Determine transaction intent
- Implementation kind: `engine-protocol`
- Protocol operation: `tx.intent`
- Protocol source: `node/src/transaction-engine.js`
- Note: Authoritative engine-protocol operation tx.intent executed by cardano-ledger-inspector (wasm-tx-inspector.wasm); there is no shared PureScript symbol for this operation. Hosts invoke it through the shared runLedgerOperation/runTransactionOperation wrapper.
- WebUI route: `RouteInspect` (`docs/inspector/src/Main.purs` / `"tx.intent"`)
- CLI: `csk tx intent`
- Node: `transactionIntent`
- Engines: cardano-ledger-inspector
- Proof: `node/test/transaction-ledger.test.mjs` — tx intent
- Parity: three-host parity
<!-- /release-docs:capability:TX-INTENT-001 -->

<!-- release-docs:capability:TX-BOOK-001 -->
### TX-BOOK-001

- Operation: Resolve transaction inspection books
- Implementation: `Cardano.Transaction.Book.importBooksWithSources`
- Source: `lib/src/Cardano/Transaction/Book.purs`
- WebUI route: `RouteLibrary` (`docs/inspector/src/Main.purs` / `resolvedLabelsLensFromGraph`)
- CLI: `csk tx inspect --book PATH`
- Node: `inspectTransaction`
- Engines: cardano-ledger-inspector, rdf-shapes-wasm
- Proof: `node/test/transaction-books.test.mjs` — book import/resolution; fixtures node/test/fixtures/transaction-books.json
- Parity: three-host parity
<!-- /release-docs:capability:TX-BOOK-001 -->

<!-- release-docs:capability:TX-WITNESS-PREPARE-001 -->
### TX-WITNESS-PREPARE-001

- Operation: Prepare detached transaction witness
- Implementation: `Cardano.Transaction.Witness.prepareWitness`
- Source: `lib/src/Cardano/Transaction/Witness.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/TxSigning.purs` / `prepareWitness`)
- CLI: `csk tx witness attach`
- Node: `prepareTransactionWitness`
- Engines: cardano-addresses
- Engine note: Witness preparation signs the transaction body hash via Cardano.Address.Signing (address engine); it does not invoke the ledger engine.
- Proof: `node/test/transaction-witness.test.mjs` — witness preparation; fixtures node/test/fixtures/transaction-witnesses.json
- Parity: three-host parity
<!-- /release-docs:capability:TX-WITNESS-PREPARE-001 -->

<!-- release-docs:capability:TX-WITNESS-NORMALISE-001 -->
### TX-WITNESS-NORMALISE-001

- Operation: Normalise detached transaction witness
- Implementation: `Cardano.Transaction.Witness.decodeWitnessInput`
- Source: `lib/src/Cardano/Transaction/Witness.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/TxSigning.purs` / `attachPastedWitness`)
- CLI: `csk tx witness attach --witness-file PATH`
- Node: `normaliseTransactionWitness`
- Engines: (none — host-owned / provider I/O; see engineNote)
- Engine note: Witness normalisation (decodeWitnessInput/encodeWitnessTextEnvelope) uses only shared Cardano.TextEnvelope CBOR/JSON helpers; it invokes no authoritative engine.
- Proof: `node/test/transaction-witness.test.mjs` — witness normalisation
- Parity: three-host parity
<!-- /release-docs:capability:TX-WITNESS-NORMALISE-001 -->

<!-- release-docs:capability:TX-WITNESS-PLAN-001 -->
### TX-WITNESS-PLAN-001

- Operation: Plan required transaction witnesses
- Implementation: `Cardano.Transaction.Ledger.planTransactionWitnessesOperation`
- Source: `lib/src/Cardano/Transaction/Ledger.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/TxSigning.purs` / `planTransactionWitnessesOperation`)
- CLI: `csk tx witness plan`
- Node: `planTransactionWitnesses`
- Engines: cardano-ledger-inspector
- Proof: `node/test/transaction-witness.test.mjs` — witness plan
- Parity: three-host parity
<!-- /release-docs:capability:TX-WITNESS-PLAN-001 -->

<!-- release-docs:capability:TX-WITNESS-ATTACH-001 -->
### TX-WITNESS-ATTACH-001

- Operation: Attach detached transaction witness
- Implementation: `Cardano.Transaction.Ledger.attachTransactionWitnessOperation`
- Source: `lib/src/Cardano/Transaction/Ledger.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/TxSigning.purs` / `attachTransactionWitnessOperation`)
- CLI: `csk tx witness attach`
- Node: `attachTransactionWitness`
- Engines: cardano-ledger-inspector
- Proof: `node/test/transaction-witness.test.mjs` — witness attachment
- Parity: three-host parity
<!-- /release-docs:capability:TX-WITNESS-ATTACH-001 -->

<!-- release-docs:capability:TX-VALIDATE-001 -->
### TX-VALIDATE-001

- Operation: Validate transaction against ledger rules
- Implementation: `Cardano.Transaction.Ledger.validateTransactionOperation`
- Source: `lib/src/Cardano/Transaction/Ledger.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/Main.purs` / `validateTransactionOperation`)
- CLI: `csk tx validate`
- Node: `validateTransaction`
- Engines: cardano-ledger-inspector
- Proof: `node/test/transaction-ledger.test.mjs` — ledger validation; fixtures node/test/fixtures/transaction-ledger.json
- Parity: three-host parity
<!-- /release-docs:capability:TX-VALIDATE-001 -->

<!-- release-docs:capability:TX-EVALUATE-001 -->
### TX-EVALUATE-001

- Operation: Evaluate executable transaction scripts
- Implementation: `Cardano.Transaction.Ledger.evaluateTransactionScriptsOperation`
- Source: `lib/src/Cardano/Transaction/Ledger.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/Main.purs` / `evaluateTransactionScriptsOperation`)
- CLI: `csk tx evaluate-scripts`
- Node: `evaluateTransactionScripts`
- Engines: cardano-ledger-inspector
- Proof: `node/test/transaction-ledger.test.mjs` — script evaluation via embedded Plutus
- Parity: three-host parity
<!-- /release-docs:capability:TX-EVALUATE-001 -->

<!-- release-docs:capability:TX-SUBMIT-001 -->
### TX-SUBMIT-001

- Operation: Submit signed transaction through a provider
- Implementation: `Cardano.Provider.submitTxEntry`
- Source: `lib/src/Cardano/Provider.purs`
- WebUI route: `RouteInspect` (`docs/inspector/src/Provider.purs` / `submitTxEntry`)
- CLI: `csk tx submit`
- Node: `submitTransactionEntry`
- Engines: (none — host-owned / provider I/O; see engineNote)
- Engine note: Provider submission is host-owned shared I/O (Cardano.Provider); no authoritative engine semantics.
- Proof: `node/test/transaction-provider.test.mjs` — provider submission; fixtures node/test/fixtures/provider-failures.json
- Parity: three-host parity
<!-- /release-docs:capability:TX-SUBMIT-001 -->
