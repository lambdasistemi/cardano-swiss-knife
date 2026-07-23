# Feature Specification: Vault Provider Credentials

**Feature Branch**: `feat/114-vault-provider-credentials`  
**Created**: 2026-07-23  
**Status**: Draft  
**Input**: Issue #114, parent epic #74, merged provider context #104, and merged vault witness fix #108

## P1 user story

As a Cardano operator, I add a provider credential to an existing encrypted
CSK vault and use that named entry for provider-backed transaction validation
without exposing the credential in commands, environment variables, output, or
cleartext files.

## User Scenarios & Testing

### User Story 1 - Add a named provider credential (Priority: P1)

An operator selects an existing portable vault, provider, entry id, and label.
CSK unlocks the vault, reads the credential from the controlling terminal with
echo disabled, adds one provider-specific entry, and replaces the encrypted
vault atomically.

**Why this priority**: This removes the unsupported hand-authored-vault step
that currently prevents a complete operator workflow.

**Independent Test**: Create a vault, add a Blockfrost credential through a
pseudo-terminal, decrypt it in memory, and verify one correctly typed entry was
added while a pre-existing opaque entry remained byte-for-byte equivalent as
data.

**Acceptance Scenarios**:

1. **Given** an existing encrypted vault and valid metadata, **When** the
   operator runs `csk vault credential add --vault PATH --provider blockfrost
   --id ID --label LABEL`, **Then** CSK prompts for the vault passphrase and
   project id with terminal echo disabled and adds a
   `blockfrost-project-id` entry.
2. **Given** an existing encrypted vault and a passphrase supplied through an
   inherited descriptor, **When** the operator adds a Koios credential,
   **Then** the credential itself is still read only from the controlling
   terminal and the entry kind is `koios-bearer-token`.
3. **Given** unrelated canonical entries and extension fields, **When** a
   credential is added, **Then** those entries and fields are preserved
   unchanged.

---

### User Story 2 - Inspect credential metadata without disclosure (Priority: P1)

The operator lists the updated vault in human or JSON mode and can identify the
provider entry by id, kind, label, and creation time without seeing its value.

**Why this priority**: A named credential cannot be selected safely unless the
operator can discover its metadata.

**Independent Test**: List a vault containing the new entry in both modes and
assert that metadata is present while the credential and passphrase are absent.

**Acceptance Scenarios**:

1. **Given** a vault containing a provider credential, **When** the operator
   runs `csk vault list`, **Then** the id, provider-specific kind, label, and
   creation time are shown and the value is not.
2. **Given** the same vault, **When** JSON output is requested, **Then** no
   object contains a `value` field or credential text.

---

### User Story 3 - Use the stored Blockfrost credential (Priority: P1)

The operator selects the named credential while validating a local transaction.
CSK passes the decrypted value in memory to the existing shared Blockfrost
provider path.

**Why this priority**: Storage without consumption would leave the primary
operator journey incomplete.

**Independent Test**: Validate a committed local transaction fixture with
`--provider blockfrost --network mainnet --vault PATH --vault-entry ID`,
intercept provider requests, and verify a non-empty project-id header reached
the existing provider boundary without recording its value.

**Acceptance Scenarios**:

1. **Given** a matching `blockfrost-project-id` entry, **When** local
   transaction validation selects it, **Then** the shared provider resolver is
   invoked with a credential and returns its normal complete, partial, or
   incomplete evidence.
2. **Given** a missing entry, wrong kind, wrong passphrase, or malformed vault,
   **When** validation selects it, **Then** CSK fails closed with its existing
   redacted secret-source error before exposing credential material.

### Edge Cases

- The vault path is missing, unreadable, malformed, or not an existing
  canonical encrypted vault.
- The passphrase is wrong or empty.
- The provider is unsupported, or id/label is empty, whitespace-only, or
  contains control characters that would corrupt human listing output.
- The terminal credential is empty or whitespace-only. Provider credentials
  are otherwise opaque and are not constrained by a provider-format regex.
- The chosen id already belongs to any existing entry kind.
- Encryption or the atomic replacement seam fails after the original vault was
  read.
- The process receives an interrupt while echo is disabled.

## Requirements

### Functional Requirements

- **FR-001**: The CLI MUST expose `csk vault credential add` for an existing
  encrypted portable vault.
- **FR-002**: The command MUST require `--vault`, `--provider`, `--id`, and
  `--label`; supported providers MUST be `blockfrost` and `koios`.
- **FR-003**: The command MUST map Blockfrost to
  `blockfrost-project-id` and Koios to `koios-bearer-token`.
- **FR-004**: The provider credential MUST be read only from the controlling
  terminal with echo disabled; no CLI option or environment variable may
  carry its value.
- **FR-005**: Vault passphrases MUST retain the existing no-echo terminal and
  inherited `--passphrase-fd` policies.
- **FR-006**: Id and label MUST be non-whitespace and control-character-free.
  The credential MUST be non-whitespace but otherwise treated as opaque,
  matching the existing browser-vault policy.
- **FR-007**: Adding an entry MUST reject any duplicate id without modifying
  the vault; silent replacement and `--force` are out of scope.
- **FR-008**: A successful add MUST preserve every unrelated entry and
  extension field unchanged.
- **FR-009**: A successful add MUST replace the encrypted vault atomically and
  leave the resulting file private (`0600`).
- **FR-010**: Any failure before replacement MUST preserve the original vault
  and remove adjacent temporary artifacts.
- **FR-011**: Human and JSON vault listings MUST expose provider-entry metadata
  while omitting the `value` field and secret text.
- **FR-012**: Local Blockfrost transaction validation MUST accept a named
  `blockfrost-project-id` entry produced by the add command through the existing
  vault selection and shared provider-resolution path.
- **FR-013**: Missing entries, wrong kinds, wrong passphrases, malformed vaults,
  and malformed credential input MUST fail closed with fixed diagnostics that
  omit passphrases and credentials.
- **FR-014**: Provider credentials and passphrases MUST be absent from process
  arguments, environment values, stdout, stderr, listings, captured request
  diagnostics, and cleartext temporary files.
- **FR-015**: The change MUST NOT add provider HTTP, Cardano decoding,
  cryptography, or ledger-validation semantics to the CLI host.

### Key Entities

- **Provider credential entry**: A canonical vault entry with a unique id,
  provider-specific kind, operator label, opaque secret value, and UTC creation
  time.
- **Portable vault**: The existing age-encrypted canonical v1 document whose
  unrelated entries and extension fields survive mutation.
- **Credential metadata projection**: The provider entry without its secret
  value, suitable for human and JSON listing.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An operator can complete create → add → list → validate using one
  portable vault and one named entry with no hand-authored vault JSON.
- **SC-002**: Every successful add produces a `0600` encrypted vault containing
  exactly one new entry and all pre-existing entries unchanged.
- **SC-003**: Duplicate id, wrong passphrase, malformed metadata, whitespace
  credential, and simulated atomic-write failure each leave the original vault
  unchanged and no adjacent temporary file.
- **SC-004**: Human output, JSON output, process capture, and temporary-file
  scans contain zero occurrences of the credential and passphrase sentinels.
- **SC-005**: A Blockfrost validation smoke reaches the existing provider
  boundary with a non-empty credential while the captured evidence records no
  credential value.

## Assumptions

- Provider credential values are opaque non-whitespace strings, matching the
  browser vault; CSK does not predict provider-issued token formats.
- Provider selection is stored in the entry kind rather than as a new schema
  field, preserving canonical vault v1 compatibility.
- Add-only duplicate protection is sufficient for this ticket; credential
  replacement/removal can be specified separately.
- Existing provider error taxonomy and ledger validation outcomes remain
  unchanged.

## Non-goals

- Browser wallet integration.
- Storing signing keys in provider-credential entries.
- Credential replacement, deletion, or bulk import.
- Changing provider request protocols, authentication policy, or ledger rules.
- Adding a second provider implementation or host-side Cardano semantics.
