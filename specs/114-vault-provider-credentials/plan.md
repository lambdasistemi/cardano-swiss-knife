# Implementation Plan: Vault Provider Credentials

**Branch**: `feat/114-vault-provider-credentials` | **Date**: 2026-07-23 | **Spec**: `specs/114-vault-provider-credentials/spec.md`

## Summary

Extend the existing Node CLI host with one add-only provider-credential command.
The host decrypts the canonical age vault in memory, validates operator metadata
and an opaque terminal-only credential, appends one canonical entry, and reuses
the existing atomic private replacement helper. The entry kind already consumed
by `tx validate` is retained, so provider HTTP and validation logic remain
unchanged.

## Technical Context

**Language/Version**: Node.js 22 ESM JavaScript; PureScript provider core remains unchanged
**Primary Dependencies**: Existing `age-encryption`, Node filesystem and terminal primitives
**Storage**: Canonical age v1 vault file
**Testing**: Node test runner, `expect` pseudo-terminal tests, Nix check apps, Playwright/full repository gate
**Target Platform**: Packaged `csk` CLI on Linux/macOS/Windows; no native addon
**Project Type**: CLI host over shared PureScript/WASM operations
**Performance Goals**: One decrypt/encrypt/write cycle per add; no network request during vault mutation
**Constraints**: No secret argv/env values, decrypted bytes memory-only, atomic `0600` writes, no host-side Cardano/provider semantics
**Scale/Scope**: One provider entry per invocation; canonical v1 vaults of operator-managed size

## Constitution Check

- **One operation model, multiple hosts**: PASS. The CLI emits the same
  provider kinds already produced and consumed by the browser vault.
- **Browser-first, CLI-parity-conscious**: PASS. Opaque non-whitespace
  credential validation matches the browser policy.
- **Authoritative Cardano engines**: PASS. No Cardano, provider HTTP, or ledger
  behavior moves into the host.
- **Local-first secret handling**: PASS. Credential input is controlling-TTY
  only and decrypted material remains in memory.
- **Honest capability boundaries**: PASS. The command mutates vault storage;
  `tx validate` continues to own validation and provider enrichment.
- **Nix canonical build surface**: PASS. Focused Nix checks and the inherited
  full gate are required.

## Existing Boundaries

- `lib/src/Cardano/Vault.js` owns canonical validation and age
  encryption/decryption. Its schema already retains unknown kinds and extension
  fields.
- `cli/vault-host.mjs` owns filesystem reads and atomic private writes.
- `cli/csk.mjs` owns CLI parsing, no-echo terminal sessions, passphrase
  descriptors, vault selection, and command rendering.
- `lib/src/Cardano/Provider.*` owns provider HTTP and typed/redacted provider
  errors and MUST NOT change.
- The merged #108 `secret(...)` helper accepts a single kind or explicit kind
  list. Provider consumers continue selecting exactly
  `blockfrost-project-id` or `koios-bearer-token`.

## Command and Data Contract

```text
csk vault credential add \
  --vault PATH \
  --provider blockfrost|koios \
  --id ID \
  --label LABEL \
  [--passphrase-fd FD]
```

The command has no credential, secret, token, project-id, stdin, fd, or
environment-value option. It always asks the controlling terminal for
`Blockfrost project ID` or `Koios bearer token` with echo disabled.

Provider mapping:

| Provider | Canonical entry kind | Prompt |
|---|---|---|
| `blockfrost` | `blockfrost-project-id` | `Blockfrost project ID` |
| `koios` | `koios-bearer-token` | `Koios bearer token` |

The appended entry is:

```json
{
  "id": "<operator id>",
  "kind": "<provider mapping>",
  "label": "<operator label>",
  "value": "<TTY-only opaque credential>",
  "createdAt": "<UTC ISO-8601 timestamp>"
}
```

Id and label are rejected when empty after trimming or when they contain ASCII
control characters. Credential input is rejected when empty after trimming but
is otherwise stored exactly as entered. Duplicate ids are rejected across all
entry kinds.

## Slice 1 — Add, list, and consume provider credentials

This is one vertical, bisect-safe behavior commit because the operator command,
atomic mutation, redacted listing, and existing validation consumer form one
security boundary.

**Owned files**

- `cli/vault-host.mjs`
- `cli/csk.mjs`
- `test/vault-cli.test.mjs`
- `test/vault-cross-host.test.mjs`
- `node/test/cli.test.mjs`
- `docs/user/vault.md`

**Forbidden scope**

- `lib/src/Cardano/Provider.purs`
- `lib/src/Cardano/Provider.js`
- `lib/src/Cardano/Vault.purs`
- `lib/src/Cardano/Vault.js`
- provider protocol, ledger, WASM, browser UI, schema version, signing-key
  representation, release workflow, and sibling ticket files

**RED**

1. Add a host-level mutation regression proving preservation, duplicate
   protection, wrong-passphrase preservation, `0600`, atomic seam cleanup, and
   no cleartext temp artifact.
2. Add pseudo-terminal CLI regressions for Blockfrost and Koios create/add/list,
   terminal state restoration, no echo, malformed metadata/credential,
   secret-bearing flag rejection, and output redaction.
3. Extend the local `tx validate` provider regression so the canonical entry
   shape produced by the command reaches the shared Blockfrost boundary with a
   non-empty project-id header, while request capture records only presence and
   never value.
4. Run the focused commands and observe at least the new command/mutation tests
   fail before implementation:

```sh
nix run .#ci-vault-cli
nix run .#ci-node-api
```

**GREEN**

- Add one host mutation function that reads, decrypts, validates, appends,
  encrypts, and calls the existing atomic replacement helper.
- Extend the vault parser/help/dispatch for the exact command contract.
- Reuse one `ttySession` for passphrase and credential prompts where both are
  terminal-sourced; never add a provider-secret fd/stdin/env/argv path.
- Keep list projection and `tx validate` provider wiring unchanged except for
  proof improvements.
- Document the operator workflow and secret-source invariant.

**Focused proof**

```sh
nix run .#ci-vault
nix run .#ci-vault-cli
nix run .#ci-node-api
```

**Full gate**

```sh
./gate.sh
```

**Commit**

```text
feat(vault): add provider credentials

Tasks: T001, T002, T003, T004, T005, T006, T007, T008
```

## Finalization — Orchestrator-owned

After driver commit and navigator verification, the orchestrator reviews the
full diff and evidence, independently reruns the focused checks and full gate,
stamps T001–T008 into the implementation commit, and pushes it. The
orchestrator then updates PR #117, runs the final audit, removes `gate.sh`,
stamps finalization tasks in that drop commit, pushes, marks the PR ready, and
waits for fresh remote CI.

## Cross-Lane Boundary

csk-108/PR #115 merged before this branch was created. Its generalized
`secret(...)` kind-selection helper is the baseline and is not reimplemented.
The Q-001 serialization decision eliminates the prior concurrent-editor
conflict.
