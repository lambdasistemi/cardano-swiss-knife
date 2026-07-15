# Tasks — Issue 18 unified MD3 shell

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), and [route-storage-contract.md](contracts/route-storage-contract.md)

**Execution**: Each numbered slice is one driver+navigator RED/GREEN cycle and one bisect-safe commit. The orchestrator marks a slice's tasks complete only after reviewing its final diff and running the required proof. Slice 6 is the only slice permitted to delete legacy-shell files.

## Slice 1 — Unified build and route foundation

**Goal**: Build the MD3 workspace with the shared address package and make address WASM/direct routes safe at deployed subpaths without publishing unfinished navigation.

**Independent proof**: A browser test first fails because a deep compatibility route cannot load the address WASM, then passes against the unified inspector artifact; the inspector build and existing suites remain green.

- [X] T001-S1 [US1] Add the failing deep-route address-WASM browser case, then retain it as regression coverage in `docs/inspector/tests/tx-identify.spec.mjs`.
- [X] T002-S1 [US4] Wire `docs/inspector/spago.yaml`, `docs/inspector/spago.lock`, `docs/inspector/package.json`, and `docs/inspector/package-lock.json` to the local `lib` package and its runtime dependencies.
- [X] T003-S1 [US1] Publish a base-path-safe address-WASM URL from `docs/inspector/src/bootstrap.js`; consume it while preserving Node fallback in `lib/src/Cardano/Address/Bootstrap.js`, `lib/src/Cardano/Address/Derivation.js`, `lib/src/Cardano/Address/Inspect.js`, `lib/src/Cardano/Address/Signing.js`, and `lib/src/Cardano/Address/Wasm.js`; add compatible direct-route generation in `docs/inspector/src/Routing.purs` and `docs/inspector/src/Routing.js`.
- [X] T004-S1 [US1] Package the unified runtime and its route assets in `flake.nix`, `nix/wasm-ui.nix`, and `nix/apps/combined-site-smoke.nix`; prove `nix build .#tx-inspector-ui --no-link`, `nix run .#ci-inspector-playwright`, `nix run .#ci-combined-site-smoke`, and `./gate.sh`.

**Commit**: `build: unify MD3 runtime foundation` with `Tasks: T001, T002, T003, T004`.

## Slice 2 — Addresses and Scripts in MD3

**Goal**: Make the complete address and native-script workflows live in MD3 while the legacy root shell remains published.

**Independent proof**: Focused browser cases demonstrate address inspection and native-script author/analyze behavior through MD3 routes before the complete inspector suite and gate pass.

- [X] T005-S2 [P] [US4] Add RED-first address and native-script parity cases in `docs/inspector/tests/unified-address-scripts.spec.mjs` and register them in `docs/inspector/playwright.config.mjs`.
- [X] T006-S2 [US4] Port the address inputs, actions, results, errors, and shared-library calls into the Addresses destination in `docs/inspector/src/Main.purs`.
- [X] T007-S2 [US4] Port native-script authoring and analysis into Scripts, then complete its routing, shell navigation hook, and responsive MD3 presentation in `docs/inspector/src/Main.purs`, `docs/inspector/src/Routing.purs`, `docs/inspector/src/Routing.js`, `docs/inspector/src/Shell.purs`, and `docs/inspector/dist/styles.css`.
- [X] T008-S2 [US1] Prove the focused cases, `nix run .#ci-inspector-playwright`, and `./gate.sh` while confirming the legacy `app` tree remains present.

**Commit**: `feat: migrate addresses and scripts to MD3` with `Tasks: T005, T006, T007, T008`.

## Slice 3 — Keys workflow in MD3

**Goal**: Provide Mnemonic, Restore, Expert, and Sign & verify as in-page Keys tabs with full legacy behavior.

**Independent proof**: RED-first browser cases cover all four tabs, mnemonic-to-restore handoff, network/path behavior, hidden private output, and generic sign/verify.

- [ ] T009-S3 [P] [US1] Add RED-first four-tab Keys parity cases in `docs/inspector/tests/unified-keys.spec.mjs` and register them in `docs/inspector/playwright.config.mjs`.
- [ ] T010-S3 [US4] Port Mnemonic and family-first Restore state, actions, validation, network/path handling, handoff, visibility controls, and shared-library operations into `docs/inspector/src/Main.purs`.
- [ ] T011-S3 [US4] Port Expert and Sign & verify, and complete Keys tab routing, navigation, and responsive presentation in `docs/inspector/src/Main.purs`, `docs/inspector/src/Routing.purs`, `docs/inspector/src/Routing.js`, `docs/inspector/src/Shell.purs`, and `docs/inspector/dist/styles.css`.
- [ ] T012-S3 [US1] Prove the focused cases, `nix run .#ci-inspector-playwright`, and `./gate.sh` while confirming vault actions still remain on the legacy shell until slice 4.

**Commit**: `feat: migrate key workflows to MD3` with `Tasks: T009, T010, T011, T012`.

## Slice 4 — Vault-only persistent secret storage

**Goal**: Reuse the encrypted vault in MD3, connect compatible consumers, and eliminate all cleartext secret persistence.

**Independent proof**: RED-first browser cases round-trip each supported secret kind, reload and inspect storage, scrub legacy keys, and exercise locked/error behavior without exposing a secret.

- [ ] T013-S4 [P] [US2] Add RED-first vault compatibility, reload/storage-audit, legacy-key-scrub, and error-path cases in `docs/inspector/tests/unified-vault.spec.mjs` and `docs/inspector/tests/tx-identify.spec.mjs`; register them in `docs/inspector/playwright.config.mjs`.
- [ ] T014-S4 [US2] Reuse the existing encrypted file format and WebCrypto boundary in `docs/inspector/src/Vault.purs` and `docs/inspector/src/Vault.js`; add Vault create/open/save/lock plus compatible load/pop shelves to `docs/inspector/src/Main.purs`.
- [ ] T015-S4 [US2] Remove provider credential get/set and persistence-toggle behavior, preserve only non-secret preferences, and implement deletion-only migration for `blockfrost_project_id`, `koios_bearer_token`, and `persist_api_keys` in `docs/inspector/src/FFI/Storage.purs`, `docs/inspector/src/FFI/Storage.js`, and `docs/inspector/src/Main.purs`.
- [ ] T016-S4 [US1] Complete Vault routing/navigation/styles in `docs/inspector/src/Routing.purs`, `docs/inspector/src/Routing.js`, `docs/inspector/src/Shell.purs`, and `docs/inspector/dist/styles.css`; prove focused cases, source/browser storage audits, `nix run .#ci-inspector-playwright`, and `./gate.sh`.

**Commit**: `feat: make vault the only secret store` with `Tasks: T013, T014, T015, T016`.

## Slice 5 — Workbench signing loop

**Goal**: Complete witness plan → compatible key → local signature → authoritative witness attachment → patched CBOR in Workbench.

**Independent proof**: A RED-first browser case derives and vaults a matching key, loads it into Workbench, attaches one new vkey witness, and shows the detached witness, signer match, attachment action, and patched CBOR.

- [ ] T017-S5 [P] [US3] Add the RED-first end-to-end signing-loop and local-validation/error cases in `docs/inspector/tests/unified-signing-loop.spec.mjs` and register them in `docs/inspector/playwright.config.mjs`.
- [ ] T018-S5 [US3] Port the local body-hash signing and detached-witness encoding boundary into `docs/inspector/src/TxSigning.purs` and `docs/inspector/src/TxSigning.js`, preserving `cardano-ledger-functional/v1` as the only attachment engine.
- [ ] T019-S5 [US3] Connect Workbench witness-plan state, derived/vault key selection, signer matching, `tx.witness.attach`, patched-CBOR state, errors, and honest result rendering in `docs/inspector/src/Main.purs` and `docs/inspector/dist/styles.css`.
- [ ] T020-S5 [US3] Prove the focused case adds exactly one vkey witness, then run `nix run .#ci-inspector-playwright` and `./gate.sh` with the legacy shell still present.

**Commit**: `feat: close workbench signing loop` with `Tasks: T017, T018, T019, T020`.

## Slice 6 — Unified publication and legacy deletion

**Goal**: Retarget every pre-existing proof, publish one MD3 artifact at canonical and compatibility paths, and only then remove the legacy shell.

**Independent proof**: All 73 pre-existing browser cases plus new cases pass against the unified artifact, 9 UX captures and route smoke pass, the secret audit is clean, and the legacy source is absent.

- [ ] T021-S6 [P] [US4] RED-first retarget all 18 legacy cases in `tests/inspect.spec.ts`, `tests/mnemonic.spec.ts`, `tests/derivation.spec.ts`, `tests/legacy-bootstrap.spec.ts`, `tests/signing.spec.ts`, `tests/scripts.spec.ts`, `tests/vault.spec.ts`, and `tests/transactions.spec.ts`, plus `playwright.config.ts`, to the approved unified homes; make exact navigation/order and compatibility coverage fail before cutover.
- [ ] T022-S6 [US1] Expose exactly `Workbench`, `Addresses`, `Keys`, `Scripts`, `Vault`, `Library`, `Settings`; serve one artifact at root, direct routes, and `/inspector/` compatibility entries; update `docs/inspector/src/Main.purs`, `docs/inspector/src/Shell.purs`, `docs/inspector/src/Routing.purs`, `docs/inspector/src/Routing.js`, `docs/inspector/dist/index.html`, `docs/inspector/dist/styles.css`, `docs/inspector/tests/tx-identify.spec.mjs`, `docs/inspector/playwright.config.mjs`, `tools/ux-judge/capture.mjs`, `flake.nix`, `spago.lock`, `package.json`, `package-lock.json`, `nix/purescript.nix`, `nix/packages/default.nix`, `nix/checks/playwright.nix`, `nix/apps/default.nix`, `nix/apps/inspector-playwright.nix`, `nix/apps/ux-capture.nix`, and `nix/apps/combined-site-smoke.nix`.
- [ ] T023-S6 [US4] After T021 passes against the unified source, delete only the now-duplicate legacy files: `app/spago.yaml`, `app/shims/fs.cjs`, `app/shims/path.cjs`, `app/src/App.purs`, `app/src/App.js`, `app/src/Main.purs`, `app/src/App/Vault.purs`, `app/src/App/Vault.js`, every file under `app/src/TxInspector/`, and `dist/index.html`; remove their build wiring without deleting shared `lib` operations.
- [ ] T024-S6 [US4] Prove all 73 pre-existing plus new browser cases, all 9 UX captures, canonical/compatibility route smoke, source/browser secret audit, unchanged MIT licensing, `nix run .#ci-inspector-playwright`, `nix run .#ci-playwright`, `nix run .#ci-ux-capture`, `nix run .#ci-combined-site-smoke`, and final `./gate.sh`.

**Commit**: `refactor: publish the unified MD3 shell` with `Tasks: T021, T022, T023, T024`.

## Dependency and parallelism notes

- Slices execute strictly S1 → S2 → S3 → S4 → S5 → S6 because each builds on the preceding MD3 state.
- `[P]` marks test work that may be drafted independently within its slice, but RED must be observed before the matching implementation starts.
- Slice 4 depends on the Keys consumers from slice 3; slice 5 depends on both Keys and Vault.
- Slice 6 may start by retargeting tests, but T023 is blocked until every mapped surface is live and the rewired tests have passed against the unified source.
- Workers must not edit `specs/18-unify-shells-md3/`, `gate.sh`, issue/PR metadata, sibling worktrees, or engine repositories; those remain orchestrator-owned or out of scope.
