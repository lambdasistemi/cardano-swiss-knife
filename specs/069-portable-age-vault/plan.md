# Implementation Plan: Portable age vault

**Branch**: `feat/69-portable-age-vault` | **Date**: 2026-07-20 | **Spec**: [spec.md](spec.md)

## Summary

Introduce one shared PureScript/ES-module vault core backed by the upstream
`age-encryption` package, prove its canonical schema and three legacy adapters,
then move the WebUI onto binary `.age` files and add the minimal `csk vault`
root/parser plus Node host. The permanent repository gate grows additively as
each focused proof becomes available.

## Technical context

**Language/Version**: PureScript 0.15.16 and ECMAScript modules on Node 22+/recent browsers
**Crypto dependency**: `age-encryption` 0.3.x (pure TypeScript/noble + Web Crypto; no native addon)
**Storage**: binary local `.age` files only; decrypted JSON remains in memory
**Testing**: Node built-in assertions, official `age` CLI interoperability, Playwright, Nix apps, full `./gate.sh`
**Target platforms**: shipped browser WebUI and offline Node 22+ CLI
**Constraints**: no secret argv/env/output, no cleartext temp file, fail-closed atomic output, no host-side Cardano semantics

## Architecture and data flow

`lib/src/Cardano/Vault.*` owns the canonical payload projection, raw-entry
retention, duplicate checks, age encrypt/decrypt, redacted errors, and legacy
mapping. `docs/inspector/src/Vault.*` owns only browser file-picker/download/
handle behavior. `cli/vault-host.mjs` owns only TTY/descriptor input, filesystem
reads, atomic writes, and non-secret rendering. `cli/csk.mjs` owns the root and
`vault create|list|migrate` parser reserved by the epic map.

```text
browser picker ─┐
                ├─ host adapter ─ Cardano.Vault core ─ age-encryption
Node fs/TTY  ───┘                       │
                                       ├─ canonical v1 JSON
                                       └─ legacy CSK / tx-sign / Amaru adapters
```

The PureScript-facing `VaultEntry` retains a serialized raw-entry field in
memory. Known UI operations consume the validated projection; persistence
re-emits the retained raw object so unknown kinds and extension fields survive.
New WebUI entries are canonicalized by the shared core.

## Constitution check

- **One operation model / multiple hosts**: PASS — schema, encryption, and
  migration exist once under `Cardano.Vault`.
- **Thin hosts**: PASS — browser picker and Node filesystem/TTY details stay in
  adapters.
- **Authoritative engines**: PASS — no address, ledger, CBOR, or RDF semantics
  are introduced.
- **Local-first secret handling**: PASS — only encrypted output reaches disk;
  passphrases use TTY/FD boundaries.
- **Node 22/no native addons**: PASS — selected age dependency is portable ESM.
- **Nix canonical proof**: PASS — each slice has a focused Nix app and the
  cumulative gate is extended only after that proof exists.

## Slice 1 — Shared canonical core and migrations

One RED/GREEN commit defines the shared v1 contract, adds the portable age
dependency to both Nix npm roots, implements legacy adapters, and proves direct
interoperation with official age plus lossless unknown-entry retention.

### Owned files

```text
package.json
package-lock.json
docs/inspector/package.json
docs/inspector/package-lock.json
lib/src/Cardano/Vault.purs
lib/src/Cardano/Vault.js
test/src/Test/Vault.purs
test/src/Test/Vault.js
test/src/Test/Main.purs
test/vault-core.test.mjs
test/fixtures/vault/canonical-v1.json
test/fixtures/vault/canonical-v1.age
test/fixtures/vault/legacy-csk-v1.json
test/fixtures/vault/tx-sign-v1.json
test/fixtures/vault/amaru-v1.json
nix/apps/vault-test.nix
nix/apps/default.nix
```

### TDD and proof

1. RED proves canonical parsing, duplicate rejection, unknown-kind retention,
   safe errors, and all three migration mappings before implementation.
2. GREEN uses `Encrypter.setPassphrase` / `Decrypter.addPassphrase` and keeps
   the raw entry object beside its validated projection.
3. `nix run .#ci-vault` proves Node round trips and official age compatibility;
   `nix run .#ci-test` proves the PureScript surface.
4. `./gate.sh` closes the slice before commit.

Commit: `feat: define portable age vault core`
Trailer: `Tasks: T005, T006, T007, T008, T009, T010`

After acceptance, the orchestrator appends `nix run .#ci-vault` to `gate.sh` in
a separate passing gate-extension commit.

## Slice 2 — WebUI age host and legacy migration

One RED/GREEN commit changes browser create/open/persist/export from the legacy
JSON envelope to binary `.age`, exposes deliberate migration of legacy CSK
JSON, and proves current shelves plus future opaque entries remain safe.

### Owned files

```text
docs/inspector/src/Vault.purs
docs/inspector/src/Vault.js
docs/inspector/src/Main.purs
docs/inspector/tests/unified-vault.spec.mjs
tests/vault.spec.ts
docs/architecture/storage.md
```

### TDD and proof

1. RED browser cases require `.age` output, canonical payload, wrong-passphrase
   redaction, legacy migration, opaque-entry preservation, and no browser
   storage secret residue.
2. GREEN makes WebUI code a thin file boundary over `Cardano.Vault`; legacy JSON
   is imported only through an explicit migration action.
3. Focused proof: `nix run .#ci-inspector-playwright` and
   `nix run .#ci-playwright`.
4. Full proof: `./gate.sh`.

Commit: `feat: move web vaults to portable age files`
Trailer: `Tasks: T011, T012, T013, T014, T015`

## Slice 3 — Offline csk vault CLI and cross-host proof

One RED/GREEN commit adds the epic-owned CLI root/parser and Node host for
`create`, `list`, and `migrate`, with no-echo TTY/inherited-FD passphrases,
atomic restrictive writes, safe overwrite behavior, and direct WebUI parity.

### Owned files

```text
cli/csk.mjs
cli/vault-host.mjs
test/vault-cli.test.mjs
test/vault-cross-host.test.mjs
scripts/smoke/vault-cli-tty
nix/apps/csk.nix
nix/apps/vault-cli-test.nix
nix/apps/default.nix
docs/user/vault.md
docs/user/usage.md
mkdocs.yml
```

### CLI surface

```text
csk vault create  --out PATH [--passphrase-fd FD] [--force]
csk vault list    --vault PATH [--passphrase-fd FD] [--json]
csk vault migrate --input PATH --out PATH
                  [--input-passphrase-fd FD] [--passphrase-fd FD] [--force]
```

No option accepts passphrase text. `list --json` returns only the non-secret
projection. Human prompts use `/dev/tty` with echo disabled; descriptor reads
strip at most one trailing line ending. Migrate never rewrites `--input`.

### TDD and proof

1. RED covers parser/help, FD and pseudo-TTY intake, create/list/migrate,
   duplicate/malformed/version/wrong-passphrase failures, output redaction,
   mode `0600`, atomic overwrite, and no output on failure.
2. GREEN packages `csk` as a Node 22 Nix app with its npm closure.
3. Cross-host proof opens browser output through the CLI and CLI output through
   the browser shared core with the same inventory.
4. Focused proof: `nix run .#ci-vault-cli`; full proof: `./gate.sh`.

Commit: `feat: add offline csk vault lifecycle`
Trailer: `Tasks: T016, T017, T018, T019, T020, T021`

After acceptance, the orchestrator appends `nix run .#ci-vault-cli` to
`gate.sh`, reruns it, and publishes `NOTE RELEASE: vault-cli-bootstrap-ready`
with the pushed commit/PR URL for sibling issue #70.

## Integration order and release boundary

Slices are serial because WebUI and CLI consume the exact core established by
Slice 1. Slice 3 is the CLI bootstrap release boundary. Driver and navigator
panes are cleared together between every slice. Each behavior-changing slice is
one bisect-safe commit, stamped with its completed tasks only after independent
orchestrator review.

## Finalization

Run the final commit/task audit and `./gate.sh`, update the draft PR body with
schema/migration/cross-host evidence, and mark it ready without merging. Retain
`gate.sh`: it is the cumulative project gate already tracked on `origin/main`,
not a temporary PR sentinel.

## Risks and controls

- **Unknown-entry loss through typed UI projection**: retain and re-emit the raw
  object; test opaque extension fields through browser save.
- **Secret-bearing parser diagnostics**: errors use fixed categories and labels
  only; fixture secrets are asserted absent from stdout/stderr.
- **Partial overwrite after encryption or write failure**: write encrypted bytes
  to an adjacent exclusive temp file, fsync/close, chmod `0600`, then rename.
- **Duplicate identity ambiguity**: reject duplicate canonical ids and duplicate
  migrated labels/key hashes before encryption.
- **CLI collision with #70**: this ticket owns only `cli/csk.mjs`, vault parser/
  host, and packaging bootstrap; it publishes the release signal before #70
  wires its disjoint service modules.
