# Feature Specification: Offline CLI and Node API

**Feature Branch**: `feat/70-offline-cli-node-api`

**Created**: 2026-07-20

**Status**: Draft

**Input**: Issue #70 and parent epic #74

## P1 user story

As an offline Cardano operator, I invoke `csk` for every current
backend-independent address, mnemonic, key, script, and payload capability and
observe the same successful values, validation failures, and cryptographic
results as the WebUI, without network access.

## User scenarios and testing

### User Story 1 — One operation model in three hosts (Priority: P1)

The WebUI, CLI, and importable Node package expose the checked child-baseline
inventory through the same PureScript capability modules and the pinned
`cardano-addresses` WASI engine.

**Independent Test**: The committed Haskell-derived vectors are executed through
the shared PureScript services and the packaged ESM API, while existing WebUI
journeys remain green.

**Acceptance Scenarios**:

1. **Given** a valid vector for any inventory operation, **when** it is evaluated
   by the WebUI service, Node API, or CLI, **then** every host returns the same
   normalized value.
2. **Given** invalid input or an invalid signature, **when** the same operation
   is evaluated in each host, **then** the typed outcome and diagnostic category
   agree without weakening validation.
3. **Given** an unavailable or incompatible address engine, **when** an
   engine-owned operation runs, **then** it fails explicitly and never executes
   substitute JavaScript semantics.

### User Story 2 — Stable offline operator commands (Priority: P1)

An operator can reach the inventory through `csk address`, `csk mnemonic`,
`csk key`, `csk script`, and `csk payload`, choosing concise human output or a
stable JSON envelope and supplying secrets without argv or environment values.

**Independent Test**: Command-level tests exercise every family, invalid usage,
typed domain failures, stdin/descriptor input, JSON output, human output, and
exit codes with outbound networking denied.

**Acceptance Scenarios**:

1. **Given** a public input, **when** a command succeeds, **then** human output is
   concise, JSON output is machine-stable, and exit status is zero.
2. **Given** malformed arguments, invalid domain input, an unavailable secret
   source, or an engine failure, **when** a command fails, **then** each category
   has a deterministic non-zero exit code and a stable JSON error code.
3. **Given** a mnemonic or private key, **when** a secret-taking command runs,
   **then** the secret is read from the #69 vault surface, stdin, or an inherited
   descriptor and never from argv or environment variables.

### User Story 3 — Portable importable package (Priority: P1)

A Node 22+ program imports `@lambdasistemi/cardano-swiss-knife` outside the
source checkout and calls the same operations without native addons or manual
WASM path configuration.

**Independent Test**: `npm pack` is installed into a temporary project, imported
from a different working directory, and exercised against representative
vectors on Linux, macOS, and Windows.

**Acceptance Scenarios**:

1. **Given** an installed package, **when** an engine-owned API is called from a
   foreign current working directory, **then** the packaged WASM asset is found
   relative to the ESM module.
2. **Given** the packed artifact and lockfile, **when** they are inspected, **then**
   no native Node addon or install-time native build is present.
3. **Given** outbound networking is denied, **when** representative API and CLI
   operations run, **then** they succeed without attempting network access.

### Edge cases

- Mnemonic word counts are restricted to 12, 15, 18, 21, or 24 and invalid
  checksum/word-list input remains distinguishable from parser errors.
- Shelley custom network tags are restricted to 0–15; legacy custom protocol
  magic is a non-negative integer.
- Key derivation keeps account, role, and address indexes explicit and does not
  silently change wallet family semantics.
- Text payloads are UTF-8; hex payloads require normalized even-length hex.
- Invalid signatures are a typed valid-domain result, not an engine crash.
- Script required-validation errors and recommended warnings remain distinct.
- Empty stdin, closed descriptors, malformed vault entries, missing WASM,
  incompatible WASM, abnormal WASI exit, and malformed engine output fail hard.
- Human diagnostics never echo mnemonic or private-key material.

## Functional requirements

- **FR-001**: `capability-inventory.md` MUST name every in-scope
  backend-independent WebUI operation at commit `4061f083` and explicitly
  classify host-only, provider-backed, vault-owned, and later-epic exclusions.
- **FR-002**: Shared PureScript service modules MUST provide the address,
  mnemonic, key, script, and payload operation families consumed by all hosts.
- **FR-003**: The WebUI MUST consume those shared services without visible
  behavior change.
- **FR-004**: The ESM package MUST export every inventory operation under stable
  programmatic names with typed success/failure results.
- **FR-005**: CLI commands MUST expose every inventory operation under exactly
  `csk address`, `mnemonic`, `key`, `script`, or `payload`.
- **FR-006**: CLI JSON output MUST use a versioned envelope; human output and
  exit-code mappings MUST be deterministic and documented in tests.
- **FR-007**: Secret-taking commands MUST accept only the #69 portable vault,
  stdin, or inherited descriptor contract; secrets MUST NOT use argv or
  environment variables and MUST remain in memory.
- **FR-008**: Node-side WASM discovery MUST be package-relative and independent
  of the process current working directory.
- **FR-009**: Engine load, instantiation, protocol, exit, and decode failures
  MUST be typed hard failures with no semantic fallback.
- **FR-010**: Cross-host vectors MUST prove identical successes and typed
  failures through PureScript, ESM, and CLI surfaces.
- **FR-011**: A network-denial smoke MUST exercise representative operations and
  fail if the host attempts outbound network access.
- **FR-012**: Node 22+ package smokes MUST run on representative Linux, macOS,
  and Windows GitHub-hosted runners.
- **FR-013**: The package MUST contain no native addon, `node-gyp`, lifecycle
  native build, or platform-specific binary dependency.
- **FR-014**: #69 retains ownership of vault schema/crypto/adapters and the CLI
  bootstrap/root/parser; final CLI wiring MUST wait for the
  `vault-cli-bootstrap-ready` release answer.
- **FR-015**: Provider-backed transaction loading, transaction witness work,
  provider submission, RDF/library behavior, and new backlog capabilities MUST
  remain outside this ticket.

## Success criteria

- **SC-001**: Every row in the checked inventory maps to one shared PureScript
  function, one ESM export, and one CLI command.
- **SC-002**: The Haskell-derived vector set produces byte-for-byte identical
  normalized values across all three hosts, including representative failures.
- **SC-003**: Representative CLI/API commands complete with networking denied
  and no attempted network access.
- **SC-004**: An `npm pack` install from a foreign directory finds its WASM asset
  and completes address inspection, key derivation, signing, and verification.
- **SC-005**: Linux, macOS, and Windows Node 22+ smokes are green.
- **SC-006**: Package inspection reports zero native addons and zero native
  install/build hooks.
- **SC-007**: `./gate.sh` exits 0 at final implementation HEAD.

## Assumptions and dependencies

- #10's shared capability core is merged at the child baseline.
- #69 will publish the CLI root/parser and secret-input contract before the CLI
  integration slice; service and ESM slices are independent of that signal.
- The pinned `cardano-addresses` flake artifact remains the authoritative engine
  for address semantics and cryptography.
- Artifact publication/version alignment belongs to #73; this ticket produces a
  packable/testable package surface but does not publish it.

## Out of scope

- Provider-backed transaction loading, N2C, chain sync, mempool, or submission.
- Transaction witness planning/attachment or ledger/script execution owned by
  later epic children.
- Vault schema, age encryption, migrations, browser adapters, CLI root/parser,
  or secret persistence owned by #69.
- Library/RDF book CRUD, clipboard/reveal UI, navigation/theme, browser storage,
  or other host-presentation behavior.
- New cryptographic, Cardano, ledger, CBOR, RDF, SPARQL, or SHACL semantics in
  PureScript or JavaScript.
