# Tasks: Human-readable transaction review

## Slice 1 — Review composition, renderer, and integration proof

- [ ] T001 Add RED CLI coverage for the exact `tx review --tx-file --book ...` surface, provider/network pairing, offline no-request behavior, and typed malformed transaction/book failures.
- [ ] T002 Add a representative Amaru treasury book fixture and byte-exact terminal golden covering transaction identity, counts, ordered outputs/assets, fee, validity, change, collateral, signers, metadata, book resolutions, and incomplete preflight details.
- [ ] T003 Add provider-backed coverage over the existing complete Conway ledger fixture proving a completed preflight and preserved ledger verdict.
- [ ] T004 Compose existing inspection, intent, witness-plan, validation, provider-context, book-import, and RDF-resolution results without adding host-side semantic fallbacks or a parallel provider path.
- [ ] T005 Add the deterministic terminal renderer with stable sections/order and raw identifiers retained beside optional labels.
- [ ] T006 Wire `csk tx review` to exactly one `--tx-file`, repeated `--book`, and the existing paired provider/network plus vault credential policy while keeping offline default behavior.
- [ ] T007 Document the terminal review command, completed versus incomplete preflight semantics, and explicit-provider behavior.
- [ ] T008 Run `nix run .#ci-node-api` and `./gate.sh`, recording raw RED and GREEN evidence.
- [ ] T009 Commit exactly `feat(cli): add human-readable transaction review` with the required task trailer.

## Orchestrator-owned finalization

- [ ] T010 Independently audit the full diff, raw test/gate logs, navigator approval, issue acceptance, typed failure taxonomy, no-fallback boundary, and task/commit links.
- [ ] T011 Push the accepted slice, update draft PR #112 with delivered behavior and proof, and verify fresh remote CI on the pushed SHA.
- [ ] T012 After local and remote proof are green, stamp finalization tasks while dropping `gate.sh` in `chore: drop gate.sh (ready for review)`, mark PR #112 ready, report `COMPLETE`, and do not merge.
