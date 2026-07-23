# Tasks: Parity-Gated Release Artifacts

## Bootstrap and planning — orchestrator-owned

- [X] T000 Create the isolated branch, append-only `gate.sh`, and draft PR.

## Slice 1 — Capability and engine manifests

- [X] T001 Add versioned capability and engine manifest data with all required parity, exclusion, provenance, protocol, responsibility, and embedded-Plutus fields.
- [X] T002 Add a focused executable checker with negative tests for schema gaps, missing host/source anchors, duplicate IDs, and flake revision/hash drift.
- [X] T003 Record focused and full-gate evidence, obtain navigator verification, and commit as `feat(release): add capability and engine manifests`.

## Slice 2 — Parity and architecture release gates

- [X] T004 Add normalized cross-host parity fixture enforcement and negative divergence proof.
- [X] T005 Expand architecture-boundary enforcement and negative fixtures for prohibited semantic dependencies, direct engine bypass, and silent fallback.
- [X] T006 Wire manifest, parity, and architecture proofs into `just release-gates` and `just ci`.
- [X] T007 Record focused and full-gate evidence, obtain navigator verification, and commit as `test(release): enforce cross-host parity boundaries`.

## Slice 3 — Portable package and Nix entry points

- [X] T008 Expose Node-22-backed `packages.csk` and `apps.csk` from one packaged distribution.
- [X] T009 Build a universal release bundle and deterministic checksums from the npm/Node artifacts.
- [X] T010 Extend package-relative foreign-directory smokes to all authoritative engine and book/registry assets and include packaging in `just ci`.
- [X] T011 Record focused builds/smokes and full-gate evidence, obtain navigator verification, and commit as `feat(package): add portable csk release artifacts`.

## Slice 4 — Single-version runtime contract

- [X] T012 Export the `package.json` version through Node and packaged `csk --version` without introducing a second version authority.
- [X] T013 Verify WebUI, npm, Nix, CLI, Node, release manifest, tag-shaped input, and artifact names agree, including negative mismatch tests.
- [X] T014 Wire version proof into `just ci`, record focused/full-gate evidence, obtain navigator verification, and commit as `feat(release): expose one version across all hosts`.

## Slice 5 — Tagged publication and cross-platform clean install

- [X] T015 Gate tagged publication on Release Please’s created release and exact tag/package/artifact version agreement.
- [X] T016 Publish the scoped npm tarball and attach the universal Node bundle plus checksums to the matching GitHub release.
- [X] T017 Make Linux/macOS/Windows Node 22 clean-install smokes consume the exact CI-built tarball without a hard-coded version.
- [X] T018 Add a static workflow contract to `just ci`, record focused/full-gate evidence, obtain navigator verification, and commit as `ci(release): publish tagged npm and bundle artifacts`.

## Slice 6 — Operator manual and architectural hazard

- [X] T019 Publish the generated/reviewed capability and engine reference mapping every parity surface and authoritative artifact.
- [X] T020 Document npm/Nix installation, commands/APIs, vault migration and credentials, outputs/errors, versions/checksums, and troubleshooting.
- [X] T021 Make host/engine ownership, embedded Plutus, semantic drift, fail-hard incompatibility, and no-fallback behavior conspicuous and executable through a docs contract.
- [X] T022 Wire strict docs proof into `just ci`, record focused/full-gate evidence, obtain navigator verification, and commit as `fix(docs): publish the release operator manual`.

## Finalization — orchestrator-owned

- [ ] T023 Independently run the full local gate and inspect its actual log.
- [ ] T024 Build and inspect the npm tarball, `packages.csk`/`apps.csk`, universal bundle, and checksums outside the checkout.
- [ ] T025 Push final HEAD and verify every fresh GitHub check is green on that exact SHA.
- [ ] T026 Audit PR metadata and commit/task linkage, drop `gate.sh`, mark PR ready, and report completion without merging.
