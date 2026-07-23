# Implementation Plan: Withdrawal Account State Resolution

**Branch**: `fix/113-withdrawal-account-state` | **Date**: 2026-07-23 |
**Spec**: [spec.md](spec.md)

## Summary

Extend the existing `Cardano.Provider` context resolver to consume the ledger
engine's structured withdrawal discovery, resolve reward-account registration
and current balance through Blockfrost or Koios, and add an all-or-nothing
`cert_state` to the operation arguments. Then make the provider-selected Node
validation path run `tx.intent` alongside its existing `tx.inspect` discovery
and pass both engine responses into that shared resolver. The no-provider path
does not run the extra discovery operation and remains exactly offline.

## Technical context

**Language/Version**: PureScript 0.15.16 and ESM on Node 22+

**Primary dependencies**: `Cardano.Provider`,
`Cardano.Transaction.Ledger`, the packaged ledger-inspector WASI artifact,
existing Bech32 codec

**Testing**: PureScript Spec, Node built-in tests, installed-package/CLI smoke,
`./gate.sh`, fresh GitHub Actions

**Constraints**: engine-owned withdrawal semantics; one shared provider
implementation; no host CBOR/ledger fallback; complete-or-absent `cert_state`;
typed redacted evidence; offline zero requests; no vault/mempool scope

## Current state and seam

- The pinned engine's `tx.intent` result already contains
  `withdrawals[].credential.{kind,hash}` and exact
  `withdrawals[].reward_account_hex`; the host does not need to decode CBOR or
  infer credential headers.
- The pinned engine accepts
  `context.cert_state.rewards[] = { credential, balance_lovelace }` and reports
  missing certificate state as an incomplete validation result.
- Issue #104's Node path runs `tx.inspect`, delegates producer/context IO to
  `Cardano.Provider.resolveProducerTxContext`, and merges the returned operation
  arguments before calling the requested ledger operation.
- `Cardano.Provider` is already the sole owner of provider endpoints,
  transports, decoders, error taxonomy, and credential redaction.
- A provider-selected validation currently remains incomplete for withdrawal
  transactions because the resolver never supplies `cert_state`.

## Shared resolver contract

The resolver's discovery input remains a JSON string and accepts both the
legacy inspection response and a composite engine-discovery envelope containing
`inspection_response` and `intent_response`. Legacy callers remain compatible.
The composite envelope contains engine output only; it is not a second semantic
interpretation.

For each well-formed structured withdrawal, the resolver converts the exact
engine-provided reward-account bytes to the selected network's provider-facing
stake address, deduplicates accounts, and retains the engine-provided credential
kind/hash for ledger context.

Blockfrost resolution uses `GET /accounts/{stake_address}` and accepts only a
matching object whose `registered` field is true and whose
`withdrawable_amount` is non-negative decimal text. Koios resolution uses
`POST /account_info` with `_stake_addresses` and accepts exactly one matching
row whose `status` is `registered` and whose `rewards_available` is
non-negative decimal text.

When every requested account resolves, the operation arguments include:

```json
{
  "context": {
    "cert_state": {
      "rewards": [
        {
          "credential": { "kind": "key|script", "hash": "<hex>" },
          "balance_lovelace": "<decimal>"
        }
      ]
    }
  }
}
```

When discovery or any account resolution is incomplete, `cert_state` is absent
as a whole. Existing validation/producer context remains available, and
`context.resolution.withdrawal_accounts` reports source, requested/resolved
counts, missing accounts, and structured `{ account?, code, message }`
diagnostics. Provider error codes reuse the existing
`PROVIDER_AUTHENTICATION|RATE_LIMIT|SERVER|TRANSPORT|DECODE` taxonomy; local
discovery/contract failures use stable `WITHDRAWAL_*` codes. All messages pass
through the existing credential-redaction boundary.

## Slice plan

### Slice 1 — Shared provider account-state contract

Write RED PureScript provider tests for Blockfrost and Koios routes, all
networks, key/script credentials, deduplication, exact accepted decoding,
zero-balance handling, complete `cert_state`, and every incomplete/error case.
Extend only the shared Provider module/FFI so the old inspection input remains
compatible and account resolution is complete-or-absent.

**Owned files**:

- `lib/src/Cardano/Provider.purs`
- `lib/src/Cardano/Provider.js`
- `test/src/Test/Provider.purs`

**Focused proof**:
`nix develop --quiet -c npx spago test -p cardano-addresses-test`

**Commit**: `feat(provider): resolve withdrawal account state`

### Slice 2 — Node validation discovery and packaged CLI proof

Write RED Node examples for provider-selected raw CBOR and TextEnvelope
validation, engine-owned withdrawal discovery, key/script normalized evidence,
complete and fail-closed verdicts, credential redaction, and unchanged offline
zero-request behavior. Make only the provider-selected, context-sensitive Node
path run `tx.intent` and pass the composite discovery envelope to Slice 1's
resolver. Prove the existing CLI validates the committed script-withdrawal
fixture through the installed package without modifying the CLI parser.

**Owned files**:

- `node/src/index.js`
- `node/test/transaction-provider.test.mjs`
- `node/test/api-properties.test.mjs` only if property coverage is required

**Focused proof**: `nix run .#ci-node-api && nix run .#ci-node-package`

**Commit**: `fix(node): pass withdrawal state to validation`

## Orchestrator-owned finalization

The orchestrator owns `gate.sh`, all planning artifacts, task/commit audit, PR
metadata, live-boundary smoke, fresh remote CI verification, and the final
gate-removal commit. No slice worker pushes or edits PR metadata.

## Dependency and ordering constraints

1. Slice 1 establishes a backwards-compatible resolver contract and must be
   independently green before Slice 2 consumes the composite discovery input.
2. Slice 2 must not edit `cli/csk.mjs` or `node/test/cli.test.mjs`, which are
   owned by sibling ticket csk-108, and must not add vault behavior owned by
   csk-114.
3. Any need to edit a sibling-owned file or duplicate provider/ledger semantics
   is a parent Q-file blocker.
4. Each behavior slice follows witnessed RED then GREEN, receives navigator
   approval, and lands as one bisect-safe commit with a `Tasks:` trailer.
5. Slice workers never push; the orchestrator reruns the branch gate before
   every push.

## Plan review: live-boundary smoke question

**What system boundary can the unit suite miss?** Intercepted HTTP tests cannot
prove that the packaged CLI, a real provider's current account schema, the
committed script-withdrawal fixture, and the pinned engine all agree. Before
mark-ready, the orchestrator runs a credentialed packaged-CLI validation against
a selected live provider and records a redacted transcript showing the provider,
account requested/resolved counts, certificate-state presence, and truthful
verdict. This stays outside `gate.sh` because provider availability is not a
deterministic CI dependency.

Fresh GitHub CI separately proves the committed fixture and package staging from
a clean remote checkout.

## Risks and mitigations

- **Partial state creates a false verdict**: build `cert_state` only after all
  accounts resolve; otherwise omit it wholly and assert incomplete validation.
- **Host semantic drift**: consume engine-provided credential/hash/account
  bytes and use only presentation Bech32 encoding in the provider layer.
- **Schema ambiguity**: assert exact provider row identity, registration state,
  and non-negative decimal balance before accepting it.
- **Offline regression**: preserve the old no-selection branch and deny network
  access in regression coverage.
- **Credential leakage**: inject sentinel secrets through every failure class
  and scan structured/text outputs.
- **Sibling collision**: keep CLI/vault files out of the owned inventory and
  escalate any discovered need through the epic Q-file protocol.
