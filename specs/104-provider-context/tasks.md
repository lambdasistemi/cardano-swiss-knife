# Tasks: Explicit Provider Context for Local Transactions

## Slice 1 — Local context selection in the shared Node path

- [X] T001-S1 Add RED Node examples/properties for raw and transaction-TextEnvelope local inputs with every Blockfrost/Koios network selection across inspect, identify, intent, witness plan, validate, and script evaluation.
- [X] T002-S1 Prove provider options absent preserve exact offline results with zero network access; invalid partial selections and multiple sources fail before engine/provider IO.
- [X] T003-S1 Prove local bytes are preserved, the source transaction is never replaced, and unique ordinary/reference producer plus validation-context requests flow only through `Cardano.Provider`.
- [X] T004-S1 Cover complete, partial, and incomplete context evidence, hash-source compatibility, exact provider taxonomy, and credential redaction.
- [X] T005-S1 Generalize Node transaction input/context routing and TypeScript declarations without adding host-side provider, CBOR, or ledger semantics.
- [X] T006-S1 Run `nix run .#ci-node-api` and `./gate.sh`.
- [X] T007-S1 Commit exactly `feat(node): enrich local transactions through providers` with `Tasks: T001, T002, T003, T004, T005, T006, T007`.

## Slice 2 — CLI vault wiring and installed cross-host proof

- [X] T008-S2 Add RED CLI tests for all six scoped commands using local raw/file provider enrichment plus invalid provider/network/source combinations.
- [X] T009-S2 Prove Blockfrost credentials come only from matching portable-vault entries and Koios retains anonymous or matching-vault policy.
- [X] T010-S2 Prove offline CLI output stays unchanged and provider/secret failures retain typed, redacted results across argv, environment, stdout/stderr, and temporary files.
- [X] T011-S2 Wire local provider/network options through the thin CLI into Slice 1's public Node input without CLI endpoint, response-decoder, CBOR, or ledger logic.
- [X] T012-S2 Extend installed foreign-CWD and architecture/WebUI parity proof for the single shared context resolver and complete/partial/incomplete evidence.
- [X] T013-S2 Run `nix run .#ci-node-api`, `nix run .#ci-node-package`, `nix run .#ci-inspector-playwright`, and `./gate.sh` (parent-authorized tracked #87 exception: issue-specific checks green; WebUI/gate each 100 passed, one unrelated RDF init race).
- [X] T014-S2 Commit exactly `feat(cli): enrich local transactions through providers` with `Tasks: T008, T009, T010, T011, T012, T013, T014`.

## Orchestrator-owned finalization

- [X] T015 Extend inherited `gate.sh` with issue-specific local-provider inventory and Node API/package/WebUI proof without replacing inherited commands.
- [ ] T016 Audit issue acceptance, unchanged offline behavior, source-byte preservation, shared-provider uniqueness, context truth states, vault policy, redaction, csk-101 scope isolation, and task/commit links.
- [ ] T017 Run final `./gate.sh` and commit-message audit, update and push draft PR #106, and verify fresh GitHub Actions on the pushed SHA.
- [ ] T018 Run the named packaged-CLI Koios live-boundary smoke and record a redacted transcript with provider/context counts and truthful verdict.
- [ ] T019 Only after local gate, live smoke, and fresh remote CI are green, stamp finalization tasks while dropping `gate.sh` in `chore: drop gate.sh (ready for review)`, mark PR #106 ready, report `COMPLETE`, and do not merge.
