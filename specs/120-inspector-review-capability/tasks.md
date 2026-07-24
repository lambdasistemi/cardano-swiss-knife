# Tasks: Inspector-owned signer review capability

## Slice 1 — Canonical Node review capability

- [x] T001 Add packaged RED coverage proving `reviewTransaction` is exported and the currently pinned engine cannot satisfy the canonical `tx.review` contract.
- [x] T002 Add RED coverage for exact inspector envelope/category/evidence/status pass-through, CBOR/TextEnvelope equality, offline no-network behavior, and provider credential redaction.
- [x] T003 Add RED book-path coverage for protocol/user ordering, typed unreadable/invalid failures, omission of imported books, relevant label resolution, and an off-transaction sentinel label.
- [x] T004 Advance `flake.lock` to the merged inspector `b99028a` delivery and admit `tx.review` through the packaged WASI dispatcher.
- [x] T005 Extend the existing RDF resolver with transaction-only term filtering used by review, leaving every existing caller's behavior unchanged.
- [x] T006 Expose provider-aware `reviewTransaction` with ordered Turtle path inputs, exact envelope pass-through, additive filtered resolutions, and no host-side semantic composition.
- [x] T007 Publish the TypeScript/JSDoc review options and result contract without adding synthesized readiness or secret-bearing fields.
- [x] T008 Run `nix run .#ci-node-api` and `./gate.sh`, then commit exactly `feat(node): expose canonical transaction review` with the required task trailer.

## Slice 2 — Replace the legacy review consumer

- [ ] T009 Add RED CLI coverage proving review forwards existing book paths, consumes the canonical envelope, and emits a deterministic raw canonical golden.
- [ ] T010 Replace `commands/tx.js`'s inspect/intent/witness-plan/validate composition with direct delegation to `reviewTransaction`.
- [ ] T011 Pass existing review `--book` paths as `userBooks` while preserving current in-memory book handling for non-review commands.
- [ ] T012 Replace the legacy composite renderer with the authorized raw canonical dump, with no new flags, JSON-output contract, readiness synthesis, or richer #121 rendering.
- [ ] T013 Prove the CLI result omits a full book dump and secret material while existing review usage/error behavior remains fail closed.
- [ ] T014 Run `nix run .#ci-node-api` and `./gate.sh`, then commit exactly `refactor(cli): consume canonical transaction review` with the required task trailer.
