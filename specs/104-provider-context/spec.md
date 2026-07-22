# Feature Specification: Explicit Provider Context for Local Transactions

**Feature Branch**: `feat/104-provider-context`

**Created**: 2026-07-22

**Status**: Draft

**Input**: Issue #104 and parent epic #74; follows merged issue #72

## P1 user story

As a Cardano operator, I validate a local transaction file with an explicitly
selected provider and observe resolved producer transactions, reference inputs,
slot, and protocol-parameter evidence without replacing or re-decoding the
transaction bytes I supplied.

## User scenarios and testing

### User Story 1 — Explicit enrichment of local transaction bytes (Priority: P1)

A Node caller or CLI operator may pair raw transaction CBOR or a `Tx ConwayEra`
TextEnvelope with an explicit Blockfrost/Koios provider and network. CSK first
inspects those unchanged bytes, discovers unique ordinary and reference-input
producer transaction ids, and asks the existing `Cardano.Provider` resolver for
producer CBOR plus current validation context.

**Independent Test**: Invoke every scoped Node operation and packaged CLI
command with the committed local transaction fixture and a selected provider,
intercept the shared provider HTTP boundary, and verify the original transaction
is not fetched or replaced while unique producer/context requests and returned
resolution evidence are exact.

**Acceptance Scenarios**:

1. **Given** raw local CBOR and a provider/network pair, **when** inspect,
   identify, intent, witness plan, validate, or evaluate-scripts runs, **then**
   the operation uses the supplied bytes and includes shared-provider context.
2. **Given** a local transaction TextEnvelope with the same CBOR, **when** the
   same operation runs, **then** its engine-owned result and context evidence are
   equivalent to raw-CBOR input.
3. **Given** duplicate ordinary or reference inputs, **when** context resolves,
   **then** every unique producer transaction is fetched once and the evidence
   reports accurate requested/resolved/missing counts.
4. **Given** complete, partial, or unavailable provider data, **when** a
   context-sensitive operation runs, **then** the existing resolver preserves
   complete/partial/incomplete truth instead of inventing ledger facts.

### User Story 2 — Strictly offline default (Priority: P1)

Existing callers and operators who supply only CBOR or a transaction file get
the current byte-for-byte request shape, result shape, and failure behavior.

**Independent Test**: Run every scoped operation with provider options absent
under a network-denial guard and deep-compare its result to the baseline local
operation result.

**Acceptance Scenarios**:

1. **Given** local input without provider options, **when** any scoped operation
   runs, **then** CSK makes zero network requests.
2. **Given** provider without network, network without provider, a credential
   without a provider selection, or multiple transaction sources, **when** the
   call is parsed, **then** it fails as typed input/usage before engine or HTTP
   execution.
3. **Given** provider options absent, **when** the operation completes, **then**
   existing output is unchanged; no empty provider context is added.

### User Story 3 — Credential-safe CLI and cross-host parity (Priority: P1)

The CLI obtains Blockfrost project ids only from the portable age vault, keeps
Koios anonymous or optionally vault-authenticated according to existing policy,
and delegates to the same Node/shared-provider path used by the public API and
already used by the WebUI.

**Independent Test**: Exercise the installed CLI from a foreign directory with
raw/file inputs, vault-selected Blockfrost and Koios credentials, anonymous
Koios, provider failures, and secret sentinels; compare normalized context
evidence with Node and the existing WebUI resolver contract.

**Acceptance Scenarios**:

1. **Given** Blockfrost enrichment, **when** the CLI runs, **then** its credential
   is selected from a `blockfrost-project-id` vault entry and never argv/env.
2. **Given** Koios enrichment, **when** the CLI runs, **then** it may remain
   anonymous or select a `koios-bearer-token` vault entry.
3. **Given** provider authentication, rate-limit, server, transport, or decode
   failure, **when** the operation returns evidence or a typed error, **then**
   credential sentinels are absent from output, diagnostics, argv, environment,
   and temporary files.
4. **Given** identical local bytes and provider responses, **when** CLI, Node,
   and WebUI resolve context, **then** their normalized complete/partial/
   incomplete evidence is equivalent and names the selected shared provider.

## Functional requirements

- **FR-001**: The scoped CLI commands MUST accept exactly one local
  `--cbor-hex` or `--tx-file` source together with an explicit, paired
  `--provider` and `--network` selection.
- **FR-002**: Node transaction input MUST represent local raw/TextEnvelope bytes
  with an optional but all-or-nothing provider context selection.
- **FR-003**: Provider selection absent MUST preserve the existing offline path,
  make zero network requests, and retain the current output shape.
- **FR-004**: Provider selection present MUST inspect the supplied bytes, resolve
  each unique ordinary/reference-input producer plus validation context through
  `Cardano.Provider`, and pass that context to the requested ledger operation.
- **FR-005**: The resolver MUST preserve the supplied transaction bytes and MUST
  NOT fetch a replacement source transaction for local input.
- **FR-006**: CLI, Node API, and WebUI MUST consume the same
  `Cardano.Provider.resolveProducerTxContext` path and preserve equivalent
  resolution evidence.
- **FR-007**: Complete, partial, and incomplete evidence and
  `valid | invalid | incomplete | rejected` semantics MUST remain distinct.
- **FR-008**: CLI Blockfrost credentials MUST come only from the portable vault;
  Koios MUST retain its authenticated/anonymous policy.
- **FR-009**: Provider failures MUST retain the existing typed taxonomy and MUST
  redact credentials from every observable channel.
- **FR-010**: The change MUST NOT add a provider client, CLI-specific endpoint or
  decoder, host-side CBOR decoding, or ledger-validation semantic fallback.
- **FR-011**: Existing tx-hash provider input MUST remain compatible.
- **FR-012**: Fresh remote GitHub Actions on the final pushed SHA MUST be green
  before completion is declared.

## Success criteria

- **SC-001**: All six scoped operations accept raw/file local input plus every
  supported provider/network pair through Node and CLI tests.
- **SC-002**: Offline network-denial tests observe zero requests and deep-equal
  existing local results when provider options are absent.
- **SC-003**: Enrichment tests observe one request per unique producer plus the
  provider's validation-context requests and no source-transaction replacement.
- **SC-004**: Complete, partial, and incomplete resolution fixtures retain exact
  counts, missing ids, typed errors, slot, network, and protocol parameters.
- **SC-005**: Synthetic provider/vault secrets are absent from structured output,
  stderr, argv, environment, and temporary files.
- **SC-006**: The packed CLI and Node API pass from a foreign current working
  directory; the existing WebUI provider journey remains green.
- **SC-007**: Final local gate, named Koios live-boundary follow-up, and fresh
  remote CI all pass on the release-candidate history.

## Assumptions and dependencies

- #10's shared `Cardano.Provider` and #72's transaction operations are merged in
  `main`; this ticket composes them and changes neither contract's semantics.
- The WebUI already resolves locally supplied transaction bytes through the
  shared provider wrapper; no WebUI production edit is expected unless parity
  proof exposes a real divergence.
- Koios anonymous access may be used for the named operator smoke, while
  deterministic automated tests intercept the same shared HTTP boundary.
- This ticket is epic-critical: it directly unblocks #99, whose completed
  ledger preflight is required by final release gate #73.

## Out of scope

- Automatic provider access without explicit provider options.
- N2C, mempool, chain sync, live spent-status checks, or new providers.
- Transaction submission or witness attachment enrichment.
- Host-side CBOR/ledger/crypto/RDF logic, provider duplication, engine-pin
  changes, vault schema changes, or altered ledger-validation semantics.
- `lib/src/Cardano/Transaction/Book.js` and `docs/book-interchange.md`, owned by
  concurrent child csk-101.
