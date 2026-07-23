# Feature Specification: Parity-Gated Release Artifacts

**Feature Branch**: `feat/73-release-gate`

**Created**: 2026-07-23

**Status**: Draft

**Input**: Issue #73 and parent epic #74

## P1 user story

As a Cardano operator, I install one tagged CSK release through npm or Nix
and observe that its `csk` command, Node API, WebUI, engine set, advertised
capabilities, git tag, and GitHub release all describe the same tested source
revision and version.

## Baseline and dependency evidence

The ticket starts at `main` commit
`06b02b7995b9b2d57f865cd257f66c083280681f`. Its required dependencies were
re-verified against their closing pull requests:

| Issue | Closing PR | Merge commit |
| --- | --- | --- |
| #72 | #91 | `756b6c50f0bc250ead0a5563330c283d5d952051` |
| #68 | #110 | `06b02b7995b9b2d57f865cd257f66c083280681f` |
| #92 | #95 | `8bc372d8d2f482fe3ff4446ed0166568991519a7` |
| #93 | #94 | `63c92194ee2e6010788eac1160b2599afae9b17f` |
| #104 | #106 | `225b4082a6c863dfc395f968b2b2823133ac9878` |

At that baseline, the authoritative engine inputs are:

- `cardano-addresses` revision
  `7a4f2b572e1aaa735cbcf93e3070f3beeda48b0f`;
- `cardano-ledger-inspector` revision
  `cd346f3577dc243df09bf4b141b91d9470c5ec00`;
- `rdf-shapes-wasm` revision
  `1240e4e58061836264d955b70c49c7195480f3b4`.

The release manifests must derive and verify current values rather than treating
these baseline literals as permanent pins.

## User scenarios and testing

### User Story 1 — Auditable capability and engine inventory (Priority: P1)

Every release contains machine-readable capability and engine manifests.
Each parity capability names its shared PureScript implementation, the WebUI
entry point, CLI command, Node export, fixture/proof, and authoritative engine.
Each engine names its provenance, revision/version, Nix hash, owning language,
packaged artifact, protocol contract, responsibility, and failure policy.

**Independent Test**: Mutate a temporary manifest to remove one host mapping or
change one engine revision/hash and run the manifest checker; it must fail with
a precise diagnostic. The unchanged manifests must pass.

**Acceptance Scenarios**:

1. Given an advertised parity operation, all three host mappings and one shared
   implementation are present and point to real source/proof anchors.
2. Given the ledger engine entry, its record states that the pinned Haskell
   artifact embeds the pinned Plutus evaluator libraries and that there is no
   separate Plutus WASI artifact.
3. Given a flake-lock pin change without a manifest update, the release gate
   fails before packaging.
4. Given a host-only presentation, storage, or migration concern, it is
   explicitly classified rather than silently counted as parity or omitted.

### User Story 2 — Enforced thin-host parity (Priority: P1)

CI rejects a missing WebUI/CLI/Node exposure, a divergent cross-host fixture,
host-side Cardano/CBOR/crypto/RDF/SPARQL/SHACL semantics, duplicated provider
policy, or any silent fallback after an engine failure.

**Independent Test**: Negative self-tests inject each prohibited dependency or
fallback shape and tamper with a parity fixture; the checker rejects every
fixture while the real tree passes.

**Acceptance Scenarios**:

1. The same committed parity vector is exercised through WebUI, packaged CLI,
   and packaged Node surfaces with equal normalized success/failure outcomes.
2. Missing or incompatible address, ledger, or RDF engines remain explicit
   typed failures and never produce substitute host results.
3. `nix develop --quiet -c just ci` invokes the capability, engine-pin,
   cross-host parity, architecture-boundary, version, documentation, and
   packaging checks.

### User Story 3 — Portable Node and Nix installation (Priority: P1)

Node 22+ users install the scoped npm tarball from a clean temporary project,
while Nix users invoke both `packages.csk` and `apps.csk`. The universal Node
artifact contains no native addon or platform-specific binary and discovers
all WASM and shipped book/registry assets relative to the installed package.

**Independent Test**: Build the npm tarball and Nix outputs, install outside the
checkout with networking denied, invoke representative API/CLI operations from
a foreign current directory, inspect artifact contents, and verify checksums.

**Acceptance Scenarios**:

1. Linux, macOS, and Windows Node 22 runners install the exact CI-built tarball
   with scripts disabled and run the same smoke.
2. `nix build .#csk` produces a Node-22-backed executable and
   `nix run .#csk -- --help` executes it.
3. Address, ledger, and RDF WASM plus bundled book/registry assets are found
   without checkout-relative paths.
4. The release bundle and npm tarball have deterministic checksum entries.

### User Story 4 — One release version and tagged publication (Priority: P1)

Release Please remains the only version bump authority. On a created
`vX.Y.Z` release, the workflow verifies that tag against `package.json`, builds
the already-gated source, publishes the scoped npm package, and attaches the
universal Node bundle plus checksums to that same GitHub release.

**Independent Test**: Static workflow contracts and local artifact checks prove
the output wiring; CI verifies all version consumers from the package version.
The publication job is gated on Release Please's `release_created` output and
cannot run for an untagged commit.

**Acceptance Scenarios**:

1. CLI `--version`, Node API version, WebUI footer, npm package metadata, Nix
   package metadata, tag, and GitHub release use the same `X.Y.Z`.
2. A tag/package mismatch fails before npm publication or asset upload.
3. npm publication uses the scoped public package and the GitHub release
   receives the universal bundle and checksum file produced from the tag.
4. Automatic release-PR merging remains prohibited.

### User Story 5 — Complete operator manual (Priority: P1)

The shipped manual maps every parity capability to WebUI, CLI, and Node usage;
covers npm/Nix installation, portable vault migration and credentials, stable
outputs and errors, versions, artifact verification, and troubleshooting; and
makes the host/engine boundary and semantic-drift hazard conspicuous.

**Independent Test**: A documentation contract checker verifies all required
sections, capability/engine links, commands, failure modes, and architecture
anchors; MkDocs builds with `--strict`.

## Functional requirements

- **FR-001**: A versioned capability manifest MUST map every parity operation to
  exactly one shared implementation and non-empty WebUI, CLI, Node, engine, and
  fixture/proof fields.
- **FR-002**: The manifest MUST retain the #70 offline inventory and cover the
  provider, transaction inspection/book, witness/attachment, validation,
  script-evaluation, submission, and #68 blueprint catalog capabilities that
  entered the parity chain later.
- **FR-003**: Host-only presentation, browser storage, vault lifecycle/migration,
  and other deliberately non-parity surfaces MUST be explicitly classified.
- **FR-004**: A versioned engine manifest MUST record artifact, source,
  revision/version, Nix `narHash`, owning language, protocol contract,
  responsibility, packaged path, and fail-hard behavior for every pinned
  address, ledger, and RDF engine.
- **FR-005**: The ledger entry MUST record the pinned Plutus libraries embedded
  in ledger-inspector's Haskell build and MUST prohibit a separate Plutus WASI
  artifact.
- **FR-006**: CI MUST fail on missing host exposure, nonexistent mapping/proof
  anchors, duplicate operation IDs, divergent normalized parity fixtures, or
  engine-pin drift.
- **FR-007**: Architecture checks MUST reject host-side provider duplication,
  Cardano/ledger/CBOR/crypto/RDF/SPARQL/SHACL semantic dependencies, direct
  engine bypasses, or fallback behavior, and MUST include negative self-tests.
- **FR-008**: Engine load, compatibility, execution, and protocol failures MUST
  remain explicit; a host MUST NOT return fallback semantic output.
- **FR-009**: `nix develop --quiet -c just ci` MUST include every release,
  parity, architecture, package, and documentation gate added by this ticket.
- **FR-010**: The flake MUST expose `packages.csk` and `apps.csk`, both using
  the pinned Node 22 runtime and the same packaged Node distribution.
- **FR-011**: The scoped npm package MUST install with `--ignore-scripts` in a
  foreign clean project and contain no native addon, native build hook, or
  platform-specific optional dependency.
- **FR-012**: Package-relative discovery MUST cover address, ledger, and RDF
  WASM artifacts plus shipped book/blueprint/registry assets outside the source
  checkout.
- **FR-013**: Clean-install Node 22+ smokes MUST run from one CI-built npm
  tarball on Linux, macOS, and Windows without hard-coding the current version.
- **FR-014**: `csk --version`, the public Node API, the WebUI, npm metadata, Nix
  metadata, Git tag, and GitHub release MUST derive from or verify against the
  single version in `package.json`.
- **FR-015**: A tagged Release Please release MUST publish
  `@lambdasistemi/cardano-swiss-knife` and attach a universal Node bundle plus
  checksum file to the matching GitHub release.
- **FR-016**: Publication MUST stop before any external write when the tag,
  package metadata, built CLI, Node export, or artifact names disagree.
- **FR-017**: The shipped manual MUST include host/engine responsibilities,
  artifact provenance and pins, embedded Plutus ownership, semantic-drift
  hazard, prohibited silent fallbacks, and missing/incompatible engine behavior.
- **FR-018**: The manual MUST map WebUI capabilities to CLI commands and Node
  APIs and cover npm/Nix installation, vault migration, credentials, outputs,
  version verification, checksum verification, and troubleshooting.
- **FR-019**: Final acceptance MUST inspect the npm tarball contents, execute
  the flake app, verify checksums, run the full local gate, and observe fresh
  remote CI on the final pushed SHA.

## Success criteria

- **SC-001**: Every parity row has one shared implementation and three valid
  host mappings; deliberate exclusions are classified.
- **SC-002**: Tampered host mappings, fixtures, pins, prohibited dependencies,
  and fallback markers are each rejected by a named negative test.
- **SC-003**: The clean npm artifact passes on all three hosted operating
  systems under Node 22+ and contains zero `.node` files or native hooks.
- **SC-004**: `nix build .#csk` and `nix run .#csk -- --version` report the same
  version as the packed npm artifact and WebUI build.
- **SC-005**: A foreign-directory smoke locates exactly the declared engine and
  book assets, with no checkout dependency or alternate Plutus artifact.
- **SC-006**: Release workflow validation proves that one tag gates npm publish,
  universal-bundle upload, and checksum upload to one GitHub release.
- **SC-007**: `./gate.sh` exits 0 at final HEAD and fresh GitHub checks are green
  for that exact pushed SHA.

## Non-goals

- A native single-file executable.
- Homebrew, DEB, or RPM packaging.
- N2C, chain sync, mempool monitoring, or new providers.
- New product capabilities solely to fill a matrix row.
- Automatic release-PR merge or self-merge of this ticket.
- Any host-side alternative to authoritative engine semantics.
