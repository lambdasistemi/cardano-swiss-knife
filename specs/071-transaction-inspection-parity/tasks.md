# Tasks: Transaction Inspection Parity

## Slice 1 — Offline transaction engine and Node API

- [X] T001-S1 Add failing installed-Node tests for raw CBOR and shared TextEnvelope equality across inspect, browse, identify, and intent.
- [X] T002-S1 Prove raw operations attempt no network access and missing, incompatible, execution, and protocol ledger-engine failures are typed.
- [X] T003-S1 Add the delegation-only transaction input facade and package-relative Node ledger-inspector WASI runner with no host CBOR/ledger fallback.
- [X] T004-S1 Export `inspectTransaction`, `browseTransaction`, `identifyTransaction`, and `transactionIntent` through the existing ESM result envelope.
- [X] T005-S1 Package the pinned ledger-inspector artifact beside the Node bundle and extend the flake-owned Node API check.
- [X] T006-S1 Run `nix run .#ci-node-api` and `./gate.sh`, then commit exactly `feat(node): expose offline transaction inspection` with `Tasks: T001, T002, T003, T004, T005, T006`.

## Slice 2 — Shared provider loading and context failures

- [X] T007-S2 Add RED fixtures for Blockfrost and Koios network mapping plus authentication, rate-limit, server, transport, and malformed/decode failures.
- [X] T008-S2 Add RED fixtures distinguishing complete, partial, and total producer/validation context outcomes with ordered unresolved identifiers.
- [X] T009-S2 Route transaction-hash loading and identify/intent context only through `Cardano.Provider` and expose its existing failure categories without credential leakage.
- [X] T010-S2 Prove mainnet, preprod, and preview for both providers and preserve the WebUI's shared provider consumption.
- [X] T011-S2 Run `nix run .#ci-test`, `nix run .#ci-node-api`, and `./gate.sh`, then commit exactly `feat(provider): share transaction loading and context` with `Tasks: T007, T008, T009, T010, T011`.

## Slice 3 — Shared book parsing and RDF resolution

- [X] T012-S3 Add RED tests for Turtle, CIP-57, `amaru.book.bundle.v1`, and store documents, including repeat order and rejected transactional imports.
- [X] T013-S3 Add RED treasury assertions for exact resolved labels/types beside unchanged address, key, and script raw identifiers.
- [X] T014-S3 Move book parsing and RDF query facades into shared modules consumed by WebUI and Node without copying semantic implementations.
- [X] T015-S3 Generate transaction graphs only with ledger-inspector `tx.rdf`, resolve only with the pinned RDF-shapes engine, and type its load/protocol failures without fallback.
- [X] T016-S3 Package the pinned RDF engine, expose ordered `books`/`resolutions` in Node results, and keep existing WebUI build/journeys compatible.
- [X] T017-S3 Run `nix run .#ci-node-api`, `nix build .#tx-inspector-ui --no-link`, and `./gate.sh`, then commit exactly `feat(transaction): resolve inspection books` with `Tasks: T012, T013, T014, T015, T016, T017`.

## Slice 4 — CLI, vault credentials, and packaged smokes

- [X] T018-S4 Add RED CLI tests for all four commands, exclusive raw/file/hash sources, browse paths, repeatable books, JSON/human output, and typed exit codes.
- [X] T019-S4 Add RED vault tests proving Blockfrost/Koios entry-kind selection and absence of credential values from argv, environment, output, errors, and temporary files.
- [X] T020-S4 Implement `csk tx inspect|browse|identify|intent` as thin ESM calls while preserving every #69/#70 command and vault behavior.
- [X] T021-S4 Extend the foreign installed-package smoke to cover raw CBOR and TextEnvelope CLI/API operations under network denial plus packaged ledger/RDF engine discovery.
- [X] T022-S4 Extend the architecture boundary proof so provider endpoints/decoders, ledger semantics, and RDF query semantics cannot appear in host code.
- [X] T023-S4 Run `nix run .#ci-node-api`, `nix run .#ci-node-package`, the packaged `csk` smoke, and `./gate.sh`, then commit exactly `feat(cli): expose transaction inspection commands` with `Tasks: T018, T019, T020, T021, T022, T023`.

## Orchestrator-owned finalization

- [X] T024 Append the focused Node API/package transaction checks to the inherited `gate.sh` without replacing any existing check or function.
- [X] T025 Audit all issue acceptance criteria, public exports/commands, provider fixtures, raw identifier truth, engine ownership, secret handling, and task/commit correspondence.
- [X] T026 Run the final gate and commit-message audit, update PR #89 with exact proof and residual risks, drop `gate.sh` only under the finalization rule, mark ready, report `COMPLETE`, and do not merge.
