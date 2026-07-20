# Feature Specification: Portable age vault

**Feature Branch**: `feat/69-portable-age-vault`
**Created**: 2026-07-20
**Status**: In progress
**Input**: Issue #69 and parent epic #74

## P1 user story

As a Cardano operator, I move one encrypted vault between CSK hosts and migrate
supported existing CLI vaults while observing that every recognized secret
retains its type and label without cleartext touching disk.

## User scenarios and testing

### User Story 1 — One portable encrypted contract (Priority: P1)

An operator creates a passphrase-encrypted `.age` vault in either the WebUI or
`csk vault`, opens the exact file in the other host, and sees the same non-secret
entry inventory.

**Independent Test**: Create a vault with each current WebUI secret kind, export
it from the browser, list it through the Node 22 CLI using an inherited
passphrase descriptor, then create a CLI vault and open it in the browser. The
official `age` implementation also decrypts a CSK-produced fixture and CSK
decrypts an official age fixture.

**Acceptance Scenarios**:

1. **Given** any current WebUI secret kind, **when** a canonical vault is
   encrypted and reopened, **then** its id, kind, label, value, creation time,
   and extension fields are unchanged.
2. **Given** a syntactically valid entry with an unknown future kind, **when**
   the vault is opened and saved without deleting that entry, **then** its JSON
   object is byte-for-byte equivalent after parse/serialize normalization.
3. **Given** a canonical vault produced by one host, **when** the other host
   opens it with the same passphrase, **then** the non-secret inventory agrees
   and secret values remain absent from output and errors.

### User Story 2 — Safe migration of recognized vaults (Priority: P1)

An operator migrates a legacy CSK AES-GCM vault or an age-encrypted `tx-sign` /
Amaru witness vault into the canonical CSK contract without writing decrypted
JSON or signing material to disk.

**Independent Test**: Migrate checked-in synthetic fixtures for all three
recognized wrappers, decrypt only the resulting `.age` file in memory, and
verify the expected canonical types, labels, networks, key hashes, and secret
representations. Repeat with wrong passphrases and malformed/unsupported input
and verify no output path is created or overwritten.

**Acceptance Scenarios**:

1. **Given** the existing WebUI PBKDF2-SHA256/AES-256-GCM v1 JSON envelope,
   **when** migration succeeds, **then** every current entry becomes the
   equivalent canonical entry.
2. **Given** a decrypted `cardanoTxSignVault` or
   `amaruTreasuryWitnessVault` v1 identity, **when** migration succeeds, **then**
   the label and source type are retained and non-secret network/key-hash/
   description metadata remains available.
3. **Given** duplicate ids, duplicate signing identities, malformed input,
   unsupported versions, a wrong passphrase, or an existing output path without
   `--force`, **when** migration is attempted, **then** it fails closed without
   a partial or modified output file.

### User Story 3 — Safe CLI lifecycle (Priority: P1)

An operator uses `csk vault create`, `csk vault list`, and `csk vault migrate`
without placing passphrases in command arguments or environment variables.

**Independent Test**: Exercise every command with inherited descriptors, run
the no-echo TTY flow in a pseudo-terminal, inspect process arguments and output,
and verify atomic `0600` output creation plus explicit overwrite behavior.

**Acceptance Scenarios**:

1. **Given** a human terminal, **when** a command needs a passphrase, **then** it
   reads from `/dev/tty` with echo disabled; create/rotation prompts for
   confirmation.
2. **Given** automation, **when** `--passphrase-fd` or
   `--input-passphrase-fd` is supplied, **then** the passphrase is read from that
   inherited descriptor and never appears in argv, environment, stdout, or
   stderr.
3. **Given** an existing target path, **when** create or migrate runs without
   `--force`, **then** it fails before changing the file; with `--force`, an
   adjacent temporary file is atomically renamed over the target.
4. **Given** a canonical vault, **when** `list` succeeds, **then** output contains
   only entry id, kind, label, creation time, and explicitly non-secret metadata.

## Canonical payload contract

The binary file is an age v1 file (`age-encryption.org/v1`) encrypted with one
scrypt passphrase recipient. Decrypting it in memory yields UTF-8 JSON:

```json
{
  "cardanoSwissKnifeVault": {
    "version": 1,
    "entries": [
      {
        "id": "stable-id",
        "kind": "mnemonic",
        "label": "Paper backup",
        "value": "secret string",
        "createdAt": "2026-07-20T00:00:00.000Z"
      }
    ]
  }
}
```

`entries` is ordered. Each entry requires non-empty string `id`, `kind`, and
`label`, a string `value`, and an ISO-8601 string `createdAt`. Known current
kinds are `mnemonic`, `signing-key`, `root-private-key`,
`account-private-key`, `address-private-key`, `stake-private-key`,
`blockfrost-project-id`, and `koios-bearer-token`. Migrated CLI signing sources
use `cardano-cli-skey` or `cardano-addresses-addr-xsk` and retain `network`,
`keyHash`, and optional `description` as non-secret extension fields.

The core validates the required projection but retains the complete raw JSON
object for every entry. Unknown kinds and unknown extension fields are accepted
and re-emitted unchanged. Top-level versions other than `1` are rejected.

## Functional requirements

- **FR-001**: One shared host-neutral module MUST own canonical payload
  validation, age encryption/decryption, safe diagnostics, and migration
  mapping; WebUI and CLI adapters MUST NOT duplicate those rules.
- **FR-002**: Canonical files MUST be binary age v1 files using an scrypt
  passphrase recipient and the versioned `cardanoSwissKnifeVault` payload.
- **FR-003**: The payload MUST represent all eight current WebUI kinds and MUST
  retain unknown entry kinds and extension fields losslessly.
- **FR-004**: Duplicate entry ids MUST be rejected. Migrated signing identities
  with duplicate labels or key hashes MUST be rejected rather than merged.
- **FR-005**: The WebUI MUST create, open, persist, and export canonical `.age`
  files while preserving its existing in-memory shelf behavior.
- **FR-006**: Legacy CSK PBKDF2-SHA256/AES-256-GCM v1 JSON MUST be accepted only
  by migration, never emitted as the canonical format.
- **FR-007**: Migration MUST recognize age payload wrappers
  `cardanoTxSignVault` v1 and `amaruTreasuryWitnessVault` v1 with
  `cardano-cli-skey` and `cardano-addresses-addr-xsk` sources.
- **FR-008**: `csk vault create|list|migrate` MUST run on Node 22+ without native
  addons or network access.
- **FR-009**: Passphrases MUST come from a no-echo TTY or inherited descriptor,
  never argv or environment variables.
- **FR-010**: Decrypted payload bytes and entry values MUST remain in memory and
  MUST NOT appear in output, diagnostics, temporary cleartext files, or process
  metadata.
- **FR-011**: Wrong passphrases, malformed files, unsupported versions,
  duplicate identities, and unsafe overwrites MUST fail closed and leave output
  paths unchanged.
- **FR-012**: Output writes MUST use restrictive permissions and atomic rename;
  overwrite requires an explicit `--force` flag.
- **FR-013**: Browser, shared-core, migration, CLI, cross-host, official-age
  interoperability, and failure-path fixtures MUST run from `./gate.sh`.
- **FR-014**: The shared host MUST introduce no Cardano cryptography, ledger,
  CBOR, RDF, SPARQL, or SHACL fallback implementation.

## Success criteria

- **SC-001**: All eight WebUI kinds and one unknown future kind round-trip with
  identical ids, types, labels, values, timestamps, and extension fields.
- **SC-002**: Browser-to-CLI and CLI-to-browser fixture journeys both pass using
  the same binary `.age` file.
- **SC-003**: Three recognized legacy format families migrate to the canonical
  v1 payload with exact type/label counts and no cleartext artifact.
- **SC-004**: Every mandated failure leaves zero new output bytes and emits a
  redacted diagnostic containing none of the fixture secrets or passphrases.
- **SC-005**: The focused vault gates and full `./gate.sh` exit 0 on Node 22 and
  the browser build.

## Assumptions and dependencies

- The upstream `age-encryption` ES module is the interoperable age
  implementation. It is compatible with Node 20+ and recent browsers and uses
  Web Crypto when available.
- Binary age output is canonical; ASCII armor may be accepted by the upstream
  decoder if supported but is not emitted.
- CLI migration transforms one input vault into a new output vault; it does not
  edit the source in place.
- The cumulative repository `gate.sh` is owned by `main` and remains after this
  PR; this ticket only appends vault checks.

## Out of scope

- Cloud synchronization, hardware identities, recipients other than a
  passphrase, or modifying `tx-sign` / Amaru.
- Witness generation or other address/ledger semantics.
- Requiring legacy tools to understand canonical CSK-only entries.
- CLI address/key/script/payload services owned by issue #70.
