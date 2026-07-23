# Feature Specification: Withdrawal Account State Resolution

**Feature Branch**: `fix/113-withdrawal-account-state`

**Created**: 2026-07-23

**Status**: Draft

**Input**: Issue #113 and parent epic #74; builds on issue #104's shared
provider-context path

## P1 user story

As a Cardano operator, I validate a transaction containing key or script reward
withdrawals through Blockfrost or Koios and receive a ledger verdict based on
the current registered reward-account state, rather than an incomplete result
caused by omitted certificate state.

## User scenarios and testing

### User Story 1 — Complete reward-account context (Priority: P1)

When a transaction contains withdrawals, CSK discovers each withdrawal account
from the transaction engine, asks only the explicitly selected provider for its
current registration and withdrawable balance, and supplies complete account
state to the validation engine.

**Independent Test**: Validate raw CBOR and an equivalent `Tx ConwayEra`
TextEnvelope containing key and script withdrawal credentials through
intercepted Blockfrost and Koios boundaries. Verify exact provider requests,
deduplication, complete account state, and the resulting engine verdict.

**Acceptance Scenarios**:

1. **Given** a registered key withdrawal account returned by Blockfrost,
   **when** validation runs, **then** the engine receives that credential and
   current withdrawable balance as certificate state.
2. **Given** a registered script withdrawal account returned by Koios,
   **when** validation runs, **then** the engine receives the script credential
   and current reward balance as certificate state.
3. **Given** repeated withdrawals for one reward account, **when** context is
   resolved, **then** the account is requested once and represented once.
4. **Given** equivalent raw-CBOR and TextEnvelope sources, **when** validation
   runs through the same provider, **then** their engine-owned verdict and
   account-resolution evidence are equivalent.

### User Story 2 — Truthful fail-closed validation (Priority: P1)

If any required withdrawal account cannot be proved registered with a valid
balance, CSK does not construct partial certificate state and does not turn the
absence into a valid or invalid ledger verdict.

**Independent Test**: Exercise missing, unregistered, malformed, unauthorized,
rate-limited, server, and transport responses for both providers. Verify
certificate state is wholly absent, the ledger result remains incomplete, and
stable typed diagnostics identify every unresolved account without exposing a
credential.

**Acceptance Scenarios**:

1. **Given** one of several accounts is absent or unregistered, **when**
   resolution completes, **then** no partial certificate state is supplied.
2. **Given** a provider returns malformed registration or balance data,
   **when** validation runs, **then** the result is incomplete with typed
   decode evidence rather than valid or invalid.
3. **Given** a provider request fails, **when** diagnostics are rendered,
   **then** provider/category/account evidence is retained while credentials
   remain redacted.
4. **Given** a registered account with a zero balance, **when** the provider
   reports the zero value validly, **then** zero is retained rather than treated
   as missing.

### User Story 3 — Strictly offline default (Priority: P1)

Operators who do not select a provider keep the existing offline behavior.

**Independent Test**: Run the same local transaction operations without a
provider selection under a network-denial guard and verify zero HTTP requests
and unchanged results.

**Acceptance Scenarios**:

1. **Given** no provider selection, **when** local validation runs, **then** no
   account, producer-transaction, or validation-context request is made.
2. **Given** a transaction with no withdrawals, **when** provider context is
   selected, **then** no account-state request is made.
3. **Given** a transaction with a script withdrawal fixture and complete
   provider responses, **when** the packaged `csk tx validate` command runs,
   **then** it completes validation with account-resolution evidence.

## Edge cases

- Withdrawal entries are malformed, omit their engine-provided reward-account
  bytes, or contain a credential kind other than key or script.
- A provider returns duplicate rows, a row for the wrong reward account,
  non-decimal/negative reward text, or contradictory registration fields.
- One of multiple account requests succeeds while another fails.
- A Blockfrost project id or optional Koios bearer token appears in a response
  body, transport error, or thrown exception.
- Provider-selected inspection succeeds but withdrawal discovery itself fails.

## Functional requirements

- **FR-001**: CSK MUST discover withdrawal credentials and exact reward-account
  bytes through the authoritative transaction engine, without host-side CBOR
  parsing.
- **FR-002**: CSK MUST support key and script withdrawal credentials on
  mainnet, preprod, and preview.
- **FR-003**: CSK MUST use the selected shared Blockfrost or Koios provider
  implementation for reward-account requests; no host adapter may duplicate
  endpoints, response decoding, or policy.
- **FR-004**: CSK MUST deduplicate reward accounts before provider requests.
- **FR-005**: CSK MUST accept only a provider row that identifies the requested
  account, proves it registered, and contains a non-negative decimal
  withdrawable balance.
- **FR-006**: CSK MUST construct certificate state only when every discovered
  withdrawal account has complete accepted state.
- **FR-007**: Complete certificate state MUST preserve each engine-provided
  credential kind/hash and the provider's balance exactly as decimal text.
- **FR-008**: Any missing, unregistered, malformed, or unavailable account MUST
  omit certificate state entirely and retain an incomplete engine verdict.
- **FR-009**: Resolution evidence MUST report requested, resolved, and missing
  accounts plus stable provider error codes/messages.
- **FR-010**: Provider credentials MUST be redacted from returned evidence,
  stdout, stderr, and exceptions.
- **FR-011**: Provider-selected validation MUST work for raw CBOR and
  transaction TextEnvelope inputs, including the committed script-withdrawal
  CLI fixture.
- **FR-012**: Operations without a provider selection MUST preserve existing
  output and make zero network requests.
- **FR-013**: Transactions without withdrawals MUST not trigger account-state
  requests or add empty certificate state.

## Success criteria

- **SC-001**: Automated coverage proves all 12 provider/network/credential-kind
  combinations (2 providers × 3 networks × key/script) use the correct account
  route and accepted response contract.
- **SC-002**: Complete key and script examples deliver certificate state for
  100% of discovered withdrawal accounts and complete validation.
- **SC-003**: Every tested missing, unregistered, malformed, or provider-failure
  case supplies zero partial certificate-state entries and remains incomplete.
- **SC-004**: Raw-CBOR and TextEnvelope validation produce equivalent normalized
  account evidence and verdicts.
- **SC-005**: Offline regression coverage observes zero HTTP requests.
- **SC-006**: Secret-sentinel coverage finds zero credential occurrences in all
  structured and textual outputs.

## Scope boundaries

This feature does not add vault management, transaction submission/mempool
behavior, or any host-side CBOR/ledger fallback. It does not change account
state after validation and does not make live provider availability a
deterministic CI dependency.

## Assumptions and dependencies

- The pinned transaction engine remains authoritative for structured
  withdrawals and for interpreting `cert_state`.
- Blockfrost's account representation uses registration plus withdrawable
  amount; Koios uses account status plus rewards available.
- Issue #104's provider selection and shared context resolver are the only
  provider-enabled local-transaction entry path.
