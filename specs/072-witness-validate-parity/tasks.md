# Tasks: Witness and Ledger-Operation Parity

## Slice 1 — Shared read-only operations and Node API

- [X] T001-S1 Add RED shared/Node tests for witness planning, all validation verdicts, script success/failure/incomplete/not-applicable results, and per-redeemer execution-unit/failure preservation.
- [X] T002-S1 Prove transaction slots reject `TxWitness ConwayEra`, malformed input and engine failures remain typed, and no host fallback result appears.
- [X] T003-S1 Define the shared ledger operation/context contract and extend the packaged Node runner allowlist for `tx.witness.plan`, `tx.validate`, and `tx.evaluate.scripts`.
- [X] T004-S1 Reuse `Cardano.Provider` for hash-source producer/context resolution while raw/TextEnvelope sources remain explicit and truthfully incomplete without context.
- [X] T005-S1 Export Node result-envelope functions for witness planning, validation, and script evaluation with engine-owned result payloads intact.
- [X] T006-S1 Run `nix run .#ci-test`, `nix run .#ci-node-api`, and `./gate.sh`.
- [X] T007-S1 Commit exactly `feat(transaction): expose shared ledger operations` with `Tasks: T001, T002, T003, T004, T005, T006, T007`.

## Slice 2 — Shared safe witness preparation and attachment

- [ ] T008-S2 Add RED direct/Node tests for raw and `TxWitness ConwayEra` input, inserted attachment, default replacement refusal, authorized replacement, unrelated signer, malformed witness, and engine failure.
- [ ] T009-S2 Prove body identity and all non-target witness/script/datum/redeemer content survive attachment and secret sentinels never appear in structured results or diagnostics.
- [ ] T010-S2 Move signature preparation and signer-plan safety policy into `Cardano.Transaction.Witness`, backed by existing Haskell-derived signing and ledger attachment operations.
- [ ] T011-S2 Make transaction/witness artifact-type checks use `Cardano.TextEnvelope` and emit both detached-witness and signed-transaction TextEnvelopes without changing CBOR bytes.
- [ ] T012-S2 Expose detached-witness attachment through the Node result envelope and keep the WebUI compatibility module thin over the shared capability.
- [ ] T013-S2 Run `nix run .#ci-test`, `nix run .#ci-node-api`, `nix build .#tx-inspector-ui --no-link`, and `./gate.sh`.
- [ ] T014-S2 Commit exactly `feat(transaction): attach vkey witnesses safely` with `Tasks: T008, T009, T010, T011, T012, T013, T014`.

## Slice 3 — WebUI validation and script-evaluation parity

- [ ] T015-S3 Add RED browser fixtures for `valid | invalid | incomplete | rejected`, script success/failure/incomplete/not-applicable, per-redeemer units/failures, and engine load/protocol failure.
- [ ] T016-S3 Route WebUI witness plan, validation, script evaluation, and attachment through the shared transaction capability rather than operation-specific host policy.
- [ ] T017-S3 Render truthful validation and per-redeemer script-evaluation states while preserving missing-context and typed failure distinctions.
- [ ] T018-S3 Preserve the portable-vault/in-memory signing lifecycle and prove insertion, replacement refusal, and explicit replacement behavior in the browser journey.
- [ ] T019-S3 Run `nix build .#tx-inspector-ui --no-link`, `nix run .#ci-inspector-playwright`, and `./gate.sh`.
- [ ] T020-S3 Commit exactly `feat(inspector): render shared ledger operations` with `Tasks: T015, T016, T017, T018, T019, T020`.

## Slice 4 — CLI commands and installed cross-host proof

- [ ] T021-S4 Add RED CLI/package tests for `tx witness plan|attach`, `tx validate`, and `tx evaluate-scripts`, including exclusive transaction/witness sources, human/JSON results, and typed exits.
- [ ] T022-S4 Add RED vault/descriptor tests for compatible signing entry kinds, inherited passphrase FD/no-echo intake, and absence of key/passphrase sentinels from argv, environment, output, errors, and temporary files.
- [ ] T023-S4 Implement the four command routes as thin Node API calls, including detached/signed TextEnvelope files and explicit `--replace-existing`, while preserving all existing CLI families.
- [ ] T024-S4 Extend foreign-CWD installed-package smoke across CLI and Node, compare committed cross-host fixtures, and prove packaged ledger discovery with no separate/fallback Plutus artifact.
- [ ] T025-S4 Extend the architecture boundary proof so provider HTTP/context, ledger validation, script evaluation, witness mutation, CBOR, and crypto fallback cannot appear in host code.
- [ ] T026-S4 Run `nix run .#ci-node-api`, `nix run .#ci-node-package`, the packaged `csk` command smoke, and `./gate.sh`.
- [ ] T027-S4 Commit exactly `feat(cli): expose witness and ledger commands` with `Tasks: T021, T022, T023, T024, T025, T026, T027`.

## Orchestrator-owned finalization

- [ ] T028 Append ticket-specific shared-operation, CLI-route, fixture, and no-fallback inventory checks to the inherited `gate.sh` without replacing existing functions or commands.
- [ ] T029 Audit every issue acceptance criterion, host export/command, provider-context path, TextEnvelope type boundary, validation/script truth state, witness safety transition, secret boundary, fixture, and task/commit link.
- [ ] T030 Run the final `./gate.sh` and commit-message audit, update draft PR #91 with exact proof and residual risks, and push the final implementation SHA.
- [ ] T031 Wait for fresh GitHub Actions on that pushed SHA; only after green, drop `gate.sh` in `chore: drop gate.sh (ready for review)`, mark PR #91 ready, report `COMPLETE`, and do not merge.
