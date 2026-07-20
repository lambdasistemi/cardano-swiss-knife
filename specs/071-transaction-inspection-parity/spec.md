# Feature Specification: Transaction Inspection Parity

**Feature Branch**: `feat/71-transaction-inspection-parity`

**Created**: 2026-07-20

**Status**: Draft

**Input**: Issue #71 and parent epic #74

## P1 user story

As a Cardano operator or Node.js application, I provide raw transaction CBOR,
a `cardano-cli` transaction TextEnvelope, or a transaction hash with a selected
Blockfrost or Koios credential and receive the same inspection, browsing,
identification, intent, context, and book resolutions as the WebUI.

## User scenarios and testing

### User Story 1 — Offline transaction operations (Priority: P1)

The CLI and Node API accept raw Conway transaction CBOR or the shared #67
TextEnvelope form and invoke the pinned ledger-inspector WASI engine for
`tx.inspect`, `tx.browse`, `tx.identify`, and `tx.intent` without network IO.

**Independent Test**: Run all four Node operations and packaged CLI commands
under an outbound-network denial preload against raw CBOR and a TextEnvelope.

**Acceptance Scenarios**:

1. **Given** valid raw transaction CBOR, **when** any operation runs, **then**
   its decoded result comes from the pinned ledger-inspector engine.
2. **Given** a valid `Tx ConwayEra` or `Unwitnessed Tx ConwayEra` TextEnvelope,
   **when** any operation runs, **then** the shared codec supplies the identical
   CBOR bytes and result.
3. **Given** malformed input, unsupported envelope type, missing engine,
   incompatible engine, abnormal exit, or malformed engine output, **when** an
   operation runs, **then** the stable typed failure is explicit and no host
   decoder or fallback semantics execute.

### User Story 2 — Shared provider loading and context (Priority: P1)

A transaction hash is loaded through #10's single Blockfrost/Koios
implementation on mainnet, preprod, or preview; the same provider resolves
producer transactions and validation context for identify and intent.

**Independent Test**: Inject deterministic shared transports for every network
and provider and cover authentication, rate limiting, server, transport,
malformed response, partial context, and total failure outcomes.

**Acceptance Scenarios**:

1. **Given** a transaction hash, provider, network, and permitted credential,
   **when** an operation runs, **then** transaction CBOR and context requests use
   only `Cardano.Provider` and the selected provider/network.
2. **Given** one or more failed producer/context requests, **when** identify or
   intent runs, **then** resolved values, missing values, and ordered typed
   diagnostics remain distinguishable; partial context is not reported as total
   success or total failure.
3. **Given** a provider failure category, **when** Node or CLI renders it,
   **then** authentication, rate-limit, server, transport, and decode failures
   retain stable machine-readable codes and do not leak credentials.

### User Story 3 — Repeatable books and raw identifier truth (Priority: P1)

Node callers pass repeatable book documents and CLI callers pass repeatable
`--book PATH` inputs using the existing interchange formats. The transaction
graph is produced only by ledger-inspector and queried only by the pinned
RDF-shapes engine.

**Independent Test**: Use the committed treasury transaction and
`amaru.book.bundle.v1` fixtures to prove exact labels and types alongside the
unchanged raw identifiers, then remove/corrupt the RDF engine and observe a
typed hard failure.

**Acceptance Scenarios**:

1. **Given** Turtle, CIP-57, `amaru.book.bundle.v1`, or
   `cardano-ledger-inspector.books.v1` inputs, **when** books are applied, **then**
   the existing parser/interchange rules and input order are preserved.
2. **Given** a matching address, key, or script identifier, **when** a result is
   resolved, **then** the output carries the original raw identifier plus the
   resolved label/type; the label never replaces the raw value.
3. **Given** no matching book, **when** an operation completes, **then** its raw
   decoded result remains available without invented resolution.

### User Story 4 — Secure packaged operator surface (Priority: P1)

`csk tx inspect|browse|identify|intent` selects exactly one raw file/CBOR or
hash source. Provider credentials come from the portable age vault (Koios may
remain anonymous when the shared provider permits it), never argv or
environment variables.

**Independent Test**: Install the packed artifact outside the checkout, invoke
all four commands, inspect argv/env/output for secret leakage, and prove raw
commands remain green with networking denied.

**Acceptance Scenarios**:

1. **Given** a Blockfrost hash command, **when** the matching
   `blockfrost-project-id` vault entry is selected, **then** decrypted bytes stay
   in memory and are passed only to the shared provider.
2. **Given** a Koios hash command, **when** a `koios-bearer-token` vault entry is
   selected or anonymous access is allowed, **then** the same shared provider
   path runs.
3. **Given** invalid command shape, secret source, domain input, provider,
   engine, or book failure, **when** JSON output is requested, **then** the
   versioned envelope and deterministic non-zero exit mapping identify the
   category without exposing a secret.

## Functional requirements

- **FR-001**: Node MUST export `inspectTransaction`, `browseTransaction`,
  `identifyTransaction`, and `transactionIntent` with the package's existing
  `{ ok, value | error }` result envelope.
- **FR-002**: Each Node operation MUST accept exactly one of `{ cborHex }`,
  `{ textEnvelope }`, or `{ txHash, provider, network, credential? }`.
- **FR-003**: Raw and TextEnvelope inputs MUST pass through #67's shared codec
  and MUST perform no provider or other network request.
- **FR-004**: Transaction semantics MUST come only from the pinned
  ledger-inspector WASI engine; the host MUST NOT decode ledger CBOR or provide
  fallback inspection, browsing, identification, or intent semantics.
- **FR-005**: Hash loading and context MUST use `Cardano.Provider` for
  Blockfrost or Koios on mainnet, preprod, and preview; no second provider
  request/decoder implementation is permitted.
- **FR-006**: Provider outcomes MUST preserve authentication, rate-limit,
  server, transport, and malformed/decode categories with credential-free
  diagnostics.
- **FR-007**: Context resolution MUST distinguish complete, partial, and total
  failure and retain which producer transaction identifiers were unresolved.
- **FR-008**: Repeatable book inputs MUST accept the formats and ordering in
  `docs/book-interchange.md`, including compatibility keys.
- **FR-009**: Book parsing MUST be one shared implementation consumed by WebUI
  and Node; WebUI-visible behavior MUST not regress.
- **FR-010**: Transaction graph generation MUST use ledger-inspector `tx.rdf`;
  SPARQL/RDF resolution MUST use only the pinned RDF-shapes WASM engine.
- **FR-011**: Resolved output MUST preserve raw identifiers alongside resolved
  labels/types and MUST not silently substitute a label for ledger data.
- **FR-012**: Missing, incompatible, execution, or protocol failures from either
  engine MUST fail explicitly without JavaScript semantic fallback.
- **FR-013**: CLI MUST expose exactly `csk tx inspect|browse|identify|intent`
  and accept one of `--cbor-hex`, `--tx-file`, or `--tx-hash` plus required
  provider/network options; `--book PATH` MUST be repeatable.
- **FR-014**: Hash-command credentials MUST come from the #69 vault contract
  and matching entry kind; secret values MUST NOT travel through argv or
  environment variables and decrypted values remain in memory.
- **FR-015**: CLI human and JSON output plus usage, domain, secret, provider,
  engine, and book exit/error mappings MUST be deterministic.
- **FR-016**: Shared fixtures MUST cover authentication, rate limiting, server,
  transport, malformed provider response, partial context, total failure, and
  engine-load failure.
- **FR-017**: `./gate.sh` MUST run a raw-CBOR network-denial proof and the
  installed packaged CLI/API transaction smoke.
- **FR-018**: Witness mutation/planning, validation, script evaluation,
  submission, indexing, and new providers MUST remain outside this ticket.

## Success criteria

- **SC-001**: Raw CBOR and TextEnvelope calls return equal normalized output for
  all four Node operations and CLI commands.
- **SC-002**: Provider contract tests cover both providers and all three network
  mappings plus every required typed failure fixture.
- **SC-003**: The treasury fixture resolves its expected key/address/script
  labels while byte-for-byte raw identifiers remain present.
- **SC-004**: Missing/corrupt ledger and RDF engines each produce their declared
  typed failure with no fallback output.
- **SC-005**: Installed-package raw transaction API and CLI smokes pass with
  all outbound networking denied.
- **SC-006**: Provider credentials are absent from argv, environment, stdout,
  stderr, persisted temporary files, and structured errors.
- **SC-007**: `./gate.sh` exits 0 at final implementation HEAD.

## Assumptions and dependencies

- #10, #67, #69, and #70 are merged into the branch baseline.
- The flake-pinned ledger-inspector and RDF-shapes artifacts remain the
  authoritative semantic engines and can be packaged beside the Node bundle.
- Publication/version coordination belongs to #73; this ticket extends the
  already-packable artifact but does not publish a release.

## Out of scope

- Witness planning/mutation, ledger validation, Plutus execution, or submission.
- N2C, chain sync, mempool, indexing, or new provider implementations.
- New Cardano CBOR, ledger, RDF, SPARQL, SHACL, cryptographic, or fallback
  semantics in PureScript or JavaScript.
- Changes to the vault schema, age encryption, migration rules, or WebUI
  presentation unrelated to sharing the transaction/book implementation.
