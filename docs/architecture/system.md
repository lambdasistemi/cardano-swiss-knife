# System Architecture

## Host / engine boundary (release hazards)

<!-- release-docs:hazard:host-engine-boundary -->
Hosts own presentation, transport, browser storage, vault lifecycle/migration,
credentials, and orchestration. Authoritative address, ledger/transaction/
embedded Plutus, and RDF/SPARQL/SHACL semantics remain with their pinned engines.
WebUI, CLI, and Node are thin hosts over the shared PureScript surface and the
engine artifacts listed in `release/engines.json`.
<!-- /release-docs:hazard:host-engine-boundary -->

<!-- release-docs:hazard:semantic-drift -->
Semantic drift is a release hazard: host code must not restate ledger or crypto
rules that can diverge from the pinned engine behavior. When documentation or
host helpers appear to duplicate an engine rule, treat the engine output as
authoritative and delete the host restatement.
<!-- /release-docs:hazard:semantic-drift -->

<!-- release-docs:hazard:fail-hard-engines -->
Missing or incompatible engines fail hard with typed errors. Hosts must not
mask load, compatibility, execution, or protocol failures. A missing
`cardano-addresses.wasm`, `wasm-tx-inspector.wasm`, or
`rdf_shapes_wasm_bg.wasm` is an explicit operator-visible failure, never a
degraded mode.
<!-- /release-docs:hazard:fail-hard-engines -->

<!-- release-docs:hazard:no-fallback -->
Silent fallback and host-side reimplementation of engine semantics are
prohibited. Prefer an explicit error over a plausible-looking substitute result.
No second provider, JavaScript CBOR decoder, or alternate Plutus evaluator may
fill in for a failed engine call.
<!-- /release-docs:hazard:no-fallback -->

<!-- release-docs:hazard:embedded-plutus -->
Plutus evaluation is embedded in wasm-tx-inspector; there is no separate Plutus
WASI artifact and hosts must not ship an alternate evaluator. The libraries
are listed under the `cardano-ledger-inspector` engine row in
`release/engines.json` (`embeddedPlutus.libraries`).
<!-- /release-docs:hazard:embedded-plutus -->

## Runtime shape

The deployed site is a static bundle:

- the unified MD3 HTML and CSS shell built from `docs/inspector/`
- one PureScript application bundle, `index.js`
- hashed address, ledger-inspector, and RDF-shapes WASM families

No server-side application is required for the core product.

## Product and engine

`cardano-swiss-knife` (csk) is the browser product and workbench;
[cardano-ledger-inspector](https://github.com/lambdasistemi/cardano-ledger-inspector)
is its ledger engine.

- The workbench consumes the engine through the flake inputs
  `cardano-ledger-inspector` and `rdf-shapes-wasm`.
- It invokes `wasm-tx-inspector.wasm` through a JSON control-envelope
  protocol (`tx_cbor` + `op` + `args` over stdin), keeping ledger operations
  in the engine rather than browser JavaScript.

## Core subsystems

<!-- architecture-boundary: responsibility-table -->
### Responsibility boundary

| Area | Owns | Must not own |
| --- | --- | --- |
| Browser host and UI state | Halogen rendering, navigation, form and vault state, and translating explicit capability outcomes into user-visible diagnostics | Provider endpoint policy, Cardano/CBOR/RDF/SPARQL/SHACL semantics, or fallback results |
| Shared provider capability | Provider/network types, selected-provider endpoint and request policy, authentication, status/error classification, response decoding, and validation-context assembly in lib/src/Cardano/Provider.purs | DOM, browser storage, Node filesystem, CLI parsing, transaction entry/store/persistence, witnesses, completeness, or submission |
| Address engine | Address inspection, mnemonic and key operations through cardano-addresses.wasm | Browser reimplementation of address semantics |
| Transaction engine | Ledger decoding, transaction analysis, witnesses, and transaction-tree semantics through wasm-tx-inspector.wasm | JavaScript or PureScript substitutes for ledger semantics |
| RDF/SHACL engine | RDF graph and shape semantics through the RDF-shapes WASM artifact; the approved RDF editor only owns editing UI | Host-side RDF, SPARQL, or SHACL semantic fallback |

### Browser shell

The Halogen application in `docs/inspector/` coordinates navigation, form state, vault usage, and rendering.

### Address engine

`cardano-addresses.wasm` is used for:

- address inspection
- mnemonic generation
- wallet restoration
- Shelley key derivation
- raw payload signing and verification

### Transaction engine

`wasm-tx-inspector.wasm` is used for:

- transaction decoding
- transaction identity extraction
- intent summary generation
- witness plan analysis
- vkey witness attachment
- transaction tree browsing

### Providers

The Transactions page can fetch CBOR from external providers when the user starts from a transaction hash:

- Blockfrost
- Koios

Those provider credentials are UI inputs, not backend secrets. They belong in the encrypted vault because the app is entirely client-side.

lib/src/Cardano/Provider.purs is the sole production owner of provider endpoint
bases and paths, authentication/header policy, HTTP method and request-body
selection, status classification, provider/network types, and selected-provider
behavior. lib/src/Cardano/Provider.js is deliberately host-neutral: it only
transfers generic Fetch bodies, adapts JSON response shapes, and maintains the
resolution envelope. The WebUI Provider and FFI.Blockfrost modules are
compatibility delegates, not another HTTP implementation.

<!-- architecture-boundary: artifact-provenance-pins -->
## Artifact provenance and pins

The browser never invents engine artifact hashes. flake.nix names the
authoritative producers and flake.lock pins their resolved revisions:

| Artifact | Authoritative flake input | Packaging path |
| --- | --- | --- |
| cardano-addresses.wasm | cardano-addresses | cardano-addresses.packages.<system>.wasm |
| wasm-tx-inspector.wasm | cardano-ledger-inspector | cardano-ledger-inspector.packages.<system>.wasm-tx-inspector |
| RDF-shapes WASM | rdf-shapes-wasm | rdf-shapes-wasm.packages.<system>.wasm-pkg |

Updating an artifact therefore means updating the named flake input and
reviewing its corresponding flake.lock change, then rebuilding through Nix.
The host consumes the resulting artifacts; it does not replace their
Cardano, CBOR, RDF, SPARQL, or SHACL meaning with a package dependency.

<!-- architecture-boundary: fail-hard-behavior -->
## Explicit failure behavior

Provider and engine failures are fail-hard and remain visible to the caller.
Missing credentials, transport failures, HTTP status failures, malformed
responses, decode failures, engine-load failures, protocol failures, and
semantic failures do not trigger a second provider, a JavaScript/PureScript
semantic fallback, or a synthetic partial context. A validation-context
sub-request failure makes the context operation fail explicitly; it is never
quietly converted into a successful-looking result.

<!-- architecture-boundary: provider-extension-process -->
## Extending a provider operation

To add or change a provider operation:

1. Change the shared Provider/Network types, request construction, decode
   rules, and typed error outcomes together in Cardano.Provider; keep request
   policy in Provider.purs and only generic Fetch/JSON adaptation in
   Provider.js.
2. Add hermetic contracts with real provider response envelopes for every
   selected provider, including explicit error outcomes. Do not make a host
   reconstruct the contract.
3. Preserve WebUI compatibility solely by delegation through the existing thin
   adapters; do not restore WebUI HTTP modules or provider fallback.
4. Update the architecture-boundary self-tests and this documentation, then run
   the focused boundary check and the full repository proofs.

## Deployment shape

GitHub Pages serves the static site from `main`. The published artifact contains:

- the same app at canonical root routes and `/inspector/` compatibility routes
- the documentation site at `/docs/`

Pull requests can also publish disposable preview builds to the shared
`preview.dev.plutimus.com` host.
