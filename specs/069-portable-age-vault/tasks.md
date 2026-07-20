# Tasks: Portable age vault

**Input**: [spec.md](spec.md), [plan.md](plan.md), issue #69, parent #74
**Story**: One canonical `.age` file moves directly between WebUI and CLI and
recognized legacy vaults migrate without cleartext touching disk.

## Slice 0 — Intake, specification, and plan (orchestrator-owned)

- [X] T001 Refresh canonical main, read #69/#74 and the epic map, inspect vault
  and shared-core code paths, and establish a clean `./gate.sh` baseline.
- [X] T002 Verify the upstream age browser/Node implementation and the exact
  `cardanoTxSignVault` / `amaruTreasuryWitnessVault` v1 source contracts.
- [X] T003 Author and analyze the canonical schema, security requirements,
  three bisect-safe slices, owned-file boundaries, and release signal.
- [X] T004 Commit planning/gate inventory, push, and open an accurately linked
  draft PR without pausing the workflow.

## Slice 1 — Shared canonical core and migrations (driver+navigator)

**Goal**: Make canonical age and all recognized migration mappings available
once to browser and Node hosts.

- [X] T005 Add RED tests for canonical v1 validation, all current kinds,
  duplicate ids, unsupported versions, unknown-kind/extension retention, and
  secret-free diagnostics.
- [X] T006 Add the portable `age-encryption` dependency and implement binary
  scrypt-passphrase encrypt/decrypt in `Cardano.Vault` without native addons.
- [X] T007 Implement legacy CSK AES-GCM, `cardanoTxSignVault`, and
  `amaruTreasuryWitnessVault` adapters with exact type/label/metadata mapping.
- [X] T008 Reject duplicate migrated labels/key hashes and preserve every
  unknown canonical entry object losslessly across re-encryption.
- [X] T009 Prove Node/browser-compatible round trips and bidirectional official
  `age` CLI interoperability from checked-in synthetic fixtures.
- [X] T010 Obtain navigator RED/GREEN approval, run `nix run .#ci-vault`,
  `nix run .#ci-test`, and `./gate.sh`, and commit once with
  `Tasks: T005, T006, T007, T008, T009, T010`.

## Slice 2 — WebUI age host and legacy migration (driver+navigator)

**Goal**: Emit canonical `.age` files from the browser and keep current vault
shelves working while migration is explicit and future entries survive.

- [X] T011 Add RED browser cases for `.age` create/open/export, wrong-passphrase
  redaction, explicit legacy CSK migration, and cross-save opaque-entry retention.
- [X] T012 Convert browser picker/download/persist behavior to a thin host over
  `Cardano.Vault`, including binary MIME/extensions and in-memory bytes only.
- [X] T013 Preserve all eight current shelf kinds and retain unknown future
  entries/fields when known entries are added, popped, or deleted.
- [X] T014 Keep errors and browser storage free of passphrases/decrypted entry
  values; fail malformed/unsupported/duplicate imports without state mutation.
- [X] T015 Obtain navigator RED/GREEN approval, run both Playwright surfaces and
  `./gate.sh`, and commit once with `Tasks: T011, T012, T013, T014, T015`.

## Slice 3 — Offline csk vault CLI and cross-host proof (driver+navigator)

**Goal**: Publish the CLI bootstrap and complete the safe create/list/migrate
lifecycle on Node 22+.

- [X] T016 Add RED CLI cases for root/parser/help, no-echo pseudo-TTY and
  inherited-FD intake, safe JSON/human listing, and every failure category.
- [X] T017 Implement `csk vault create|list|migrate` as thin filesystem/parser
  adapters over the shared core, with no passphrase argv/env option.
- [X] T018 Enforce confirmation, `0600` adjacent-temp atomic writes, explicit
  `--force`, unchanged inputs/targets on failure, and redacted output/errors.
- [X] T019 Prove browser-to-CLI and CLI-to-browser portability plus all three
  migration formats using the same binary `.age` files.
- [X] T020 Package the offline Node 22 `csk` app and document the exact lifecycle,
  descriptor automation, overwrite policy, and migration safety.
- [X] T021 Obtain navigator RED/GREEN approval, run `nix run .#ci-vault-cli` and
  `./gate.sh`, and commit once with
  `Tasks: T016, T017, T018, T019, T020, T021`.

## Slice 4 — Final audit and handoff (orchestrator-owned)

- [ ] T022 Extend the cumulative gate with every focused proof, audit commit
  messages/task closure and PR metadata, publish the CLI-bootstrap release
  signal, mark the draft ready, and hand back without merging.

## Dependencies and execution order

T001-T004 close before implementation. T005 establishes RED before T006-T008;
T009-T010 close Slice 1 before browser integration. T011 establishes RED before
T012-T014; T015 closes WebUI parity before CLI work. T016 establishes RED before
T017-T020; T021 closes the release boundary. T022 is final and
orchestrator-owned. No implementation slices run in parallel because every host
consumes the same schema/core and the release signal must name a settled CLI.

## Commit map

- Planning: `docs: specify portable age vault`
- Slice 1: `feat: define portable age vault core`
- Gate extension: `chore: extend gate.sh with vault core proof`
- Slice 2: `feat: move web vaults to portable age files`
- Slice 3: `feat: add offline csk vault lifecycle`
- Gate extension/final audit: `chore: extend gate.sh with vault CLI proof`
