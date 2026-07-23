# Feature Specification: Migrated Amaru Witness Attach

**Issue**: [#108](https://github.com/lambdasistemi/cardano-swiss-knife/issues/108)

**Priority**: P1

**Status**: Planned

## Problem

`csk vault migrate` preserves an `amaruTreasuryWitnessVault` signing
identity as a canonical vault entry whose kind is
`cardano-addresses-addr-xsk`. `csk tx witness attach --vault`, however,
requests only a `signing-key` entry and therefore rejects the migrated
identity as `SECRET_SOURCE`.

## P1 User Story

As a treasury signer, I migrate my encrypted Amaru witness vault and use
its migrated identity to attach a witness to a transaction that requires
that identity.

### Acceptance Scenarios

1. Given an encrypted `amaruTreasuryWitnessVault` containing a matching
   address extended signing key, when it is migrated, listed, and selected
   by `csk tx witness attach`, then the command writes an attached Conway
   transaction TextEnvelope and detached witness TextEnvelope whose witness
   plan contains the required signer.
2. Given the existing canonical `signing-key` representation, when it is
   selected for witness attachment, then its current behavior remains
   supported.
3. Given an unrelated secret kind or unsupported key representation, when
   it is selected for witness attachment, then the command fails closed
   without revealing the vault entry or passphrase.
4. Given a valid migrated address extended signing key whose derived key
   hash is not required by the transaction, when attachment is attempted,
   then no attached transaction is written and the command reports the
   existing typed signer-safety failure.

## Functional Requirements

- **FR-001**: Vault-backed witness attachment MUST accept exactly the
  existing `signing-key` kind and the migrated
  `cardano-addresses-addr-xsk` kind as Bech32 signing-key sources.
- **FR-002**: Vault-backed witness attachment MUST continue to reject
  unrelated secret kinds and unsupported stored representations as
  `SECRET_SOURCE`.
- **FR-003**: Entry lookup, entry-kind validation, and string-value
  validation MUST fail closed through the existing redacted secret-source
  error boundary.
- **FR-004**: The selected key MUST be prepared through the existing shared
  transaction witness API and attached through the authoritative ledger
  engine; no host-side crypto or ledger fallback may be added.
- **FR-005**: The derived signer hash MUST satisfy a required signer before
  an attached transaction is written.
- **FR-006**: Passphrases and secret key values MUST remain off command
  arguments and environment variables and MUST NOT appear in stdout,
  stderr, captured argv/environment data, or temporary artifacts.
- **FR-007**: An end-to-end CLI regression MUST migrate an encrypted Amaru
  legacy vault, list the migrated entry, attach its witness, and verify the
  attached transaction and detached witness TextEnvelopes plus the
  post-attach witness plan.
- **FR-008**: Existing `signing-key` witness attachment and existing
  legacy-vault migration coverage MUST remain green.

## Success Criteria

- **SC-001**: The new end-to-end regression fails on the pre-fix
  `signing-key`-only implementation and passes after the fix.
- **SC-002**: Matching migrated Amaru attachment produces exactly one
  accepted required signer without changing transaction body identity.
- **SC-003**: Unrelated migrated keys, unrelated secret kinds, and
  unsupported representations fail without creating the requested
  transaction output.
- **SC-004**: Secret sentinels are absent from every observed disclosure
  surface covered by the regression.
- **SC-005**: `./gate.sh` and fresh remote CI pass.

## Non-Goals

- Converting migrated address extended signing keys into another stored
  representation.
- Accepting arbitrary vault entry kinds as signing keys.
- Changing transaction submission or witness replacement behavior.
- Adding host-side signing, hashing, CBOR, or ledger fallbacks.
