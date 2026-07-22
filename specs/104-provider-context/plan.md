# Implementation Plan: Explicit Provider Context for Local Transactions

**Branch**: `feat/104-provider-context` | **Date**: 2026-07-22 | **Spec**: [spec.md](spec.md)

## Summary

Generalize the existing Node transaction-source parser so a local CBOR or
TextEnvelope source can carry an explicit provider/network context selection,
then make the current transaction-operation path invoke the already-shared
`Cardano.Provider.resolveProducerTxContext` for that selection. Extend the CLI
parser and portable-vault credential intake to construct the same public input.
The WebUI already calls the same shared resolver and remains the parity peer.

## Technical context

**Language/Version**: PureScript 0.15.16 and ESM on Node 22+

**Primary dependencies**: `Cardano.Provider`, `Cardano.Transaction.Ledger`,
the packaged ledger-inspector WASI artifact, portable age vault host adapter

**Testing**: Node built-in tests, fast-check properties, installed CLI/package
smoke, existing WebUI Playwright provider journey, `./gate.sh`, fresh GitHub CI

**Constraints**: no new endpoint/decoder; no host CBOR/ledger fallback; offline
shape unchanged; Blockfrost CLI secret only from vault; no csk-101 files

## Current state and seam

- `node/src/index.js::transactionInput` currently treats any provider/network/
  credential field as a hash source, so local bytes plus provider are rejected.
- `transactionOperation` resolves provider context only when `txHash` is the
  source and the operation is context-sensitive; local operations go directly
  to the engine even when context was explicitly requested.
- `Cardano.Provider.resolveProducerTxContext` already inspects unique ordinary
  and reference-input ids, fetches producer CBOR and validation context through
  the selected shared client, and records partial/incomplete evidence.
- `cli/csk.mjs` currently requires provider/network iff `--tx-hash` is present
  and forbids vault options for local sources.
- The WebUI's `Provider` wrapper already delegates local-byte context resolution
  to the same shared `Cardano.Provider` function.

## Shared public contract

Transaction representation remains exactly one of raw CBOR, transaction
TextEnvelope, or provider-loaded tx hash. A separate optional context selection
is valid for local representations and consists of paired `provider` and
`network` plus an optional credential. Hash input continues to require that
same selection because it is needed both to load the source and resolve context.

The Node path decodes the local transaction exactly once through the existing
transaction engine boundary, runs `tx.inspect` on those bytes, and passes its
inspection JSON to `Cardano.Provider.resolveProducerTxContext`. It merges only
the returned operation arguments into the requested ledger call and surfaces
the resolver's context evidence. With no context selection it follows the
existing branch exactly and does not add a `context` field.

The CLI constructs that public input after validating an all-or-nothing
provider/network pair. Blockfrost requires a matching portable-vault entry;
Koios stays anonymous unless a matching vault entry is explicitly selected.
Provider credentials remain in memory and outside argv/environment/output.

## Slice plan

### Slice 1 — Local context selection in the shared Node path

Write RED examples/properties for raw and TextEnvelope local sources with all
provider/network pairs, unchanged offline results under network denial,
all-or-nothing selection errors, exact unique producer/context requests,
complete/partial/incomplete evidence, source-byte preservation, hash-source
compatibility, typed provider failures, and credential redaction. Generalize
the Node input parser/context decision without introducing a provider client,
and expose the local-context shape in TypeScript declarations.

**Owned files**:

- `node/src/index.js`
- `node/src/index.d.ts`
- `node/test/transaction-provider.test.mjs`
- `node/test/api-properties.test.mjs`

**Focused proof**: `nix run .#ci-node-api`

**Commit**: `feat(node): enrich local transactions through providers`

### Slice 2 — CLI vault wiring and installed cross-host proof

Write RED CLI/package tests for every scoped command using `--cbor-hex` and
`--tx-file` with provider/network, invalid option combinations, Blockfrost
vault-only credentials, Koios anonymous/optional-vault policy, provider failures,
secret leakage, unchanged offline output, and foreign-CWD package execution.
Update the thin CLI parser to pass the same local-context input to Node and add
only proof/inventory changes needed to lock WebUI/Node/CLI resolver parity.

**Owned files**:

- `cli/csk.mjs`
- `node/test/cli.test.mjs`
- `node/test/package-smoke.mjs`
- `scripts/check-architecture-boundary.sh`

**Focused proof**: `nix run .#ci-node-api && nix run .#ci-node-package && nix run .#ci-inspector-playwright`

**Commit**: `feat(cli): enrich local transactions through providers`

## Orchestrator-owned finalization

Extend inherited `gate.sh` in a dedicated planning commit with issue-specific
inventory plus Node API/package and WebUI provider proofs. After both behavior
slices are navigator-approved, run the full gate and commit/task audit, update
PR #106, push, and require fresh remote CI on that SHA. Run the named operator
Koios smoke and record its transcript. Only after both proofs pass, stamp the
finalization tasks while dropping `gate.sh`, mark the PR ready, and do not merge.

**Owned files**:

- `gate.sh`
- `specs/104-provider-context/tasks.md`
- PR #106 metadata

## Dependency and ordering constraints

1. Slice 1 establishes the public input/context contract before the CLI consumes
   it.
2. Slice 2 proves the portable-vault boundary and installed host behavior over
   Slice 1 without duplicating the provider path.
3. csk-101 owns `lib/src/Cardano/Transaction/Book.js` and
   `docs/book-interchange.md`; needing either is a parent Q-file blocker.
4. Every behavior slice is RED then GREEN, navigator-approved, one bisect-safe
   commit, and never pushed by a slice worker.
5. #99 remains blocked until this PR is ready with local gate, live smoke, and
   fresh remote CI evidence.

## Plan review: live-boundary smoke question

**What system boundary can the unit suite miss?** Intercepted `fetch` tests can
prove endpoint/request selection but cannot prove that the packaged CLI, real
Koios service, committed transaction fixture, and current response decoder work
together. Before mark-ready, the ticket owner runs the packaged CLI against
Koios using the committed mainnet local transaction fixture and records a
redacted transcript showing selected provider, validation-context source,
requested/resolved producer counts, and a truthful verdict. This credential-free
operator follow-up stays outside `gate.sh` because live API availability is not
a deterministic CI dependency; owner: csk-104 ticket-orchestrator.

Fresh GitHub CI separately proves that all committed assets exist in a clean
remote checkout, addressing the epic's #71 fixture-path regression.

## Risks and mitigations

- **Offline regression**: preserve the old no-selection branch and deep-compare
  outputs under an outbound-network denial guard.
- **Source replacement**: assert no source transaction endpoint is called and
  compare engine-owned body identity for offline/enriched local inputs.
- **Truth collapse**: assert exact context counts/errors and ledger verdicts for
  complete, partial, and incomplete cases.
- **Provider duplication**: keep endpoints/decoding in `Cardano.Provider` and
  extend the architecture inventory against CLI/Node-local provider logic.
- **Credential leakage**: inspect argv, environment, stdout/stderr, structured
  results, and temp files using unique sentinel secrets.
- **Scope collision**: forbid csk-101 book files and escalate through Q-files.
- **Fresh-checkout gap**: require final remote CI on the pushed release SHA.
