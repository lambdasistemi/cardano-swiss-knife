# Implementation Plan: Offline CLI and Node API

**Branch**: `feat/70-offline-cli-node-api` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

## Summary

Define five host-neutral PureScript facades over the existing address,
mnemonic, derivation/bootstrap, script, and signing modules; move the WebUI to
those facades; bundle an ergonomic ESM API with package-relative
`cardano-addresses` WASI discovery; integrate command handlers into #69's CLI
root only after its release signal; then prove pack portability, offline
behavior, cross-host vectors, native-addon absence, and Node 22+ OS coverage.

## Technical context

**Language/Version**: PureScript 0.15.16 and ESM on Node 22+

**Primary dependencies**: existing Spago packages, esbuild, Node standard library,
`@bjorn3/browser_wasi_shim`, and pinned Nix `cardano-addresses` WASI artifact

**Testing**: PureScript test package, Node built-in test runner or existing
Playwright harness as appropriate, Haskell-derived `test-vectors/vectors.json`,
package-install smokes, and `./gate.sh`

**Target platforms**: WebUI plus Node 22+ on representative Linux, macOS, and Windows

**Constraints**: no new semantic implementation, no native addon, no network,
no argv/env secrets, package-relative WASM, no provider IO, no #69-owned file
until the release answer identifies the integration contract

## Current state and seams

- WebUI address/key/script/payload behavior already calls PureScript modules
  under `lib/src/Cardano`, but `Main.purs` imports individual low-level modules.
- Address inspection, derivation, bootstrap construction, and signing call the
  pinned WASI engine through FFI. Their Node loaders currently resolve a
  checkout-relative `dist/wasm/cardano-addresses.wasm`, which is not portable.
- Script behavior is parity-checked against Haskell-derived vectors. This ticket
  may wrap or route existing behavior but must not add a second parser, CBOR
  codec, validation algorithm, hash, or fallback implementation.
- The root package is private and browser-oriented; there is no importable
  package entry or CLI bin yet.
- #69 owns CLI bootstrap/root/parser and secret-source plumbing. Release answer
  `A-001-waiting-on-vault-bootstrap.md` identifies commit
  `8623f81088509fc047243e6c58d9462da8068cf9` on
  `feat/69-portable-age-vault` as the integration baseline and permits
  extensions to `cli/csk.mjs`, `cli/vault-host.mjs`, `nix/apps/csk.nix`, and
  `nix/apps/default.nix`. The existing `test/vault-cli.test.mjs` and
  `test/vault-cross-host.test.mjs` define compatibility conventions and remain
  reference tests rather than #70-owned semantics.

## Design

### Shared service boundary

Create `Cardano.Offline.Address`, `.Mnemonic`, `.Key`, `.Script`, and `.Payload`.
They expose the inventory with host-neutral inputs/results and delegate to the
existing modules. The WebUI imports these facades, making parity structural.
Direct PureScript tests consume the committed Haskell-derived vectors and cover
typed invalid input.

### ESM contract

The package root exports named async/sync functions grouped by the same five
families and a typed `CskError`/result contract. Node wrappers normalize
PureScript `Either`, `Maybe`, `Effect`, and `Aff` values without reimplementing
domain semantics. The package build bundles compiled PureScript/FFI and copies
the pinned WASI artifact beside the ESM output. Runtime discovery uses
`import.meta.url`; process CWD is irrelevant. Missing/incompatible engines and
bad protocol output become stable engine failure codes.

### CLI contract

Command handlers call the ESM/shared services and return a renderer-neutral
result. #69's parser supplies root routing, JSON/human selection, stdin/vault/fd
secret sources, and common usage behavior. Public inputs may be ordinary parser
values; mnemonic/private-key material may only arrive through the #69 secret
descriptor. JSON uses a versioned envelope and exit codes distinguish usage,
domain input/validation, secret-source, and engine failures.

### Proof boundary

The package-install smoke installs `npm pack` output into a temporary foreign
directory, changes CWD, denies network access, and runs representative address,
key, script, sign, and verify calls. A package inspection rejects `.node` files,
`node-gyp`, native lifecycle scripts, and platform binary packages. GitHub CI
runs a portable Node 22 smoke on Linux, macOS, and Windows; Nix remains the
canonical Linux build/gate and also verifies the dev shell path.

## Slice plan

### Slice 1 — Shared offline services and checked parity

Add the five PureScript facades, direct vector/failure tests, and switch the
WebUI imports to the facades without changing visible behavior. Add an
inventory correspondence check that rejects missing service mappings.

**Owned files**:

- `lib/src/Cardano/Offline/Address.purs`
- `lib/src/Cardano/Offline/Mnemonic.purs`
- `lib/src/Cardano/Offline/Key.purs`
- `lib/src/Cardano/Offline/Script.purs`
- `lib/src/Cardano/Offline/Payload.purs`
- `docs/inspector/src/Main.purs`
- `test/src/Test/Offline.purs`
- `test/src/Test/Main.purs`
- `scripts/check-offline-capability-inventory.sh`

**Focused proof**: `nix develop --quiet -c npx spago test -p cardano-addresses-test`

### Slice 2 — Importable ESM package and package-relative engine

Add public ESM wrappers and typed errors, make the engine loader resolve the
packaged artifact relative to the module, build a packable Node artifact, and
test the ESM surface against the canonical vectors from a foreign CWD. Any
change to lockfiles must be mechanical and add no dependency.

**Owned files**:

- `node/src/index.js`
- `node/src/error.js`
- `node/test/api.test.mjs`
- `lib/src/Cardano/Address/Wasm.js`
- `lib/src/Cardano/Address/Inspect.js`
- `lib/src/Cardano/Address/Derivation.js`
- `lib/src/Cardano/Address/Bootstrap.js`
- `lib/src/Cardano/Address/Signing.js`
- `package.json`
- `package-lock.json`
- `nix/purescript.nix`
- `nix/packages/default.nix`
- `nix/checks/default.nix`
- `nix/apps/default.nix`
- `flake.nix`

**Focused proof**: the new flake-owned Node API check plus a direct temporary
`npm pack` install/import from a foreign CWD.

### Slice 3 — CLI command families over #69 bootstrap

Integrate the exact #69 release commit as the stacked dependency baseline, then
add handlers for every inventory ID with stable human/JSON output, exit mappings,
and stdin/inherited-FD/vault secret descriptors. Preserve the #69 vault command
surface and vault tests unchanged in behavior; extend its released root and host
adapter without changing vault schema, encryption, migration, or persistence
semantics.

**Owned files reconciled from the release answer**:

- `cli/csk.mjs`
- `cli/vault-host.mjs`
- `node/src/commands/address.js`
- `node/src/commands/mnemonic.js`
- `node/src/commands/key.js`
- `node/src/commands/script.js`
- `node/src/commands/payload.js`
- `lib/src/Cardano/Address/Wasm.js` (preserve structured engine domain failures
  when the CLI delegates invalid input)
- `lib/src/Cardano/Address/Inspect.js` (same shared WASI exit contract)
- `lib/src/Cardano/Address/Derivation.js` (same shared WASI exit contract)
- `lib/src/Cardano/Address/Bootstrap.js` (same shared WASI exit contract)
- `lib/src/Cardano/Address/Signing.js` (same shared WASI exit contract)
- `node/test/cli.test.mjs`
- `nix/apps/csk.nix`
- `nix/apps/default.nix`
- `nix/purescript.nix` (install the built CLI beside the packaged API/WASM)
- `flake.nix` (pass the packaged Node artifact to the csk app)
- `test/src/Test/Main.purs` (mechanical merge resolution retaining both test registries)
- `package.json`
- `package-lock.json`

**Reference-only compatibility files**:

- `test/vault-cli.test.mjs`
- `test/vault-cross-host.test.mjs`

**Focused proof**: the new CLI contract test covering every command family,
JSON/human modes, typed failures, exit codes, and non-argv secret sources,
followed by the two #69 vault CLI compatibility tests and a direct
`nix run .#csk` proof against the built package/WASM closure.

### Slice 4 — Offline portability and cross-OS gates

Add the network-denial/package inspection smoke, flake-owned checks/apps, and a
GitHub Node 22 matrix for Linux/macOS/Windows. The ticket orchestrator extends
the shared `gate.sh` separately after the focused check exists. The smoke
must execute the packed CLI/API from outside the checkout and fail loudly on
network access or engine fallback.

**Owned files**:

- `node/test/package-smoke.mjs`
- `scripts/check-node-package.sh`
- `nix/checks/default.nix`
- `nix/apps/default.nix`
- `nix/packages/default.nix`
- `flake.nix`
- `.github/workflows/ci.yml`
- `justfile`
- `package.json`
- `package-lock.json`

**Focused proof**: flake-owned package smoke, `nix develop --quiet -c just ci`,
and local `./gate.sh`; GitHub matrix success is required before readiness.

### Slice 5 — Final-audit package-check repair

The orchestrator's T020 clean-store audit exposed that `ci-node-api` still
repacked the intermediate `node-api` directory and attempted an offline npm
resolution of dependencies already bundled by esbuild. Preserve that RED, then
make the API check install and mutate the exact dependency-free
`node-package` tarball built by Nix. This is a test/packaging-contract repair;
it must not change public API, CLI, Cardano, crypto, CBOR, or WASI semantics.

**Owned files**:

- `node/test/api.test.mjs`
- `nix/checks/node-api.nix`
- `nix/checks/default.nix`

**Focused proof**: `nix run .#ci-node-api` from a clean derivation rebuild,
followed by `nix run .#ci-node-package` and local `./gate.sh`.

## Dependency and ordering constraints

1. Slice 1 is independent and lands first.
2. Slice 2 depends on Slice 1 but not #69.
3. Slice 3 is blocked on the parent-forwarded #69 release answer. If it has not
   arrived after Slice 2, write `Q-NNN-waiting-on-vault-bootstrap` and park.
4. Slice 4 depends on the complete CLI and ESM surfaces.
5. One reviewed, bisect-safe commit per implementation slice; no fixup commits.

## Plan review: boundary smoke question

**What system boundary does this exercise that the unit suite cannot?** The
installed-package boundary: module-relative WASM discovery, executable/bin
layout, foreign CWD, OS path behavior, process stdin/fd handling, and actual
network denial. Slice 4 therefore ships a command-level packed-artifact smoke in
`./gate.sh` plus the GitHub OS matrix; unit/vector tests alone are insufficient.

## Risks and mitigations

- **#69 path conflict**: no root/parser edit before release; reconcile exact
  owned files through Q/A.
- **Semantic duplication**: wrappers may only translate host types and errors;
  architecture/inventory checks reject new Cardano/CBOR/crypto fallbacks.
- **WASM path drift**: prove `npm pack` install from a foreign CWD with no path
  environment override.
- **Secret leakage**: CLI tests inspect argv/env/output and use only controlled
  stdin, fd, or vault descriptors.
- **Cross-platform shell assumptions**: portable Node smoke owns OS-neutral
  logic; Nix/shell wrappers remain Linux-specific and do not define Windows
  behavior.
- **Slow full gate**: every slice has a focused RED/GREEN proof, followed by the
  full gate before acceptance.
