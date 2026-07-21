# Feature Specification: Node API Property Tests as Executable Documentation

**Feature Branch**: `feat/92-node-api-property-tests`

**Created**: 2026-07-21

**Status**: Draft

**Input**: Issue #92 and parent epic #74

## P1 user story

As a Node.js integrator, I can read and run a property-based test suite that
states the valid input shapes, invariants, result-envelope behavior, and exact
failure taxonomy for every public export of
`@lambdasistemi/cardano-swiss-knife` against the packaged pinned engines.

## User scenarios and testing

### User Story 1 — Offline address, key, payload, and script contracts (Priority: P1)

The suite describes every backend-independent public operation using generated
inputs or committed engine vectors and verifies stable result envelopes through
the real packaged address/signing WASI artifact.

**Independent Test**: Install the Nix-built npm tarball into a foreign temporary
project and run the offline section of `node/test/api-properties.test.mjs`
through Node 22.

**Acceptance Scenarios**:

1. **Given** supported mnemonic lengths and generated mnemonics, **when**
   generation and validation run, **then** word counts and validity compose.
2. **Given** committed key/address vectors and generated legal derivation
   indices, **when** key derivation and address construction run repeatedly,
   **then** results are deterministic and preserve the selected network/style.
3. **Given** arbitrary text and even-length hexadecimal payloads, **when** a
   payload is signed and verified, **then** the original payload verifies while
   a changed signature remains a successful `false`, not an exception.
4. **Given** valid native-script vector forms and malformed generated values,
   **when** each analyzer runs, **then** equivalent inputs agree and failures
   retain the documented domain taxonomy.
5. **Given** a missing, corrupt, exiting, or protocol-incompatible engine,
   **when** an engine-backed operation runs, **then** the result has only the
   corresponding typed error and never a host-computed fallback value.

### User Story 2 — Transaction source, provider, and book contracts (Priority: P1)

The suite describes transaction inspection, browsing, identification, and
intent over raw CBOR, TextEnvelope, provider-hash sources, and optional books.

**Independent Test**: Run generated representation/provider/book variations
against the committed Conway transaction and packaged ledger/RDF engines,
stubbing only the external provider HTTP boundary.

**Acceptance Scenarios**:

1. **Given** the same transaction as raw CBOR or `Tx ConwayEra`, **when** each
   offline transaction operation runs, **then** its engine-owned payload is
   representation-independent and no network request occurs.
2. **Given** every supported provider/network pair, **when** a hash source is
   inspected, **then** only the shared #10 provider transport is called and the
   selected endpoint, credential handling, and redacted error category hold.
3. **Given** malformed or multiply-selected sources, **when** any transaction
   operation runs, **then** it returns `DOMAIN_ERROR` without an engine result.
4. **Given** ordered supported book forms, **when** a transaction is resolved,
   **then** caller order, duplicates, and exact RDF resolutions are preserved.
5. **Given** missing/incompatible/exiting/malformed packaged ledger or RDF
   engines, **when** the applicable export runs, **then** the exact engine or
   RDF protocol error is returned with no fallback semantics.

### User Story 3 — Witness and ledger truth contracts (Priority: P1)

The suite describes detached witness preparation/normalization/attachment,
witness planning, Conway validation, and per-redeemer evaluation without
reimplementing ledger, CBOR, cryptography, or Plutus behavior in JavaScript.

**Independent Test**: Generate safe variations around the committed witness and
ledger fixtures, invoke the real packaged engines, and compare body identity,
witness transitions, validation verdicts, and redeemer outcomes.

**Acceptance Scenarios**:

1. **Given** a valid body hash and signing key, **when** a witness is prepared
   and normalized through raw CBOR and TextEnvelope forms, **then** the bytes
   round-trip and no secret enters results or diagnostics.
2. **Given** missing, existing, or unrelated signer states, **when** attachment
   runs, **then** insertion/replacement/refusal follows the existing safety
   contract and preserves body identity plus non-target witness content.
3. **Given** raw/TextEnvelope representations and generated option variations,
   **when** witness planning runs, **then** body identity and signer-set
   invariants are stable.
4. **Given** fixture contexts spanning ledger truth states, **when** validation
   runs, **then** exactly `valid | invalid | incomplete | rejected` is preserved.
5. **Given** script success, failure, incomplete, or not-applicable cases,
   **when** evaluation runs, **then** per-redeemer purpose, index, status,
   execution units, typed failures, and missing context remain intact.
6. **Given** engine failure or malformed protocol output, **when** any
   engine-backed witness/ledger export runs, **then** it fails explicitly and
   never manufactures a ledger result.

## Functional requirements

- **FR-001**: The repository MUST pin `fast-check` as a development dependency
  and commit the resulting lockfile update.
- **FR-002**: The property suite MUST cover all 25 current package exports:
  `CskError`; the 14 offline address/mnemonic/key/payload/script operations;
  `inspectTransaction`, `browseTransaction`, `identifyTransaction`, and
  `transactionIntent`; and the six witness/ledger operations.
- **FR-003**: Each property or adjacent contract table/comment MUST state valid
  inputs, the invariant under test, and exact success/error taxonomy.
- **FR-004**: Valid properties MUST execute through the Nix-built installed
  package and real pinned WASI/WASM engines, not source-only mocks.
- **FR-005**: Provider HTTP MAY be replaced at the external `fetch` boundary;
  provider mapping, decoding, context construction, and errors MUST remain the
  shared #10 implementation.
- **FR-006**: No JavaScript ledger, cryptographic, CBOR, RDF, SPARQL, SHACL, or
  Plutus fallback or reference implementation may be added.
- **FR-007**: Every engine-crossing export MUST cover applicable missing,
  incompatible/execution, and malformed-protocol failure categories; pure
  input validation MUST prove it fails before invoking an engine.
- **FR-008**: Transaction properties MUST cover raw CBOR, TextEnvelope,
  provider sources, incomplete context, malformed/ambiguous sources, provider
  failures, and ordered book resolution.
- **FR-009**: Ledger properties MUST preserve all four validation verdicts and
  per-redeemer evaluation details rather than reduce results to truthiness.
- **FR-010**: Witness properties MUST cover raw/TextEnvelope normalization,
  preparation, insertion, replacement refusal/authorization, unrelated signer,
  body identity, non-target content, and secret-free diagnostics.
- **FR-011**: The existing example tests MUST remain; properties supplement
  them and run as part of `checks.<system>.node-api` / `ci-node-api`.
- **FR-012**: A short root README section MUST point package consumers to
  `node/test/api-properties.test.mjs` as the canonical executable API contract.
- **FR-013**: Changes to `node/src/index.js` or other csk-93-owned source files
  require a parent Q-file before work begins.
- **FR-014**: The PR body MUST explicitly state that provider submission from
  #77 is absent from the starting public surface and needs follow-up coverage.

## Success criteria

- **SC-001**: A static export inventory test proves the property contract names
  exactly every current public package export, with no silent omission.
- **SC-002**: The canonical property file passes through the installed
  Nix-built package from a foreign current working directory on Node 22.
- **SC-003**: Shrunk counterexamples report reproducible fast-check seed/path
  information and never leak credentials or signing keys.
- **SC-004**: Architecture-boundary checks remain green and the diff contains
  no new host-side semantic implementation.
- **SC-005**: `./gate.sh` and fresh GitHub Actions are green on the final pushed
  SHA before the PR is marked ready.

## Assumptions and dependencies

- #71 (PR #89) and #72 (PR #91) are merged into `main` and define the public
  transaction/witness/ledger surface tested here.
- The committed example fixtures are authoritative seeds; fast-check varies
  legal representations, indices, payloads, contexts, options, and malformed
  inputs around them rather than synthesizing ledger semantics.
- #77 provider submission is not merged and therefore is not a current export.

## Out of scope

- CLI or WebUI-specific property suites.
- New public Node operations, API behavior changes, or source documentation
  owned by csk-93.
- Provider submission before #77 lands.
- New engine fixtures that encode host-side expectations independently of the
  pinned engines.
