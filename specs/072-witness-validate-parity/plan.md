# Implementation Plan: Witness and Ledger-Operation Parity

**Branch**: `feat/72-witness-validate-parity` | **Date**: 2026-07-21 | **Spec**: [spec.md](spec.md)

## Summary

Extend #71's shared transaction boundary with four ledger capabilities, route
all context-sensitive operations through the existing provider resolver, move
the current WebUI witness policy into the shared library, expose Node and CLI
hosts, and add the missing WebUI script-evaluation surface. Every operation
uses the already-pinned ledger-inspector WASI artifact; hosts only acquire
context/secrets, invoke the shared service, and render typed results.

## Technical context

**Language/Version**: PureScript 0.15.16 and ESM on Node 22+/recent browsers

**Primary dependencies**: `Cardano.Transaction`, `Cardano.Provider`,
`Cardano.TextEnvelope`, `Cardano.Vault`, `Cardano.Address.Signing`,
`@bjorn3/browser_wasi_shim`, and the flake-pinned ledger-inspector WASI artifact

**Testing**: shared PureScript tests, Node built-in tests, committed Conway
fixtures, foreign-CWD installed-package smoke, WebUI Playwright, and `./gate.sh`

**Constraints**: thin hosts; explicit provider context; vault/descriptor-only
secrets; no engine-pin change; no host ledger/Plutus/CBOR/crypto fallback

## Current state and seams

- #67 already recognizes `Tx ConwayEra` and `TxWitness ConwayEra`, but #71's
  transaction decoder does not yet reject artifact-type mismatch at the call
  site.
- #71 packages one ledger-inspector WASI binary and exposes a generic Node
  runner, but its allowlist contains only inspect/browse/identify/intent/RDF.
- `Cardano.Provider` already owns transaction loading, producer resolution,
  validation context, provider/network mapping, and typed/redacted failures.
- The WebUI already invokes witness plan and validation directly and contains a
  local `TxSigning` module for signature preparation and attachment policy; it
  does not invoke or render `tx.evaluate.scripts`.
- The #71 CLI parser owns transaction source/provider/book arguments but knows
  only inspect/browse/identify/intent.
- The inherited gate already runs shared tests, Node API/package checks, and
  WebUI Playwright. Ticket-specific inventory checks can be appended without
  replacing any inherited function or command.

## Shared public contract

`Cardano.Transaction.Ledger` owns the operation names and context-bearing
request shapes for:

```text
planTransactionWitnesses(input, options?)
validateTransaction(input, options?)
evaluateTransactionScripts(input, options?)
attachTransactionWitness(input, witness, { replaceExisting? })
```

The host supplies an injected engine runner and, for hash sources, the existing
provider resolver. The shared result keeps the engine envelope intact and adds
only stable host metadata needed for source/context diagnostics.

The detached witness input is exactly one of raw CBOR text or a
`TxWitness ConwayEra` TextEnvelope. Transaction inputs continue to use the #71
shape and reject a witness envelope. Shared witness preparation returns a
detached witness record and encoded TextEnvelope but never includes the signing
key. Attachment plans before mutation and applies this safety table:

| Signer state | `replaceExisting` | Outcome |
| --- | --- | --- |
| missing required signer | either | attach; require engine action `inserted` |
| already present signer | false/absent | reject before returning patched CBOR |
| already present signer | true | attach; require engine action `replaced` |
| unrelated signer | either | reject |

Node exports the four functions through the existing `{ ok, value | error }`
envelope. An application may provide detached witness CBOR/TextEnvelope without
handing CSK a private key. CLI/WebUI witness preparation selects a compatible
portable-vault entry (or the WebUI's existing secure in-memory descriptor),
uses `Cardano.Address.Signing`, and clears host-owned secret state according to
the existing lifecycle.

The CLI surface is:

```text
csk tx witness plan <transaction-source> [provider options] [--output json]
csk tx witness attach <transaction-source>
  (--witness-file PATH | --vault PATH --vault-entry ID [--passphrase-fd FD])
  [--replace-existing] [--tx-out PATH] [--witness-out PATH] [--output json]
csk tx validate <transaction-source> [provider options] [--output json]
csk tx evaluate-scripts <transaction-source> [provider options] [--output json]
```

`<transaction-source>` is the existing exclusive `--cbor-hex | --tx-file |
--tx-hash --provider --network` group. Raw/file sources truthfully return
incomplete validation/evaluation when context is not explicitly available;
hash sources use only `Cardano.Provider`.

## Slice plan

### Slice 1 — Shared read-only operations and Node API

Add RED Node/shared tests for operation allowlisting, transaction artifact-type
checks, provider-context reuse, all validation verdicts, per-redeemer script
results, incomplete context, and engine failures. Introduce the shared ledger
operation contract and expose witness plan, validation, and script evaluation
through the Node API.

**Owned files**:

- `lib/src/Cardano/Transaction.purs`
- `lib/src/Cardano/Transaction/Ledger.purs`
- `lib/src/Cardano/Transaction/Ledger.js`
- `node/src/transaction-engine.js`
- `node/src/index.js`
- `node/src/commands/tx.js`
- `node/test/transaction-provider.test.mjs`
- `node/test/transaction-ledger.test.mjs`
- `node/test/fixtures/transaction-ledger.json`
- `test/src/Test/TransactionLedger.purs`
- `test/src/Test/Main.purs`
- `nix/checks/node-api.nix`

**Focused proof**: `nix run .#ci-test && nix run .#ci-node-api`

**Commit**: `feat(transaction): expose shared ledger operations`

### Slice 2 — Shared safe witness preparation and attachment

Add RED direct/Node tests for raw and TextEnvelope witnesses, insertion,
default replacement refusal, authorized replacement, unrelated signer,
malformed witness, secret-free errors, and preserved body/non-target content.
Move WebUI-local witness preparation/policy into the shared library, keep a
thin compatibility import for the UI, and expose detached-witness attachment
through Node.

**Owned files**:

- `lib/src/Cardano/Transaction.purs`
- `lib/src/Cardano/Transaction/Ledger.purs`
- `lib/src/Cardano/Transaction/Ledger.js`
- `lib/src/Cardano/Transaction/Witness.purs`
- `lib/src/Cardano/Transaction/Witness.js`
- `docs/inspector/src/TxSigning.purs`
- `docs/inspector/src/TxSigning.js`
- `docs/inspector/src/Main.purs`
- `node/src/transaction-engine.js` (authorized by parent A-003; allowlist only)
- `node/src/index.js`
- `node/test/transaction-witness.test.mjs`
- `node/test/fixtures/transaction-witnesses.json`
- `test/src/Test/TransactionWitness.purs`
- `test/src/Test/Main.purs`
- `nix/checks/node-api.nix`

**Focused proof**: `nix run .#ci-test && nix run .#ci-node-api && nix build .#tx-inspector-ui --no-link`

**Commit**: `feat(transaction): attach vkey witnesses safely`

### Slice 3 — WebUI validation and script-evaluation parity

Write RED browser fixtures for the four validation verdicts, script success,
script failure, incomplete context, no-script applicability, and engine
failure. Route witness/validation/evaluation calls through the shared ledger
contract and render per-redeemer execution units/failures without changing the
engine-owned meaning.

**Owned files**:

- `docs/inspector/src/Main.purs`
- `docs/inspector/src/FFI/Inspector.purs`
- `docs/inspector/src/FFI/Inspector.js`
- `docs/inspector/src/FFI/Json.purs`
- `docs/inspector/src/FFI/Json.js`
- `docs/inspector/tests/tx-ledger-operations.spec.mjs`
- `docs/inspector/tests/unified-signing-loop.spec.mjs`
- `nix/checks/playwright.nix`

**Focused proof**: `nix build .#tx-inspector-ui --no-link && nix run .#ci-inspector-playwright`

**Commit**: `feat(inspector): render shared ledger operations`

### Slice 4 — CLI commands and installed cross-host proof

Add RED parser/package tests for all commands, exclusive transaction/witness
sources, vault entry kinds, descriptor/passphrase safety, TextEnvelope output,
replacement authorization, typed exits, foreign-CWD engine discovery, and
equal normalized engine payloads across CLI/Node/WebUI fixtures. Implement the
thin CLI routing while preserving every existing command.

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
- `nix/apps/csk.nix`
- `nix/apps/default.nix`
- `nix/packages/default.nix`
- `package.json`

**Focused proof**: `nix run .#ci-node-api && nix run .#ci-node-package && nix run .#csk -- tx witness plan --help`

**Commit**: `feat(cli): expose witness and ledger commands`

## Orchestrator-owned finalization slice

After all behavior commits are accepted, append inventory anchors for the four
shared operations, CLI routes, cross-host fixture, and no-fallback boundary to
the inherited `gate.sh`. Run the complete gate and commit/task audit, push the
final proof, wait for fresh remote CI on that SHA, update PR metadata, drop the
gate sentinel, and mark ready without merging.

**Owned files**:

- `gate.sh`
- `specs/072-witness-validate-parity/tasks.md`
- PR #91 metadata

## Dependency and ordering constraints

1. Slice 1 establishes the operation/context contract before mutation or host
   rendering depends on it.
2. Slice 2 adds the safety-sensitive mutation path over Slice 1's witness plan.
3. Slice 3 moves the WebUI onto the shared contract after both read and mutation
   paths exist.
4. Slice 4 exposes the stable APIs through CLI/package boundaries and owns the
   final cross-host fixture.
5. Every behavior slice is RED then GREEN, navigator-approved, one bisect-safe
   commit, and never pushed by the driver.

## Plan review: live-boundary smoke question

**What boundary can unit tests miss?** A Nix-local checkout can synthesize
assets that are absent from a plain GitHub checkout, and a host may accidentally
locate an engine relative to the current directory. Slice 4 therefore installs
the packed artifact into a foreign directory, invokes the real packaged CLI and
Node API against committed transaction/witness fixtures, and CI must go green
on the pushed SHA before completion. WebUI proof invokes the bundled WASI
artifact rather than mocking the operation dispatcher.

## Risks and mitigations

- **Truth collapse**: assert exact validation/script statuses and null/partial
  fields; never test only truthiness.
- **Unsafe witness replacement**: plan first, apply the explicit safety table,
  and discard any engine mutation not matching the authorized action.
- **Artifact-type confusion**: require the #67 detected envelope type to match
  the transaction or witness slot.
- **Provider duplication**: architecture checks reject host endpoints,
  response decoders, and context construction outside `Cardano.Provider`.
- **Secret leakage**: inspect argv, environment, result/error text, stdout,
  stderr, and temporary directories with synthetic sentinel secrets.
- **Engine drift/fallback**: assert the packaged ledger engine is the only
  validation/evaluation artifact and test missing/corrupt/protocol failures.
- **Checkout-only fixture gaps**: package tests resolve committed canonical
  fixtures and run directly from repository root in fresh remote CI.

## Final verification

The ticket is complete only after all tasks are checked in their introducing
commit, `./gate.sh` passes at final implementation HEAD, the commit-message
audit passes, the draft PR body names exact proof/residual risks, the gate is
dropped in the final sentinel commit, and fresh GitHub Actions checks are green
for the pushed final SHA. The ticket owner does not merge.
