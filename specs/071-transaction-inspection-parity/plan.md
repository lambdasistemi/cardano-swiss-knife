# Implementation Plan: Transaction Inspection Parity

**Branch**: `feat/71-transaction-inspection-parity` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

## Summary

Package the pinned ledger-inspector for Node, expose four offline transaction
operations through stable ESM functions, add shared provider-backed hash and
context loading, move book parsing/RDF resolution behind shared WebUI+Node
modules backed by the pinned RDF engine, then extend #70's CLI with secure
vault-selected provider credentials and installed-package smokes.

## Technical context

**Language/Version**: PureScript 0.15.16 and ESM on Node 22+

**Primary dependencies**: #67 TextEnvelope codec, `Cardano.Provider`, #69 age
vault, `@bjorn3/browser_wasi_shim`, flake-pinned ledger-inspector WASI and
RDF-shapes WASM, esbuild, and Node standard library

**Testing**: PureScript provider contracts, Node built-in tests, committed
transaction/book fixtures, package-install smokes, existing WebUI Playwright,
and `./gate.sh`

**Constraints**: thin hosts only; no fallback ledger/CBOR/RDF semantics; no
argv/env credentials; no witness/validation/evaluation/submission work

## Current state and seams

- #70 exposes an ESM result envelope and `csk` root but only address, mnemonic,
  key, script, payload, and vault operations.
- `Cardano.Provider` already owns Blockfrost/Koios endpoints, decoding, network
  mapping, typed failure constructors, transaction CBOR, validation context,
  and producer transaction resolution. The WebUI calls it directly.
- `Cardano.TextEnvelope` owns supported Conway transaction envelope decoding.
- The WebUI calls the pinned ledger-inspector through `FFI.Inspector`, then
  calls `tx.inspect`, `tx.identify`, `tx.intent`, `tx.rdf`, and on-demand
  `tx.browse`. Node has no ledger-inspector host or packaged asset yet.
- Book parsing and RDF queries live under WebUI `FFI.OverlayBook`,
  `FFI.BookStore`, and `FFI.RdfShapes`. Their semantic engines are already
  pinned, but the host-neutral pieces must move into `lib` so WebUI and Node
  consume one implementation.
- The inherited gate is restored intact. New checks are appended; prior gate
  functions and commands are never replaced.

## Public API and command contract

Node exports four functions:

```text
inspectTransaction(input, options?)
browseTransaction(input, { path, ...options })
identifyTransaction(input, options?)
transactionIntent(input, options?)
```

`input` is exactly one of:

```text
{ cborHex: String }
{ textEnvelope: String | Object }
{ txHash: String, provider: "blockfrost" | "koios",
  network: "mainnet" | "preprod" | "preview", credential?: String }
```

`options.books` is an ordered array of raw accepted book documents. Results
retain the ledger engine's decoded shape (including #65 metadata) and may add a
host-neutral `context`/`resolutions` section. Every resolution entry contains
the raw identifier, kind, resolved label, and resolved type; it never rewrites
the engine-owned value.

The CLI shape is:

```text
csk tx <inspect|browse|identify|intent>
  (--cbor-hex HEX | --tx-file PATH |
   --tx-hash HASH --provider blockfrost|koios --network mainnet|preprod|preview)
  [--vault PATH --vault-entry ID [--passphrase-fd FD]]
  [--book PATH ...] [--path JSON-PATH] [--output json]
```

`--path` is valid only for `browse`. A transaction file is read once and is
accepted as raw CBOR text or shared TextEnvelope JSON. Blockfrost hash loading
requires a matching `blockfrost-project-id` vault entry. Koios accepts a
matching `koios-bearer-token` entry or its shared anonymous mode. No credential
value flag or environment variable exists.

## Design

### Transaction engine and input boundary

Add a host-neutral transaction service facade plus a Node WASI runner. The
facade validates source exclusivity, delegates envelope parsing to
`Cardano.TextEnvelope`, delegates hash loading/context to `Cardano.Provider`,
and sends only operation requests to the ledger-inspector engine. The Node
runner resolves the packaged engine relative to `import.meta.url`, captures
stdout/stderr/exit, parses the operation envelope, and converts load,
instantiation, execution, and protocol failures to existing engine error codes.

### Provider and context boundary

Extend shared provider result adapters only as needed to make the existing
`ProviderError` categories machine-readable to Node. Do not add endpoints or
host fetch logic. Inspection runs first; identify/intent context uses the same
`resolveProducerTxContext` path as WebUI. Ordered diagnostics retain partial
producer/context success rather than collapsing it to a boolean.

### Book and RDF boundary

Move book parsing/normalization and the RDF query facade into `lib` with thin
compatibility imports from the WebUI. `tx.rdf` remains the sole transaction
graph producer. The shared resolver combines the graph with ordered selected
overlay Turtle and asks the packaged RDF-shapes engine for decoded-tree and
resolved-label rows. Nix stages the same pinned wasm-bindgen JS/WASM pair into
the Node build; missing/incompatible/protocol failure is typed and never falls
back to a host query implementation.

### CLI and vault boundary

Add a `tx` command handler over the ESM functions. The parser enforces exactly
one source and repeatable books. It reuses #69's no-echo/passphrase-fd vault
opening and in-memory entry selection; it does not change vault schema,
encryption, migration, or persistence. Rendering reuses the versioned result
envelope and extends exit mapping for provider and book failures.

## Slice plan

### Slice 1 — Offline transaction engine and Node API

Add failing Node tests for raw CBOR/TextEnvelope equality, all four operations,
browse paths, network denial, and ledger-engine failures. Add the shared input
facade and Node WASI runner, package the pinned ledger engine, and expose the
four ESM functions without provider or book behavior.

**Owned files**:

- `lib/src/Cardano/Transaction.purs`
- `lib/src/Cardano/Transaction.js`
- `node/src/transaction-engine.js`
- `node/src/index.js`
- `node/src/error.js`
- `node/test/transaction-api.test.mjs`
- `nix/purescript.nix`
- `nix/packages/default.nix`
- `nix/checks/default.nix`
- `nix/checks/node-api.nix`
- `flake.nix`
- `package.json`

**Focused proof**: `nix run .#ci-node-api`

**Commit**: `feat(node): expose offline transaction inspection`

### Slice 2 — Shared provider loading and context failures

Write direct shared-provider RED fixtures for every required category plus
partial/total context. Route hash inputs and identify/intent context through
`Cardano.Provider`, retain structured categories in Node results, and prove
both providers across mainnet/preprod/preview without modifying WebUI behavior.

**Owned files**:

- `lib/src/Cardano/Provider.purs`
- `lib/src/Cardano/Provider.js`
- `lib/src/Cardano/Transaction.purs`
- `lib/src/Cardano/Transaction.js`
- `test/src/Test/Provider.purs`
- `test/src/Test/Main.purs`
- `node/src/index.js`
- `node/src/error.js`
- `node/test/transaction-provider.test.mjs`
- `node/test/fixtures/provider-failures.json`
- `nix/checks/node-api.nix`

**Focused proof**: `nix run .#ci-test && nix run .#ci-node-api`

**Commit**: `feat(provider): share transaction loading and context`

### Slice 3 — Shared book parsing and RDF resolution

Write RED tests for all interchange forms, repeat ordering, exact treasury
labels, raw identifier retention, and RDF engine failures. Move the reusable
book/RDF modules into `lib`, keep WebUI imports thin, package the pinned RDF
engine, and add ordered `books` plus resolution output to the Node operations.

**Owned files**:

- `lib/src/Cardano/Transaction/Book.purs`
- `lib/src/Cardano/Transaction/Book.js`
- `lib/src/Cardano/Transaction/Rdf.purs`
- `lib/src/Cardano/Transaction/Rdf.js`
- `docs/inspector/src/Main.purs`
- `docs/inspector/src/FFI/BookStore.purs`
- `docs/inspector/src/FFI/BookStore.js`
- `docs/inspector/src/FFI/OverlayBook.purs`
- `docs/inspector/src/FFI/OverlayBook.js`
- `docs/inspector/src/FFI/RdfShapes.purs`
- `docs/inspector/src/FFI/RdfShapes.js`
- `node/src/index.js`
- `node/src/rdf-engine.js`
- `node/test/transaction-books.test.mjs`
- `node/test/fixtures/transaction-books.json`
- `nix/purescript.nix`
- `nix/packages/default.nix`
- `nix/checks/default.nix`
- `nix/checks/node-api.nix`
- `flake.nix`

**Focused proof**: `nix run .#ci-node-api && nix build .#tx-inspector-ui --no-link`

**Commit**: `feat(transaction): resolve inspection books`

### Slice 4 — CLI, vault credentials, and packaged smokes

Add failing CLI/package tests for all four commands, exact source validation,
repeatable book files, typed exits, vault-selected credentials, secret
non-leakage, raw-CBOR network denial, and foreign-CWD engine discovery. Add the
`tx` handler and extend the package check while preserving every existing
offline and vault command.

**Owned files**:

- `cli/csk.mjs`
- `cli/vault-host.mjs`
- `node/src/commands/tx.js`
- `node/test/cli.test.mjs`
- `node/test/package-smoke.mjs`
- `scripts/check-node-package.sh`
- `scripts/check-architecture-boundary.sh`
- `nix/checks/default.nix`
- `nix/checks/node-api.nix`
- `nix/purescript.nix`
- `nix/apps/csk.nix`
- `nix/apps/default.nix`
- `nix/packages/default.nix`
- `flake.nix`
- `package.json`

**Focused proof**: `nix run .#ci-node-api && nix run .#ci-node-package && nix run .#csk -- tx inspect --help`

**Commit**: `feat(cli): expose transaction inspection commands`

## Dependency and ordering constraints

1. Slice 1 lands first and establishes the package-relative ledger engine.
2. Slice 2 depends on Slice 1 and adds shared network/context behavior.
3. Slice 3 depends on Slice 1; it lands after Slice 2 so every operation has
   one stable result shape before book augmentation.
4. Slice 4 depends on all public Node behaviors and is the installed-package
   boundary proof.
5. One reviewed, bisect-safe commit per slice; no fixup commit and no push by a
   driver.

## Plan review: live-boundary smoke question

**What boundary can unit tests miss?** The installed Node artifact must locate
two pinned engine families from a foreign current working directory; CLI vault
credentials must cross an actual process/descriptor boundary; raw transaction
commands must remain offline; provider commands must perform only the selected
shared HTTP calls. Slice 4 therefore ships installed-package and network-denial
smokes in `./gate.sh`; transport fixtures alone are insufficient.

## Risks and mitigations

- **Engine packaging drift**: build and install the exact pinned artifacts,
  then remove/corrupt them in foreign-package tests.
- **Provider duplication**: architecture tests reject host-side endpoint,
  request, and response-decoder logic outside `Cardano.Provider`.
- **Book parser drift**: move rather than copy the implementation and retain
  existing browser journeys as compatibility proof.
- **Raw identifier loss**: fixture assertions compare exact raw values beside
  their labels, not merely label presence.
- **Credential leakage**: inspect argv, environment, diagnostics, output, and
  temporary package tree during the command smoke.
- **Slow full gate / known flaky browser test**: focused checks establish each
  RED/GREEN; if the sole full-gate failure is the documented concurrent-lane
  `tx-identify.spec.mjs` RDF-engine flake, escalate once citing #87.
