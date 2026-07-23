# Tasks: Vault Provider Credentials

**Input**: `specs/114-vault-provider-credentials/spec.md` and `plan.md`

## Slice 1 — Add, list, and consume provider credentials

- [X] T001 [US1] Add RED host-level vault mutation tests for unrelated-entry/extension preservation, duplicate-id protection, wrong-passphrase preservation, atomic-seam cleanup, and `0600` output in `test/vault-cross-host.test.mjs`.
- [X] T002 [US1] Add RED pseudo-terminal create/add tests for Blockfrost and Koios, no-echo terminal restoration, and inherited passphrase descriptors in `test/vault-cli.test.mjs`.
- [X] T003 [US1] Add RED rejection tests for unsupported providers, missing/control-character metadata, whitespace credentials, duplicate ids, and every secret-bearing argument/environment-style form in `test/vault-cli.test.mjs`.
- [X] T004 [US2] Add RED human/JSON listing assertions for provider id, kind, label, and creation time with no `value`, credential, or passphrase disclosure in `test/vault-cli.test.mjs`.
- [X] T005 [US3] Strengthen local Blockfrost `tx validate` proof so request capture records a non-empty credential header but never its value, while wrong passphrase/kind remain `SECRET_SOURCE`, in `node/test/cli.test.mjs`.
- [X] T006 [US1] Implement add-only provider credential mutation using canonical in-memory decrypt/encrypt and the existing atomic replacement helper in `cli/vault-host.mjs`.
- [X] T007 [US1] Implement the exact `vault credential add` parser, help, no-echo TTY prompts, provider-kind mapping, and redacted failure boundary in `cli/csk.mjs`.
- [X] T008 [US1] Document create/add/list/validate usage and the TTY-only provider-secret invariant in `docs/user/vault.md`; run `nix run .#ci-vault`, `nix run .#ci-vault-cli`, `nix run .#ci-node-api`, and `./gate.sh`; obtain navigator GREEN approval and commit the bisect-safe slice.

## Finalization — Orchestrator-owned

- [ ] T009 Independently review the implementation diff and navigator handshake, rerun all focused checks and `./gate.sh`, stamp T001–T008 into the implementation commit, and push it.
- [ ] T010 Update PR #117 with delivered behavior and evidence, pass the commit/task finalization audit, remove `gate.sh`, and stamp T009–T011 in the drop-gate commit.
- [ ] T011 Mark PR #117 ready and verify fresh remote CI is green before declaring the ticket complete.

## Dependencies and Execution Order

- T001–T005 are the RED phase and must be captured and navigator-approved
  before T006–T008 begin.
- T006 precedes T007 because the command delegates encrypted mutation to the
  host helper.
- T007 precedes the command documentation and GREEN proof in T008.
- T009–T011 begin only after the driver commit has a matching
  `NAVIGATOR-VERIFIED` line.
- This ticket uses one driver and navigator pair; `[P]` markers are omitted
  because the RED/GREEN handshake and shared CLI files require serial evidence.
