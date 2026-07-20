# Tasks: Offline CLI and Node API

## Slice 1 — Shared offline services and checked parity

- [x] T001-S1 Add a failing PureScript test that maps every checked inventory ID to its shared service and proves representative invalid-input typing.
- [x] T002-S1 Add `Cardano.Offline.Address`, `.Mnemonic`, `.Key`, `.Script`, and `.Payload` as delegation-only facades over the existing authoritative modules.
- [x] T003-S1 Move the WebUI imports to the offline facades without visible behavior change and add the inventory correspondence check.
- [x] T004-S1 Run the focused PureScript proof and `./gate.sh`, then commit exactly `refactor(offline): share backend-independent services` with `Tasks: T001, T002, T003, T004`.

## Slice 2 — Importable ESM package and package-relative engine

- [x] T005-S2 Add a failing Node test for named ESM exports, stable typed failures, and canonical vector equality from a foreign current working directory.
- [x] T006-S2 Add the delegation-only ESM API and normalize PureScript results without implementing Cardano, crypto, CBOR, or validation semantics in JavaScript.
- [x] T007-S2 Resolve the pinned WASI artifact relative to the installed module and type missing/incompatible/protocol failures with no fallback.
- [x] T008-S2 Build and install a packable `@lambdasistemi/cardano-swiss-knife` ESM artifact through the flake, including the WASM asset and no new runtime dependency.
- [x] T009-S2 Run the focused API/package proof and `./gate.sh`, then commit exactly `feat(node): expose offline ESM API` with `Tasks: T005, T006, T007, T008, T009`.

## Slice 3 — CLI command families over #69 bootstrap

- [X] T010-S3 Consume #69 release commit `8623f81088509fc047243e6c58d9462da8068cf9`, reconcile `cli/csk.mjs`, `cli/vault-host.mjs`, the built-package csk/Nix app wiring, the test-registry merge, handler, package, and CLI-test paths, and preserve its vault compatibility tests.
- [X] T011-S3 Add failing command tests covering every inventory mapping, JSON/human output, exit codes, and the #69 stdin/vault/fd secret descriptors.
- [X] T012-S3 Implement address, mnemonic, key, script, and payload handlers as thin calls to the shared ESM/PureScript services, preserving the engine's structured domain failures across the shared WASI boundary.
- [X] T013-S3 Wire handlers into #69's released registry/root without changing its vault schema, crypto, parser ownership, or secret-source semantics.
- [X] T014-S3 Run the focused CLI contract proof and `./gate.sh`, then commit exactly `feat(cli): expose offline capability commands` with `Tasks: T010, T011, T012, T013, T014`.

## Slice 4 — Offline portability and cross-OS gates

- [X] T015-S4 Add a failing packed-artifact smoke that detects CWD-dependent WASM discovery, network access, secret leakage, or native addon/build hooks.
- [X] T016-S4 Make the package/API/CLI pass the foreign-directory network-denial smoke without semantic fallback.
- [X] T017-S4 Add flake-owned package checks/apps; the orchestrator separately extends, never replaces, the existing `gate.sh` check list.
- [X] T018-S4 Add Node 22+ Linux/macOS/Windows CI smokes using the same portable package command and preserve the mandatory Nix dev-shell gate.
- [X] T019-S4 Run the package smoke, `nix develop --quiet -c just ci`, and `./gate.sh`, then commit exactly `ci(node): prove offline package portability` with `Tasks: T015, T016, T017, T018, T019`.

## Orchestrator-owned finalization

- [X] T020 Audit every inventory row against PureScript, ESM, CLI, vectors, and typed failures; verify no open implementation task remains.
- [X] T021 Run the final gate and commit-message audit, update the draft PR body with proof and residual risk, and remove `gate.sh` only under the resolve-ticket finalization rule.
- [X] T022 Push the finalized branch, mark the PR ready, report `COMPLETE`, and do not merge.

## Slice 5 — Final-audit package-check repair

- [X] T023-S5 Preserve the final-audit RED where `nix run .#ci-node-api` rebuilds in a clean sandbox and the foreign install fails by trying to resolve bundled runtime dependencies from an empty offline npm cache.
- [X] T024-S5 Make the flake-owned Node API check consume the exact dependency-free `node-package` tarball produced by Nix, without network access or a second packaging contract.
- [X] T025-S5 Run the Node API check, package smoke, and `./gate.sh`, then commit exactly `fix(node): check the packed API artifact` with `Tasks: T023, T024, T025`.
