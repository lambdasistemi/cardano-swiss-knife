# Tasks: Node API Property Tests as Executable Documentation

## Slice 1 — Offline API contracts and reusable harness

- [X] T001-S1 Pin `fast-check` in `package.json` and `package-lock.json` without changing runtime package dependencies.
- [X] T002-S1 Add an installed-package property harness with reproducible seeds/run budgets and no Cardano semantic implementation.
- [X] T003-S1 Add commented RED→GREEN properties covering `CskError` and all 14 offline address, mnemonic, key, payload, and script exports.
- [X] T004-S1 Prove valid composition/determinism/round trips plus exact malformed-input, applicable engine-failure, and secret-free result taxonomy.
- [X] T005-S1 Wire canonical `node/test/api-properties.test.mjs` into `ci-node-api` while retaining every example test.
- [X] T006-S1 Run `nix run .#ci-node-api` and `./gate.sh`.
- [X] T007-S1 Commit exactly `test(node): specify offline API properties` with `Tasks: T001, T002, T003, T004, T005, T006, T007`.

## Slice 2 — Transaction, provider, and book contracts

- [X] T008-S2 Extend canonical `node/test/api-properties.test.mjs` with commented RED→GREEN properties for `inspectTransaction`, `browseTransaction`, `identifyTransaction`, and `transactionIntent`.
- [X] T009-S2 Prove raw/TextEnvelope parity, exclusive malformed-source errors, browse-path invariants, and offline no-network behavior.
- [X] T010-S2 Cover every provider/network mapping plus exact redacted authentication, rate-limit, server, transport, and decode failures through shared provider code.
- [X] T011-S2 Cover ordered book import/resolution and applicable ledger/RDF missing, incompatible, execution, and malformed-protocol failures without fallback semantics.
- [X] T012-S2 Keep the canonical property path wired into `ci-node-api` while retaining every prior property and example test.
- [X] T013-S2 Run `nix run .#ci-node-api` and `./gate.sh`.
- [X] T014-S2 Commit exactly `test(node): specify transaction API properties` with `Tasks: T008, T009, T010, T011, T012, T013, T014`.

## Slice 3 — Witness and ledger truth contracts

- [X] T015-S3 Extend canonical `node/test/api-properties.test.mjs` with commented RED→GREEN properties for all six witness-planning, preparation, normalization, attachment, validation, and evaluation exports.
- [X] T016-S3 Prove witness raw/TextEnvelope byte round trips, body identity, insertion/replacement/unrelated-signer safety, non-target preservation, and secret-free failures.
- [X] T017-S3 Preserve `valid | invalid | incomplete | rejected` and per-redeemer success/failure/incomplete/not-applicable details exactly.
- [X] T018-S3 Cover malformed artifact and applicable missing/incompatible/execution/protocol engine taxonomy with no host ledger/CBOR/crypto/Plutus fallback.
- [X] T019-S3 Keep the canonical property path wired into `ci-node-api` and add the README pointer to that executable contract, including the #77 follow-up gap.
- [X] T020-S3 Run `nix run .#ci-node-api` and `./gate.sh`.
- [X] T021-S3 Commit exactly `test(node): specify witness and ledger properties` with `Tasks: T015, T016, T017, T018, T019, T020, T021`.

## Orchestrator-owned finalization

- [ ] T022 Audit the static contract inventory against all 25 package exports and confirm no csk-93-owned `node/src/` file changed.
- [ ] T023 Run final `./gate.sh`, commit-message/task audit, update PR #95 with exact local proof and the explicit #77 gap, then push the implementation SHA.
- [ ] T024 Wait for fresh GitHub Actions green on the implementation SHA; only then drop `gate.sh`, mark PR #95 ready, and push the final sentinel SHA.
- [ ] T025 Verify fresh GitHub Actions green on the final SHA, report `COMPLETE` to the epic owner, and do not merge.
