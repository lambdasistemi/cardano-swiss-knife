# Feature Specification: Unify the two shells on the MD3 base

**Feature Branch**: `refactor/18-unify-shells-md3`  
**Created**: 2026-07-15  
**Status**: Draft  
**Input**: GitHub issue #18, parent epic #20, and human-approved Q-001 navigation decision

## User Scenarios & Testing

### User Story 1 - Navigate one workbench shell (Priority: P1)

As a workbench user, I use one responsive Cardano Swiss Knife shell for transaction work, addresses, keys, scripts, encrypted secrets, books, and settings without crossing into a second application or theme.

**Why this priority**: A single product shell is the ticket's primary user outcome and the prerequisite for every other workflow.

**Independent Test**: Open each approved top-level destination at the site root and deployed subpath, exercise the Keys tabs, and verify one header, one theme toggle, and uninterrupted in-browser state.

**Acceptance Scenarios**:

1. **Given** the workbench is opened at the site root, **When** the user follows the primary navigation, **Then** `Workbench`, `Addresses`, `Keys`, `Scripts`, `Vault`, `Library`, and `Settings` are reachable in the same shell.
2. **Given** the user opens Keys, **When** they switch its local tabs, **Then** `Mnemonic`, `Restore`, `Expert`, and `Sign & verify` retain the complete legacy capabilities.
3. **Given** a deployed compatibility subpath, **When** the user opens an existing inspector deep link, **Then** the same unified shell loads and retains the expected destination.

---

### User Story 2 - Keep every secret in the encrypted vault (Priority: P1)

As a security-conscious user, I store mnemonics, signing keys, derived private keys, and provider credentials only in the encrypted vault and load them into memory only while using them.

**Why this priority**: Vault-only persistent secret handling is an explicit security acceptance criterion and an epic invariant.

**Independent Test**: Create and reopen an encrypted vault, round-trip every supported secret kind into its compatible tool, reload the page, and audit browser storage to prove no secret or credential was written in cleartext.

**Acceptance Scenarios**:

1. **Given** an unlocked vault, **When** the user saves a mnemonic, signing-compatible key, Blockfrost project ID, or Koios bearer token, **Then** the encrypted vault is updated and the cleartext value is absent from browser storage.
2. **Given** a compatible vault entry, **When** the user loads or pops it into Restore, Sign & verify, Workbench signing, or Settings, **Then** the value is used in memory without clipboard transfer.
3. **Given** legacy cleartext provider keys in browser storage, **When** the unified shell initializes, **Then** those secret keys and the old persistence flag are removed rather than silently reused.
4. **Given** a locked vault, **When** a user attempts to persist a secret, **Then** the shell refuses and explains that a vault must be opened or created.

---

### User Story 3 - Complete the transaction signing loop (Priority: P1)

As a transaction signer, I inspect a transaction's witness plan, derive or select the required key, sign the transaction body hash locally, attach the witness, and receive patched transaction CBOR in one workbench flow.

**Why this priority**: Closing this loop is the ticket's explicit functional acceptance criterion and proves the address/key and transaction halves are genuinely unified.

**Independent Test**: Load a transaction fixture, inspect its witness plan, derive and vault a matching signing key, load it into Workbench, create the witness, and verify the returned CBOR contains the new vkey witness.

**Acceptance Scenarios**:

1. **Given** a decoded transaction with a missing required signer, **When** the user derives or selects a matching private key and signs, **Then** the shell reports the signer match, signature, detached witness, attachment action, and patched transaction CBOR.
2. **Given** no completed inspection or no signing key, **When** the user attempts to sign, **Then** signing stays disabled or returns a precise local validation message.
3. **Given** an attachment rejected by the authoritative ledger operation, **When** signing completes, **Then** no patched CBOR is claimed and the operation's error is shown.

---

### User Story 4 - Preserve all existing product capabilities (Priority: P1)

As an existing Cardano Swiss Knife or inspector user, I continue to use every pre-ticket address, key, signing, script, vault, transaction, RDF, validation, provider, and book workflow after unification.

**Why this priority**: Parity before legacy deletion is an epic invariant; shell consolidation must not remove an already-published surface.

**Independent Test**: Run all pre-existing browser suites against the unified artifact, compare the approved route/surface map, and delete the legacy shell only after the mapped workflows pass.

**Acceptance Scenarios**:

1. **Given** the legacy and transplanted browser suites, **When** they are retargeted to the unified shell, **Then** every pre-existing case passes on the canonical Nix path.
2. **Given** every legacy surface is live and covered in its new home, **When** final integration occurs, **Then** the legacy application shell is deleted without deleting the shared address or signing operations it consumed.
3. **Given** theme and library data are non-secret preferences/content, **When** they persist locally, **Then** they remain usable while secret categories remain vault-only.

### Edge Cases

- A direct route is loaded at `/`, a root route suffix, `/inspector/`, or an existing `/inspector/<route>` compatibility URL.
- The topbar is used at desktop, laptop, and 390px mobile widths without overflow or an unreachable destination.
- A legacy provider credential or persistence flag is present in local storage during first unified-shell load.
- The vault file picker is canceled, a passphrase is absent or wrong, a vault document is invalid, or persistence fails after an in-memory edit.
- A vault entry kind is offered only to compatible consumers; incompatible kinds cannot be loaded or popped into a tool.
- A transaction is still decoding, has no body hash, has an already-present signer, or the selected key does not match the witness plan.
- Book and theme persistence continue to work because neither contains mnemonics, private/signing keys, or provider credentials.

## Requirements

### Functional Requirements

- **FR-001**: The product MUST expose exactly one shipped Halogen shell based on the transplanted MD3 workbench; the legacy `App.purs` shell MUST be absent after final integration.
- **FR-002**: The primary navigation MUST be `Workbench`, `Addresses`, `Keys`, `Scripts`, `Vault`, `Library`, and `Settings`; Keys MUST expose `Mnemonic`, `Restore`, `Expert`, and `Sign & verify` as in-page tabs.
- **FR-003**: The approved parity mapping MUST hold: Overview → Workbench landing; Inspect → Addresses; Mnemonic/Restore/Expert/Signing → their Keys tabs; Transactions → Workbench; Scripts → Scripts; Vault → Vault; both Library surfaces → Library; MD3 Settings → Settings; MD3 Structure/Witness/Validation/RDF → Workbench.
- **FR-004**: The legacy shell MUST remain present until every mapped surface is live in the MD3 shell and its browser proof passes; deletion MUST happen only in the final integration slice.
- **FR-005**: The encrypted vault MUST be the only persistent store for mnemonics, signing keys, root/account/address/stake private keys, Blockfrost project IDs, and Koios bearer tokens.
- **FR-006**: Decrypted vault entries and active secret inputs MUST remain browser-local and memory-only; they MUST NOT be sent to the engine or written to cleartext browser storage.
- **FR-007**: Initialization MUST scrub the legacy cleartext credential keys `blockfrost_project_id`, `koios_bearer_token`, and `persist_api_keys`; non-secret provider/network choices, theme, and library books MAY remain in local storage.
- **FR-008**: Workbench MUST support witness plan → derive or load key → sign body hash → `tx.witness.attach` → patched transaction CBOR, with detached witness details and signer-plan match visible.
- **FR-009**: Ledger semantics and witness attachment MUST continue through the `cardano-ledger-functional/v1` engine contract and flake-owned artifacts; browser code MUST only orchestrate and render.
- **FR-010**: The root deployment and existing `/inspector/` compatibility entry points MUST serve the same unified shell and preserve direct-entry navigation.
- **FR-011**: All pre-existing Cardano Swiss Knife and transplanted inspector browser tests MUST run against the unified shell and pass on the Nix path; the signing loop and secret-storage migration MUST have dedicated browser coverage.
- **FR-012**: No new end-user tool or surface, engine change, envelope change, protocol-registry rename, or secret handling in the engine repository is permitted.
- **FR-013**: The delivered work MUST remain MIT licensed.

### Key Entities

- **Unified route**: One approved top-level destination plus its direct-entry path and active-navigation state.
- **Keys tab**: One of the four existing mnemonic/restore/expert/sign-and-verify tools hosted within Keys.
- **Vault entry**: An encrypted local record with an id, secret-kind tag, label, value, and creation timestamp.
- **Provider preference**: Non-secret provider and network selection that may persist independently of a credential.
- **Signing result**: Body hash, verification key, signer hash, signature, detached vkey witness, attachment action, and patched transaction CBOR.
- **Parity record**: A legacy or transplanted surface mapped to its unified home and automated/live evidence.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 12 mapped legacy/transplanted surface groups are reachable through the seven approved top-level destinations in one responsive shell.
- **SC-002**: All 73 pre-existing browser cases (18 Cardano Swiss Knife and 55 transplanted inspector cases) pass against the unified artifact, plus dedicated signing-loop and storage-migration coverage.
- **SC-003**: All 9 UX capture scenarios succeed at desktop, laptop, and mobile targets with no navigation or result-tab overrun.
- **SC-004**: A browser-storage audit finds zero cleartext values or writes for mnemonics, private/signing keys, Blockfrost project IDs, and Koios bearer tokens after initialization and after each secret workflow.
- **SC-005**: The signing-loop test produces patched CBOR containing one additional vkey witness and exposes the detached witness and attachment action to the user.
- **SC-006**: The full inherited and ticket-extended `./gate.sh` exits 0 at final head, and the deployed preview returns HTTP 200 for every canonical and compatibility route.

## Assumptions

- The human-approved Q-001 route/surface parity map is authoritative for navigation and PR reporting.
- Existing vault cryptography and file format are reused unchanged; this ticket changes consumers and storage policy, not cryptographic design.
- Theme choice and RDF/library books are not secret material and may continue using local storage.
- Existing `/inspector/` URLs are compatibility entries for the same shell, not a second application.
- Engine artifacts remain flake inputs and `cardano-ledger-functional/v1` remains the only transaction-engine interface.

## Boundaries

- No new tools or surfaces.
- No engine, envelope, protocol-registry, or ledger-semantic changes.
- No transaction submission, hardware-wallet, or bootstrap-witness work.
- No changes in `/code/cardano-ledger-inspector*` or any sibling worktree.
- MIT remains the repository license.
