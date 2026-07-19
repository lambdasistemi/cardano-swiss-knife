# Feature Specification: Shared capability and backend IO core

**Feature Branch**: `feat/10-shared-capability-core`
**Created**: 2026-07-19
**Status**: Draft
**Input**: Issue #10 and parent epic #74

## P1 user story

As a Cardano Swiss Knife maintainer, I implement or change a backend operation
once and observe every host use the same provider selection, request, decoding,
network, and failure behavior.

## User scenarios and testing

### User Story 1 — One provider contract (Priority: P1)

A host requests transaction CBOR or current validation context through one
shared provider capability, regardless of whether the selected backend is
Blockfrost or Koios.

**Independent Test**: A hermetic contract suite supplies successful and failing
provider responses and verifies the selected endpoint, authentication, decoded
value, network mapping, and typed outcome without loading a browser page.

**Acceptance Scenarios**:

1. **Given** each supported network and provider, **when** transaction CBOR is
   requested, **then** exactly the selected provider endpoint and authentication
   convention are used and valid CBOR is returned.
2. **Given** each provider, **when** validation context is requested, **then**
   current slot, epoch, protocol parameters, source, and ledger network are
   decoded into the existing engine-facing context shape.
3. **Given** authentication, rate-limit, server, transport, or malformed-response
   failures, **when** either operation runs, **then** it returns the matching
   typed failure and never consults the other provider.

### User Story 2 — WebUI parity through the shared core (Priority: P1)

An existing WebUI user fetches and inspects transactions exactly as before,
while the page delegates all provider HTTP behavior to the shared capability.

**Independent Test**: Existing provider browser journeys run unchanged after
the WebUI-owned request implementations are removed.

**Acceptance Scenarios**:

1. **Given** the current Transactions page and provider settings, **when** a
   transaction hash is loaded, **then** the same CBOR, context, diagnostics, and
   visible error wording are produced without provider HTTP in page/component
   code.
2. **Given** Blockfrost is selected without credentials, **when** inspection
   runs, **then** no Koios request is made and validation remains explicitly
   incomplete.

### User Story 3 — Enforced host/engine boundary (Priority: P2)

A contributor can identify which host, provider, and engine owns each
responsibility and is stopped by the repository gate when provider HTTP is
duplicated or engine-owned semantics/fallback dependencies are introduced.

**Independent Test**: The architecture-boundary check passes on the documented
layout and fails against representative duplicate-provider and forbidden
host-semantic dependency inputs.

**Acceptance Scenarios**:

1. **Given** the architecture documentation, **when** a contributor traces an
   operation, **then** the host/engine responsibility, artifact provenance,
   failure behavior, and extension procedure are explicit.
2. **Given** a provider endpoint implementation outside the shared core or a
   host dependency that substitutes for an authoritative engine, **when** the
   gate runs, **then** it fails with a targeted diagnostic.

### Edge cases

- Blockfrost credentials are mandatory; Koios bearer authentication remains
  optional and omitted cleanly when blank.
- `401`/`403`, `429`, `5xx`, transport rejection, invalid JSON, empty arrays,
  and missing required fields remain distinguishable outcomes.
- Preprod and preview map to the ledger's `testnet` context while retaining
  different provider endpoints.
- One failing context sub-request fails the context operation explicitly; it
  does not synthesize partial success or switch providers.
- Engine load/protocol failures remain failures; no JavaScript or PureScript
  semantic fallback is introduced.

## Functional requirements

- **FR-001**: A host-neutral shared capability MUST own the `Provider` and
  `Network` types, provider names, credential requirements, endpoint selection,
  authentication, request construction, response decoding, ledger-network
  mapping, and provider failure classification.
- **FR-002**: Shared operations MUST cover transaction CBOR and validation
  context for Blockfrost and Koios.
- **FR-003**: Provider failures MUST be represented by typed authentication,
  rate-limit, server, transport, and decode outcomes with useful diagnostics.
- **FR-004**: Contract tests MUST cover both successful operations and every
  required failure category for both providers.
- **FR-005**: The WebUI MUST consume the shared capability without a visible
  behavior change and MUST contain no second endpoint/auth/request/decode
  implementation.
- **FR-006**: The shared layer MUST have no DOM, browser-storage,
  Node-filesystem, CLI-parser, transaction-entry/store, persistence, witness,
  completeness, or provider-submission dependency.
- **FR-007**: Provider choice MUST be fail-closed: an operation MUST NOT switch
  to the other provider after any missing credential or request failure.
- **FR-008**: A repository check MUST reject provider endpoint duplication and
  host dependencies that implement engine-owned Cardano, CBOR, RDF, SPARQL, or
  SHACL semantics or silent fallbacks.
- **FR-009**: Architecture documentation MUST include a host/engine
  responsibility table, artifact provenance and pinning, failure behavior, and
  the procedure for extending provider operations.
- **FR-010**: Existing WebUI provider journeys and the canonical repository CI
  command MUST remain green.
- **FR-011**: `docs/inspector/src/Main.purs` and the decoded-tree labeling
  Playwright surface MUST remain untouched by this ticket.

## Key entities

- **Provider**: Blockfrost or Koios, including display name and credential
  policy.
- **Network**: Mainnet, preprod, or preview, including provider endpoint and
  ledger-network mapping.
- **Provider operation**: Transaction-CBOR fetch or validation-context fetch.
- **Provider failure**: Typed category plus provider, operation, status when
  available, and safe diagnostic text.
- **Validation context**: Network, slot, epoch, protocol parameters, and source
  consumed by the existing ledger-engine envelope.

## Success criteria

- **SC-001**: One and only one source location contains Blockfrost and Koios API
  endpoint/auth/request behavior after the change.
- **SC-002**: The contract suite proves 2 successful operation families and 5
  required failure categories for each of 2 providers.
- **SC-003**: All existing WebUI provider journeys pass without changed visible
  interaction or fallback behavior.
- **SC-004**: The boundary gate rejects representative duplicate-provider and
  host-semantic dependency violations with non-zero exit status.
- **SC-005**: The shared provider source has zero imports or dependencies on DOM,
  browser storage, Node filesystem, CLI parsing, or post-#10 transaction domain
  concerns.
- **SC-006**: `nix develop --quiet -c just ci` and `./gate.sh` exit 0 at final
  HEAD.

## Assumptions and dependencies

- Browser and Node 22+ hosts both provide the standard `fetch` boundary used by
  the shared IO adapter.
- The current WebUI call shape and user-facing diagnostics are compatibility
  contracts for this extraction.
- `cardano-addresses`, `cardano-ledger-inspector`, and RDF-shapes artifacts stay
  authoritative and version-pinned through existing Nix inputs/builds.
- #75/#76/#77 own transaction-entry/store, persistence, completeness, witness,
  and submission work after this foundation.

## Out of scope

- CLI commands or Node package surfaces.
- New providers or provider submission.
- TxEntry/store coordination, persistence, witness collection/completeness.
- Vault encryption or credential UX changes.
- Any Cardano/ledger/CBOR/RDF/SPARQL/SHACL semantic implementation in the host.
- `Main.purs` UI rendering and decoded-tree labeling behavior.
