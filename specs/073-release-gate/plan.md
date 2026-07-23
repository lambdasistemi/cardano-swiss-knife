# Implementation Plan: Parity-Gated Release Artifacts

## Technical approach

Treat release metadata as executable architecture. Versioned JSON manifests are
the reviewed source of truth, while Node-based checkers compare them with real
source exports, CLI routes, WebUI/shared-module anchors, proof fixtures, and
`flake.lock`. Negative self-tests prove the checkers fail rather than merely
matching today’s tree.

Keep packaging derivations Nix-owned and Node-22-pinned. Build one universal npm
artifact once, smoke that artifact on each hosted OS, and derive `packages.csk`,
`apps.csk`, release bundle, and checksum evidence from the same node-api output.
Keep `package.json` as the sole version authority; every host derives it and
tagged publication verifies `v${version}` before any external write.

## Architectural constraints

- WebUI, CLI, and Node remain thin hosts over `lib/src/Cardano/**`.
- Provider HTTP policy remains solely in `Cardano.Provider`.
- Address/crypto semantics remain in `cardano-addresses.wasm`.
- Conway ledger, CBOR, validation, witness attachment, and embedded Plutus
  execution remain in `wasm-tx-inspector.wasm`.
- RDF/SPARQL/SHACL semantics remain in the Rust RDF-shapes engine.
- Missing or incompatible engines fail explicitly; no semantic fallback exists.
- Workers never edit `specs/073-release-gate/**`, `gate.sh`, or PR metadata.

## Slice sequence

### Slice 1 — Capability and engine manifests

Lowest-blast-radius calibration slice. Add reviewed machine-readable inventories
and a focused checker/test that proves schema completeness, unique IDs, source
anchors, current flake pins/hashes, all three host mappings for parity rows, and
explicit classification of exclusions. No Nix, package, workflow, or host
runtime changes.

**Owned files**:

- `release/capabilities.json`
- `release/engines.json`
- `scripts/check-release-manifests.mjs`
- `node/test/release-manifests.test.mjs`

**Focused command**:

`node --test node/test/release-manifests.test.mjs`

**Commit**:

`feat(release): add capability and engine manifests`

### Slice 2 — Parity and architecture release gates

Add cross-host parity fixture enforcement, expand the semantic-fallback boundary
with negative self-tests, and wire the manifest/parity/architecture checks into
the development CI aggregation. The checker must detect a removed host mapping,
fixture divergence, pin drift, prohibited dependency, or fallback marker.

**Owned files**:

- `release/capabilities.json`
- `scripts/check-release-manifests.mjs`
- `scripts/check-release-parity.mjs`
- `scripts/check-architecture-boundary.sh`
- `node/test/fixtures/release-parity.json`
- `node/test/release-manifests.test.mjs`
- `node/test/release-parity.test.mjs`
- `justfile`

**Focused command**:

`nix develop --quiet -c just release-gates`

**Commit**:

`test(release): enforce cross-host parity boundaries`

### Slice 3 — Portable package and Nix entry points

Expose `packages.csk` and keep `apps.csk` backed by the same Node-22 package.
Produce a universal release bundle and checksums, strengthen foreign-directory
package smokes for every engine and book/registry asset, and include packaging
proof in `just ci`.

**Owned files**:

- `flake.nix`
- `nix/purescript.nix`
- `nix/packages/default.nix`
- `nix/apps/csk.nix`
- `nix/apps/default.nix`
- `nix/checks/default.nix`
- `node/test/package-smoke.mjs`
- `scripts/check-node-package.sh`
- `scripts/check-release-package.mjs`
- `node/test/release-package.test.mjs`
- `justfile`

**Focused command**:

`nix develop --quiet -c just release-package`

**Commit**:

`feat(package): add portable csk release artifacts`

### Slice 4 — Single-version runtime contract

Export the package version through Node, implement packaged `csk --version`,
verify the WebUI stamp and Nix metadata use the same value, and add negative
version-mismatch tests. Release Please continues to bump `package.json` and
lock metadata; no second authored version is introduced.

**Owned files**:

- `package.json`
- `package-lock.json`
- `node/src/version.js`
- `node/src/index.js`
- `node/src/index.d.ts`
- `cli/csk.mjs`
- `nix/purescript.nix`
- `nix/wasm-ui.nix`
- `scripts/check-release-version.mjs`
- `node/test/version.test.mjs`
- `justfile`

**Focused command**:

`nix develop --quiet -c just release-version`

**Commit**:

`feat(release): expose one version across all hosts`

### Slice 5 — Tagged publication and cross-platform clean install

Extend Release Please’s workflow so a created tag first verifies version and
artifacts, then publishes the scoped npm tarball and uploads the universal
bundle plus checksums to that exact GitHub release. Make the existing Node 22
Linux/macOS/Windows job discover the built tarball without a hard-coded version.
Add a static workflow contract and wire it into `just ci`.

**Owned files**:

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/workflows/pages.yml`
- `scripts/check-release-workflows.mjs`
- `node/test/release-workflows.test.mjs`
- `justfile`

**Focused command**:

`nix develop --quiet -c just release-workflows`

**Commit**:

`ci(release): publish tagged npm and bundle artifacts`

### Slice 6 — Operator manual and architectural hazard

Publish a capability/engine map and complete operator path for npm/Nix install,
commands/APIs, vault migration and credentials, outputs, versions, checksums,
engine failures, and troubleshooting. Make semantic drift and silent fallback
explicit hazards. Add a documentation contract and strict MkDocs proof.

**Owned files**:

- `README.md`
- `mkdocs.yml`
- `docs/installation.md`
- `docs/user/usage.md`
- `docs/user/vault.md`
- `docs/user/versions.md`
- `docs/architecture/system.md`
- `docs/architecture/release-flow.md`
- `docs/dev/releasing.md`
- `docs/reference/capabilities.md`
- `docs/reference/engines.md`
- `docs/troubleshooting.md`
- `scripts/check-release-docs.mjs`
- `node/test/release-docs.test.mjs`
- `justfile`

**Focused command**:

`nix develop --quiet -c just release-docs`

**Commit**:

`fix(docs): publish the release operator manual`

## Verification strategy

Every slice follows RED → GREEN with navigator approval at both barriers, then
`./gate.sh`. The ticket owner independently reads the actual focused/gate logs,
re-runs ambiguous commands, verifies literal navigator approval and
`NAVIGATOR-VERIFIED`, reviews the full commit, stamps the matching tasks into
that commit, and only then pushes.

Final proof includes:

1. `nix develop --quiet -c just ci`;
2. `nix build .#csk .#node-package .#release-bundle`;
3. `nix run .#csk -- --help` and `--version`;
4. npm tarball listing and foreign-directory smoke;
5. checksum verification against actual release bundle contents;
6. strict docs build;
7. fresh GitHub checks on the final pushed SHA, including all three Node 22
   operating-system smokes.

The inherited Playwright step may take 7–8 minutes. If a worker tool call is
terminated, the ticket owner runs the same gate in a persistent terminal and
records the real log rather than accepting the worker’s claim.
