# Implementation Plan: Provider Submission for Completed Entries

**Branch**: `feat/77-provider-submit` | **Date**: 2026-07-21 | **Spec**:
[spec.md](spec.md)

## Summary

Extend the canonical `Cardano.Provider` module with binary Blockfrost/Koios
submission and a typed completed-entry gate/receipt. Expose that operation
through the packed Node API and `csk tx submit` without duplicating provider
policy. After #76 publishes its actual workbench shape, add a confirmation-
gated browser action that assembles through the existing ledger engine,
submits through the shared provider operation, and persists the returned
submitted entry. Each behavior layer is a separate bisect-safe RED/GREEN
commit.

## Technical context

**Language/Version**: PureScript 0.15.16, JavaScript on Node 22+, Halogen
workbench, Nix flake checks

**Existing dependencies**: merged `Cardano.Provider`,
`Cardano.Transaction.Entry`, `Cardano.Transaction.Witness`, transaction-ledger
WASI operation adapters, the Node non-throwing API facade, CLI secret/vault
bootstrap, and (for Slice 3 only) #76's IndexedDB `EntryStore` adapter

**Testing**: shared PureScript contract tests, packed Node/CLI tests, inspector
Playwright, architecture-boundary check, safe live-provider rejection smoke,
`./gate.sh`, and fresh GitHub Actions

**Constraints**: one provider implementation; raw binary CBOR on the wire; no
host-side semantic fallback; incomplete/expired/submitted entries fail before
IO; no real transaction submission in automated tests; no guessed #76 files

## Existing foundation

- #10 owns provider/network selection, authentication, transport, endpoint
  bases, response classification, and redacted typed errors in
  `lib/src/Cardano/Provider.{purs,js}`. The architecture gate rejects endpoint
  or auth policy copied into hosts.
- #75 owns `TxEntry`, `deriveCompleteness`, and `deriveStatus`, including
  terminal submitted/expired status. Submission consumes those functions and
  does not reproduce their roster logic.
- #72's ledger engine adapters already attach witnesses and return signed
  transaction CBOR. The provider layer accepts that normalized hex but never
  parses or assembles the transaction itself.
- Node APIs resolve to `CskResult`; CLI transaction commands delegate through
  `node/src/commands/tx.js` and obtain provider secrets through the vault path.
- #76 is concurrently defining the only browser entry/store/action structure.
  Slice 3 waits for its release point and then rebases/merges that structure;
  Slices 1 and 2 do not wait.

## Shared submission contract

The public shared surface adds typed `SubmissionError` and
`SubmissionReceipt` values plus production and injectable-transport functions.
The exact implementation naming may follow existing module style, but the
contract is fixed:

```text
submit(transaction transport, provider, network, credential,
       current slot, signed transaction CBOR hex, TxEntry)
  -> Either SubmissionError SubmissionReceipt

SubmissionReceipt =
  { txId: 64-char lowercase hex
  , provider
  , network
  , entry: original entry with status = Submitted
  }
```

Processing order is observable and tested:

1. Derive #75 lifecycle at `currentSlot`; accept only `Complete`.
2. Validate/decode even-length hexadecimal input without interpreting CBOR.
3. Build one request inside `Cardano.Provider`: Blockfrost `/tx/submit` or
   Koios `/submittx`, existing auth policy, `application/cbor`.
4. The production FFI converts the normalized hex body to `Uint8Array` for
   `fetch`; injected transports retain a deterministic inspectable body.
5. Accept any documented 2xx success, decode a JSON string, validate/normalize
   the 64-character transaction id, and return the submitted entry receipt.
6. On any failure, return a typed error and leave the caller's entry unchanged.

## Slice 1 — Shared provider submission and direct proof

One vertical RED/GREEN commit extends only the canonical shared provider and
its direct tests.

### Owned files

```text
lib/src/Cardano/Provider.purs
lib/src/Cardano/Provider.js
test/src/Test/Provider.purs
```

No host, UI, engine, manifest, lockfile, fixture, or entry-domain edit is
allowed. Any additional file is a Q-file blocker.

### TDD and proof

1. RED covers exact Blockfrost/Koios requests, all networks, existing optional
   auth behavior, documented success status/receipt JSON, status transition,
   invalid receipt, invalid hex, and zero-transport lifecycle rejection.
2. Navigator approves `handoffs/red.diff` before production edits.
3. GREEN adds the smallest shared provider extension and binary-fetch FFI
   without changing #75 completeness or adding a semantic dependency.
4. Focused proof:
   `nix develop --quiet -c spago test -p cardano-addresses-test`.
5. Full proof: `./gate.sh`.

**Commit**: `feat(provider): submit completed transaction entries`

**Trailer**: `Tasks: T774, T775, T776, T777, T778, T779, T780`

## Slice 2 — Node and CLI adapters

Expose the shared operation through the existing host delegation chain. Node
accepts a JSON-compatible entry, current slot, signed CBOR, provider/network,
and optional credential; it returns `CskResult<SubmissionReceipt>`. CLI adds
an explicit `csk tx submit` route using entry and signed-transaction files,
provider/network flags, confirmation, and the existing vault secret mechanism.

### Owned files

```text
node/src/index.js
node/src/index.d.ts
node/src/error.js                    (only if the shared typed taxonomy needs mapping)
node/src/commands/tx.js
cli/csk.mjs
node/test/transaction-provider.test.mjs
node/test/api-contract.test.mjs
node/test/cli.test.mjs
node/test/package-smoke.mjs          (only if export smoke requires it)
scripts/check-node-api-exports.mjs   (only if the export inventory requires it)
```

No provider endpoint/header/body decoder may appear in Node or CLI. Tests
intercept `fetch`; the shared PureScript module must construct every request.

### TDD and proof

1. RED proves the public Node type/runtime export, both provider routes,
   incomplete pre-IO rejection, receipt normalization, coded failures, CLI
   confirmation/cancellation, file parsing, and credential redaction.
2. Navigator approves RED before host implementation.
3. GREEN delegates to compiled `Cardano.Provider` and preserves existing
   `CskResult`, CLI exit-code, and secret-source conventions.
4. Focused proof: `nix run .#ci-node-api` plus the relevant CLI test filter.
5. Extend `gate.sh` in an orchestrator-owned commit before dispatch so the full
   proof includes `nix run .#ci-node-api`; then run the full gate.

**Commit**: `feat(cli): expose completed-entry submission`

**Trailer**: `Tasks: T781, T782, T783, T784, T785, T786`

## Slice 3 — Confirmable workbench action after #76

This slice starts only after #76 publishes a committed workbench release point.
The ticket orchestrator re-reads that diff and replaces the provisional owned
file list below with the exact #76 paths before dispatch. The action uses #76's
active entry and store, the existing transaction-ledger assembly adapter, and
the shared provider operation; it does not create parallel workbench state.

### Provisional owned area (must be made exact after #76 release)

```text
docs/inspector/src/<#76 workbench module>.purs
docs/inspector/src/Provider.purs
docs/inspector/tests/<#76 workbench spec>.spec.mjs
docs/inspector/dist/styles.css       (only if #76 locates action styling here)
```

If #76 has not produced an integration point, the slice is parked with
`NOTE PARKED` while the already-independent slices continue. Guessing paths or
creating a competing entry/store UI is forbidden.

### TDD and proof

1. Browser RED proves incomplete/expired disabled state, cancel/no-request,
   provider/network confirmation text, success persistence/receipt, and
   failure without status mutation.
2. Navigator approves RED before implementation.
3. GREEN uses the actual #76 state/actions and delegates transaction assembly
   to the ledger engine and HTTP policy to shared `Cardano.Provider`.
4. Focused proof runs #76's workbench Playwright spec.
5. Extend `gate.sh` before dispatch to include the relevant inspector build and
   Playwright check, then run the full gate.

**Commit**: `feat(workbench): confirm completed-entry submission`

**Trailer**: `Tasks: T787, T788, T789, T790, T791, T792`

## Live-boundary proof

Fixture transports prove policy but not that the real providers accept the
request shape. Before finalization, run the packed Node submission API against
both real endpoints with deliberately invalid short CBOR:

- Blockfrost with a non-secret invalid project id must reach the real endpoint
  and return the shared authentication error without leaking the token.
- Koios without a bearer token must reach `/submittx` and return a shared
  rejection error rather than a transport/CORS/body-encoding failure.

The payload cannot be a valid transaction, so acceptance is a hard failure.
Record the redacted transcript in `WIP.md` and the PR verification section.
This is a named operator-owned follow-up rather than a permanent gate step
because it requires external network availability and provider behavior.

## Orchestrator-owned finalization

After every behavior commit is navigator-approved, the ticket orchestrator
marks that slice's tasks complete in the same commit, independently runs the
gate, reviews source ownership and commit/task linkage, pushes, and watches
fresh remote CI. Once all slices and the live-boundary proof are complete,
update the PR body, run the final audit, stamp finalization tasks while dropping
`gate.sh` in `chore: drop gate.sh (ready for review)`, mark the PR ready, and
require fresh remote CI green again before reporting `COMPLETE`.

## Risks and controls

- **Hex text sent instead of bytes**: direct transport assertions plus the
  production FFI/packed-host tests distinguish inspectable hex from the actual
  `Uint8Array` fetch body; live rejection smoke covers the real boundary.
- **Completeness copied into provider code**: the implementation must call
  #75's derivation and direct tests use duplicate/partial rosters that expose a
  handwritten shortcut.
- **Stale status allows expiry or resubmission**: gating derives lifecycle at
  the caller-supplied current slot and explicitly rejects terminal states.
- **Host duplicates provider policy**: architecture checks and diff review
  forbid endpoint/auth/content-type literals outside `Cardano.Provider`.
- **Submission performs ledger semantics**: signed CBOR is engine-produced
  input; the provider layer only validates hexadecimal encoding and sends
  bytes.
- **#76 conflict**: the browser slice waits for a committed release point,
  re-plans its exact owned files, and never guesses the concurrent UI shape.
- **Real funds or secrets enter tests**: all automated success paths intercept
  transport; the live smoke uses invalid CBOR and invalid/no credentials.
- **Fresh-worktree artifacts hide failure**: follow #90 by trying
  `nix develop --quiet -c spago build` for missing local output, but accept only
  exact-SHA fresh GitHub Actions.

## Dependency and release effect

Slice 1 depends only on merged #10/#75. Slice 2 depends on Slice 1. Slice 3
depends on Slice 1 and #76's release point and may proceed after Slice 2 or in
parallel only if the driver/navigator pane contract and file ownership remain
disjoint. Completion releases #77 to #73 and satisfies the provider-submission
portion of parent #66 and epic #74; this ticket never merges itself.
