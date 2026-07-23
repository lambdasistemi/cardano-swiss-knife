# Implementation Plan: Migrated Amaru Witness Attach

## Technical Context

The Node CLI is implemented in `cli/csk.mjs`. Its vault secret loader
decrypts the canonical age vault in memory, selects an entry by id, and
currently validates one exact kind. The witness-attach branch calls that
loader with `signing-key`, then sends the selected Bech32 key to the shared
`prepareTransactionWitness` API and the resulting detached witness to the
authoritative ledger-engine attachment API.

Migration is already correct: `lib/src/Cardano/Vault.js` maps
`amaruTreasuryWitnessVault` sources to
`cardano-addresses-addr-xsk`, retaining the source Bech32 value. The change
belongs at the witness-attach secret-source policy boundary, not in
migration or the shared cryptographic/ledger implementation.

## Design

- Generalize the existing in-memory vault entry-kind check only enough for
  a caller to name an explicit allow-list.
- Keep every other secret consumer on its current single-kind policy.
- For local witness preparation, allow exactly `signing-key` and
  `cardano-addresses-addr-xsk`.
- Preserve the existing generic `SECRET_SOURCE` boundary for missing
  entries, wrong kinds, non-string values, decryption failures, and
  unsupported representations.
- Continue passing only the selected in-memory string to the shared witness
  preparation API. The shared preparation and engine attachment results
  remain responsible for cryptographic validity, derived signer identity,
  required-signer relevance, replacement policy, and transaction output.

No passphrase or secret is added to argv, environment, disk, structured
results, or diagnostics. No host-side ledger or crypto fallback is
introduced.

## Slice 1 — Accept and prove migrated address-xsk signing sources

This is one vertical, bisect-safe behavior commit.

**Owned files**

- `cli/csk.mjs`
- `node/test/cli.test.mjs`

**RED**

Extend the CLI witness test with an encrypted Amaru legacy wrapper built
from the committed matching address extended signing-key fixture. Drive the
real `vault migrate`, `vault list`, and `tx witness attach` commands. The
pre-fix attach must fail because the migrated kind is not `signing-key`.

The regression also covers:

- attached transaction and detached witness TextEnvelope types;
- post-attach witness plan containing the required signer;
- mismatched migrated identity rejection before transaction output;
- unrelated secret-kind and unsupported representation rejection;
- continued canonical `signing-key` attachment;
- absence of passphrase/key/secret sentinels in stdout, stderr, captured
  argv/environment, and temporary files.

**GREEN**

Make the smallest CLI secret-source policy change that accepts exactly the
two intended kinds for witness preparation. Do not change migration,
transaction APIs, engine behavior, output schemas, or replacement rules.

**Focused proof**

```sh
nix run .#ci-node-api
```

**Full gate**

```sh
./gate.sh
```

**Commit**

```text
fix(cli): accept migrated address xsk witnesses

Tasks: T001, T002, T003, T004, T005, T006
```

## Finalization — Orchestrator-owned

After navigator approval and independent gate reproduction, the
orchestrator stamps the slice tasks into the implementation commit, pushes
it, updates the draft PR body, re-runs the final gate/audit, removes
`gate.sh`, stamps the finalization tasks in that same drop commit, pushes,
marks PR #115 ready, and verifies fresh remote CI.

## Cross-Lane Boundary

The concurrent #99 lane owns transaction-review rendering/provider
plumbing and currently changes only `gate.sh` plus `specs/099-tx-review/`.
Any discovered overlap outside the two owned implementation files is a
ticket-level blocker and must be escalated through the Q-file protocol.
