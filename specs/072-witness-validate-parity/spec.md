# Feature Specification: Witness and Ledger-Operation Parity

**Feature Branch**: `feat/72-witness-validate-parity`

**Created**: 2026-07-21

**Status**: Draft

**Input**: Issue #72 and parent epic #74

## P1 user story

As a Cardano operator or Node.js application, I plan and attach transaction
witnesses, validate Conway transactions, and evaluate phase-2 scripts while
observing the same context handling, cryptographic artifacts, safety policy,
and truthful results as the WebUI.

## User scenarios and testing

### User Story 1 — Shared read-only ledger operations (Priority: P1)

The WebUI, Node API, and `csk` invoke witness planning, Conway validation, and
per-redeemer script evaluation through one shared transaction capability over
the packaged `cardano-ledger-inspector` WASI artifact.

**Independent Test**: Run all three operations against the same transaction
and context fixtures through Node, the installed CLI, and the WebUI, then
compare the engine-owned result payloads and typed failures.

**Acceptance Scenarios**:

1. **Given** raw transaction CBOR or a `Tx ConwayEra` TextEnvelope, **when**
   witness planning runs, **then** each host returns the same body hash,
   required/present/missing signer sets, script/redeemer inventory, and context
   coverage from `tx.witness.plan`.
2. **Given** complete provider context, **when** validation runs, **then** the
   host preserves exactly one of `valid`, `invalid`, `incomplete`, or
   `rejected` and does not infer success from partial checks.
3. **Given** a transaction with phase-2 scripts, **when** evaluation runs,
   **then** each redeemer retains its purpose, index, status, budget,
   evaluated execution units or typed failure, and missing-context detail.
4. **Given** missing context, **when** validation or script evaluation runs,
   **then** missing facts are reported as incomplete/not-evaluated rather than
   invented defaults or ledger failures.
5. **Given** a missing, incompatible, crashing, or malformed engine, **when**
   any operation runs, **then** the host returns the existing typed engine
   failure and never substitutes host semantics.

### User Story 2 — Safe detached vkey witness attachment (Priority: P1)

An operator or Node application can attach a `TxWitness ConwayEra` artifact,
or can create one from an authorized in-memory signing key, while the ledger
engine remains the sole owner of transaction mutation.

**Independent Test**: Plan a fixture, create or load a detached witness,
attach it once, attempt it again without replacement authorization, then retry
with explicit replacement authorization and verify body identity and all
non-target witness content.

**Acceptance Scenarios**:

1. **Given** a missing required signer and a matching detached witness, **when**
   attachment runs, **then** the result reports `inserted`, returns signed
   transaction CBOR, and preserves the transaction body identity.
2. **Given** an existing witness for the same verification key, **when**
   attachment runs without explicit replacement authorization, **then** the
   shared capability refuses the overwrite and returns no patched artifact.
3. **Given** the same existing witness and explicit replacement authorization,
   **when** attachment runs, **then** the engine reports `replaced` without
   duplicating the witness or changing non-target witnesses/scripts/datums/
   redeemers.
4. **Given** a witness whose signer is neither missing nor already present in
   the current plan, **when** attachment is requested, **then** the shared
   safety policy rejects it as unrelated.
5. **Given** a detached witness as raw CBOR or a `TxWitness ConwayEra`
   TextEnvelope, **when** it is consumed or emitted, **then** the shared #67
   codec validates and preserves the artifact type and bytes.
6. **Given** a host-generated witness, **when** signing occurs, **then** the
   signing key comes from the portable vault or a host-owned secure in-memory
   descriptor, never argv or environment variables; key bytes do not enter
   structured results, output, diagnostics, or temporary files.

### User Story 3 — Thin Node and CLI surfaces (Priority: P1)

Node callers use stable result-envelope functions and operators use the named
`csk tx` commands without depending on the WebUI or learning engine request
details.

**Independent Test**: Install the packed artifact outside the checkout, run
every API and CLI operation from a foreign current working directory, and
verify exact source selection, vault/descriptor handling, output envelopes,
exit codes, and packaged engine discovery.

**Acceptance Scenarios**:

1. **Given** exactly one raw/file/hash transaction source, **when** a new Node
   function or CLI command runs, **then** it reuses the #71 transaction input
   path and the #10 provider/context path.
2. **Given** a provider-backed source, **when** a context-dependent operation
   runs, **then** only the selected shared Blockfrost/Koios transport supplies
   transaction and producer/context evidence.
3. **Given** a vault-selected signing key, **when** `csk tx witness attach`
   signs and attaches, **then** passphrases use the existing no-echo TTY or
   inherited-FD boundary and secret values are absent from argv/env/output.
4. **Given** domain, secret-source, provider, engine, context, witness, or
   TextEnvelope failure, **when** JSON output is selected, **then** the
   versioned result envelope and deterministic non-zero exit mapping preserve
   the category without leaking secret material.

### User Story 4 — WebUI parity without a second implementation (Priority: P1)

The WebUI keeps its witness and validation experience, adds per-redeemer script
evaluation, and calls the same shared capability used by Node and CLI.

**Independent Test**: Exercise the WebUI witness loop, all four validation
verdicts, script success/failure/incomplete cases, and engine failure while
asserting that browser modules contain no operation-specific semantic fallback.

**Acceptance Scenarios**:

1. **Given** an inspected transaction, **when** the WebUI renders witness,
   validation, or script evaluation results, **then** the displayed status and
   details are projections of the shared engine response.
2. **Given** an unlocked portable vault with a compatible signing entry, **when**
   attachment runs, **then** the WebUI uses the shared attachment safety policy
   and preserves its current in-memory secret lifecycle.
3. **Given** engine load/protocol failure, **when** the WebUI operation runs,
   **then** it fails explicitly and displays no fallback result.

## Functional requirements

- **FR-001**: One shared transaction capability under `lib/src/Cardano/` MUST
  expose witness planning, detached-witness preparation/attachment, Conway
  validation, and per-redeemer script evaluation.
- **FR-002**: WebUI, Node API, and CLI MUST be thin hosts over that capability;
  operation names, context decisions, witness overwrite policy, and stable
  result projection MUST NOT be independently reimplemented per host.
- **FR-003**: Every ledger operation MUST execute through the same flake-pinned
  `cardano-ledger-inspector` WASI artifact already packaged by #71.
- **FR-004**: Script evaluation MUST use the evaluator libraries embedded in
  that ledger artifact; no separate Plutus artifact or host evaluator may be
  added.
- **FR-005**: Validation MUST preserve the engine's `valid | invalid |
  incomplete | rejected` status without collapsing incomplete/rejected into a
  boolean.
- **FR-006**: Script evaluation MUST preserve per-redeemer purpose, index,
  status, declared and evaluated execution units, typed failure, and missing
  context.
- **FR-007**: Transaction hash loading and operation context MUST use the
  existing `Cardano.Provider` Blockfrost/Koios implementation and retain its
  stable typed failure categories.
- **FR-008**: Raw transaction and detached-witness inputs and outputs MUST use
  `Cardano.TextEnvelope`; transaction hosts MUST reject a witness envelope in a
  transaction slot and vice versa.
- **FR-009**: Attachment MUST call `tx.witness.attach`; the host MUST NOT patch
  transaction CBOR itself.
- **FR-010**: Attachment MUST report the engine's `inserted` or `replaced`
  action and MUST refuse replacement unless the caller explicitly authorizes
  it.
- **FR-011**: Attachment MUST reject a signer that is unrelated to the current
  plan and MUST retain body identity and non-target witness-set content.
- **FR-012**: Host-generated signatures MUST use the existing Haskell-derived
  address/signing WASI capability; no JavaScript cryptographic fallback may be
  introduced.
- **FR-013**: Signing keys MUST come from a compatible portable-vault entry or
  host-owned secure in-memory descriptor; CLI secret/passphrase material MUST
  not travel through argv or environment variables.
- **FR-014**: Node MUST export stable result-envelope functions for witness
  planning, witness attachment, validation, and script evaluation in addition
  to the #71 transaction APIs.
- **FR-015**: CLI MUST expose `csk tx witness plan|attach`, `csk tx validate`,
  and `csk tx evaluate-scripts` while preserving #69/#70/#71 commands.
- **FR-016**: CLI and Node failures MUST retain deterministic domain, secret,
  provider, engine, context, witness, and codec categories.
- **FR-017**: Cross-host fixtures MUST cover success, incomplete context,
  ledger invalidity, script failure, script success, witness insertion,
  replacement refusal/authorization, unrelated signer, and engine failure.
- **FR-018**: Packaged CLI, Node API, and WebUI proofs MUST run in `./gate.sh`.
- **FR-019**: No host-side Cardano ledger, validation, script evaluation,
  witness attachment, CBOR, or cryptographic fallback may be introduced.

## Success criteria

- **SC-001**: The three hosts return equal normalized engine-owned payloads for
  the same witness-plan, validation, and script-evaluation fixtures.
- **SC-002**: Fixture coverage observes every validation verdict and every
  required script result class with no false `valid`/`succeeded` outcomes.
- **SC-003**: Witness tests observe one insertion, one refused replacement, one
  authorized replacement, and one unrelated-signer rejection while body hash
  and non-target witness content remain unchanged.
- **SC-004**: Raw CBOR and both supported TextEnvelope artifact types round-trip
  through their permitted operation slots with zero type confusion.
- **SC-005**: Packaged API/CLI smokes pass from a foreign CWD and locate the
  exact pinned ledger artifact with no alternate evaluator artifact present.
- **SC-006**: Fixture signing keys/passphrases are absent from argv,
  environment, stdout, stderr, result JSON, and temporary files.
- **SC-007**: The final local gate and fresh remote GitHub Actions checks pass
  on the pushed final SHA.

## Assumptions and dependencies

- #67, #69, #70, and #71 are merged into the branch baseline.
- The currently pinned ledger-inspector revision already implements
  `tx.witness.plan`, `tx.witness.attach`, `tx.validate`, and
  `tx.evaluate.scripts`; this ticket consumes those contracts and does not
  change the engine repository.
- `tx.validate` and `tx.evaluate.scripts` receive explicit context; neither
  operation performs provider IO inside WASI.
- Node callers may attach an already-produced detached witness as a secure
  descriptor without supplying a signing key to CSK.

## Out of scope

- Transaction construction, balancing, submission, bootstrap witnesses, or
  script-witness creation.
- Hardware wallets, N2C, chain sync, mempool, indexing, or new providers.
- Changes in `cardano-ledger-inspector`, a new Plutus artifact, or any host-side
  replacement for Cardano ledger/crypto/CBOR semantics.
- Vault schema/encryption/migration changes and publication/versioning owned by
  sibling tickets.
