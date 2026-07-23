# Engine reference

This page maps every authoritative entry in `release/engines.json` to its
artifact, provenance pin, packaged path, ownership, and fail-hard /
no-fallback behavior. The manifest is the sole source of truth —
documentation must not invent or omit engine ids. Hosts never reimplement
these semantics.

<!-- release-docs:engine:cardano-addresses -->
### cardano-addresses

- Artifact: `cardano-addresses.wasm`
- Source: `github:paolino/cardano-addresses`
- Flake input: `cardano-addresses`
- Revision: `7a4f2b572e1aaa735cbcf93e3070f3beeda48b0f`
- narHash: `sha256-ZTD/BHZBzJXvVSByGDbNGxhksqclAS0R5MW7N+TiLMc=`
- Owning language: Haskell
- Protocol: wasm32-wasi reactor; invoked through the Cardano.Address.* PureScript FFI for address, mnemonic, key-derivation, script, and payload signing semantics.
- Responsibility: Address and cryptographic semantics: bech32/base58 address inspection, BIP-39 mnemonic generation/validation, Shelley/Icarus/Byron key derivation and address construction, native-script analysis, and payload signing/verification.
- Packaged path: `node/dist/cardano-addresses.wasm`
- Fail-hard: Engine load, compatibility, execution, and protocol failures surface as typed ENGINE_* errors; no host-side substitute for address/crypto semantics is permitted.
- noFallback / no-fallback: hosts must not substitute semantics (manifest `noFallback: true`)

<!-- /release-docs:engine:cardano-addresses -->

<!-- release-docs:engine:cardano-ledger-inspector -->
### cardano-ledger-inspector

- Artifact: `wasm-tx-inspector.wasm`
- Source: `github:lambdasistemi/cardano-ledger-inspector`
- Flake input: `cardano-ledger-inspector`
- Revision: `cd346f3577dc243df09bf4b141b91d9470c5ec00`
- narHash: `sha256-Bd0BZ+hRN6/A5KUFvuMz7hMcZZ8NC7tG+HwjMOnecFs=`
- Owning language: Haskell
- Protocol: wasm32-wasi reactor speaking the tx-inspector JSON protocol over stdin/stdout ({ tx_cbor, op, args } -> { stdout, stderr, exitOk }); driven by runInspector/runLedgerOperation for the tx.* operation family.
- Responsibility: Conway ledger semantics: transaction CBOR decoding, inspection/browse/identify/intent, ledger validation, witness planning and attachment, and script evaluation.
- Packaged path: `node/dist/wasm-tx-inspector.wasm`
- Fail-hard: Engine load, compatibility, execution, and protocol failures surface as typed ENGINE_* errors; no host-side substitute for ledger/CBOR/validation/Plutus semantics is permitted.
- noFallback / no-fallback: hosts must not substitute semantics (manifest `noFallback: true`)

- embedded Plutus: libraries plutus-ledger-api, cardano-ledger-api, cardano-ledger-conway, cardano-ledger-core, cardano-ledger-alonzo, cardano-ledger-shelley, cardano-ledger-mary, cardano-ledger-binary
- separate Plutus WASI artifact: prohibited (false)
- embedded Plutus note: There is no separate Plutus WASI artifact; Plutus script execution is embedded in wasm-tx-inspector.wasm and no alternate Plutus artifact may be substituted.

<!-- /release-docs:engine:cardano-ledger-inspector -->

<!-- release-docs:engine:rdf-shapes-wasm -->
### rdf-shapes-wasm

- Artifact: `rdf_shapes_wasm_bg.wasm`
- Source: `github:lambdasistemi/rdf-shapes-wasm`
- Flake input: `rdf-shapes-wasm`
- Revision: `1240e4e58061836264d955b70c49c7195480f3b4`
- narHash: `sha256-/JbsZjn/9fnT6iVlRzh21+/LwWYsT8gHucqyGsi8H/w=`
- Owning language: Rust
- Protocol: wasm-bindgen ES module (@lambdasistemi/rdf-shapes-wasm, main rdf_shapes_wasm.js) loaded by Cardano.Transaction.Rdf.js / node/src/rdf-engine.js for SPARQL/SHACL resolution.
- Responsibility: RDF/SPARQL/SHACL semantics: transaction RDF graph label resolution, book/blueprint resolution, and SHACL validation.
- Packaged path: `node/dist/rdf_shapes_wasm_bg.wasm`
- Fail-hard: Engine load, compatibility, execution, and protocol failures surface as typed RDF_ENGINE_* errors; no host-side substitute for RDF/SPARQL/SHACL semantics is permitted.
- noFallback / no-fallback: hosts must not substitute semantics (manifest `noFallback: true`)

<!-- /release-docs:engine:rdf-shapes-wasm -->
