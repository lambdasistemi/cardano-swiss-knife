# Tasks: Withdrawal Account State Resolution

## Slice 1 — Shared provider account-state contract

- [X] T001-S1 Add RED provider tests for Blockfrost and Koios reward-account routes across all networks, key/script credentials, deduplication, and zero balances in `test/src/Test/Provider.purs`. (`a821167`)
- [X] T002-S1 Add RED provider tests for missing, unregistered, malformed, mismatched, partial, and transport/provider failure responses with stable typed diagnostics and credential redaction in `test/src/Test/Provider.purs`. (`a821167`)
- [X] T003-S1 Extend `lib/src/Cardano/Provider.purs` and `lib/src/Cardano/Provider.js` to consume engine withdrawal discovery and resolve provider account state through the shared transport. (`a821167`)
- [X] T004-S1 Construct `context.cert_state.rewards` only when every account resolves, preserve legacy inspection input, and retain complete-or-absent resolution evidence. (`a821167`)
- [X] T005-S1 Run focused PureScript tests and `./gate.sh`; obtain navigator approval; commit exactly `feat(provider): resolve withdrawal account state` with `Tasks: T001, T002, T003, T004, T005`. (`a821167`)

## Slice 2 — Node validation discovery and packaged CLI proof

- [X] T006-S2 Add RED Node tests for provider-selected raw and transaction-TextEnvelope validation using engine-owned withdrawal discovery in `node/test/transaction-provider.test.mjs`. (`7791e7b`)
- [X] T007-S2 Prove complete script/key account state, fail-closed incomplete verdicts, typed redacted evidence, and the committed script-withdrawal CLI fixture in `node/test/transaction-provider.test.mjs`. (`7791e7b`)
- [X] T008-S2 Prove the provider-absent path makes zero requests and does not run added withdrawal discovery in `node/test/transaction-provider.test.mjs` and, only if needed, `node/test/api-properties.test.mjs`. (`7791e7b`)
- [X] T009-S2 Update `node/src/index.js` so only provider-selected context-sensitive operations pass a composite `tx.inspect`/`tx.intent` discovery envelope into the shared resolver. (`7791e7b`)
- [X] T010-S2 Run Node API/package proofs and `./gate.sh`; obtain navigator approval; commit exactly `fix(node): pass withdrawal state to validation` with `Tasks: T006, T007, T008, T009, T010`. (`7791e7b`)

## Orchestrator-owned finalization

- [X] T011 Bootstrap the issue worktree, establish a green baseline, add the append-only gate, and open draft PR #116.
- [X] T012 Audit issue acceptance, complete-or-absent certificate state, raw/TextEnvelope/provider/key/script coverage, offline zero requests, redaction, and sibling scope isolation.
- [X] T013 Run final `./gate.sh`, commit-message/task audit, update and push PR #116, and verify fresh GitHub Actions on implementation SHA `7791e7b`.
- [X] T014 Run the packaged-CLI live-boundary smoke and record the epic owner's accepted anonymous Koios rate-limit exception in the PR verification.
- [X] T015 Only after local gate, accepted live-smoke evidence, and fresh remote CI are green, stamp task completion while dropping `gate.sh` in `chore: drop gate.sh (ready for review)`, mark PR #116 ready, report `COMPLETE`, and do not merge.
