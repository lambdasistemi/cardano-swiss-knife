# Feature Specification: Family-First Restore and Build Flow

**Feature Branch**: `002-family-first-restore`  
**Created**: 2026-04-07  
**Status**: Draft  
**Input**: User description: "Reframe the UX around the wallet/address family, make mnemonic the basic path, and treat manual key material as a later advanced flow."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore From Mnemonic By Family (Priority: P1)

A user begins by choosing which wallet or address family they are restoring, then enters a recovery phrase and gets the corresponding outputs for that family without needing to understand internal key shapes.

**Why this priority**: This is the basic user journey. A recovery phrase is the primary material users actually keep, and the app should meet them at that starting point instead of requiring derived xpubs.

**Independent Test**: Choose `Icarus`, paste a known recovery phrase, and verify the resulting bootstrap address matches `cardano-addresses` for the same mnemonic and network.

**Acceptance Scenarios**:

1. **Given** the restore/build flow is open, **When** the user chooses `Icarus`, enters a valid recovery phrase, and selects a network, **Then** the app shows the derived Icarus bootstrap address.
2. **Given** the restore/build flow is open, **When** the user chooses `Byron`, enters a valid recovery phrase, and selects a network, **Then** the app shows the derived Byron bootstrap address.
3. **Given** the restore/build flow is open, **When** the user chooses `Shelley`, enters a valid recovery phrase, and selects the relevant derivation inputs, **Then** the app shows the Shelley-derived outputs already supported by the app.

---

### User Story 2 - Keep The Flow Coherent Across Families (Priority: P1)

A user sees a single restore/build flow whose first decision is the wallet family, and the rest of the screen adapts so only the relevant fields and outputs are shown.

**Why this priority**: The app currently splits mnemonic handling and legacy bootstrap construction into disconnected panels. That is technically accurate but user-hostile. A coherent family-first flow is necessary before adding more advanced entry points.

**Independent Test**: Switch between `Shelley`, `Icarus`, and `Byron` and verify that the visible controls change appropriately while the current mnemonic remains reusable.

**Acceptance Scenarios**:

1. **Given** a mnemonic has been entered, **When** the user switches from `Shelley` to `Icarus`, **Then** the app reuses the mnemonic and updates the visible controls and outputs for Icarus semantics.
2. **Given** a mnemonic has been entered, **When** the user switches from `Icarus` to `Byron`, **Then** the app updates the outputs using Byron semantics rather than reusing Icarus-derived intermediates.
3. **Given** a family-specific field is irrelevant to the selected family, **When** the user changes family, **Then** that field is hidden and no longer affects the result.

---

### User Story 3 - Fail Clearly When The Recovery Material Does Not Fit The Family (Priority: P2)

A user receives explicit feedback when the selected family requires derivation semantics or passphrase inputs that are missing or incompatible.

**Why this priority**: Family-first only works if the app explains why a phrase or passphrase setup does not produce an address, instead of silently doing nothing or exposing low-level internal errors.

**Independent Test**: Choose a family requiring additional passphrase semantics, omit them, and verify the app explains what is missing.

**Acceptance Scenarios**:

1. **Given** the user has selected a family that supports an optional passphrase, **When** the passphrase input is malformed, **Then** the app shows a family-specific validation message.
2. **Given** the user enters an invalid mnemonic, **When** derivation is attempted, **Then** the app shows a recovery-phrase validation error and does not show a misleading address.
3. **Given** the user changes family after a successful result, **When** the current inputs are insufficient for the new family, **Then** the app clears the prior success state and shows what is now needed.

---

### User Story 4 - Defer Expert Key-Material Entry To Explicit Advanced Flows (Priority: P3)

A power user can still access manual key-material entry later, but those paths no longer define the default restore/build journey.

**Why this priority**: Explicit xpub and root-xpub entry are valid capabilities, but they should not distort the primary mnemonic-first experience. The app needs clear separation between common and expert flows.

**Independent Test**: Verify the primary restore/build view can be demonstrated end to end without requiring `addr_xvk` or `root_xvk` inputs.

**Acceptance Scenarios**:

1. **Given** a normal user enters the restore/build flow, **When** they stay on the default path, **Then** they are never required to supply manual xpubs.
2. **Given** expert key-material entry is not yet implemented in the new flow, **When** the user looks for it, **Then** the UI indicates it is an advanced follow-up rather than silently omitting it.

## Edge Cases

- What happens when a mnemonic is valid in general but the selected family requires different derivation semantics than the currently displayed outputs? The app must recompute from the mnemonic using the newly selected family and replace the old outputs.
- What happens when the user switches family after entering a second-factor passphrase? The app must either reuse it only where valid or clearly mark it as not applicable.
- What happens when the selected family is not yet fully supported in the unified flow? The UI must state that the family is not yet available instead of falling back to another family’s derivation.
- What happens when privacy mode is enabled? Mnemonic and derived sensitive outputs must remain hidden consistently across all families.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST make wallet/address family selection the first step of the restore/build journey.
- **FR-002**: System MUST support mnemonic-first restore/build flows for `Shelley`, `Icarus`, and `Byron`.
- **FR-003**: System MUST derive each family’s outputs using that family’s upstream `cardano-addresses` semantics rather than reusing another family’s derived intermediates.
- **FR-004**: System MUST reuse the app’s existing mnemonic state across families so a user can switch families without re-entering the same recovery phrase.
- **FR-005**: System MUST adapt visible controls and outputs to the selected family.
- **FR-006**: System MUST preserve the existing Shelley derivation capability while integrating it into the family-first flow.
- **FR-007**: System MUST produce Icarus bootstrap addresses from mnemonic inputs with outputs matching `cardano-addresses`.
- **FR-008**: System MUST produce Byron bootstrap addresses from mnemonic inputs with outputs matching `cardano-addresses`.
- **FR-009**: System MUST surface family-specific validation and passphrase requirements as user-facing errors.
- **FR-010**: System MUST keep privacy-mode protections consistent for mnemonic and derived outputs across all supported families.
- **FR-011**: System MUST define manual key-material entry (`addr_xvk`, `root_xvk`, private keys) as an advanced follow-up flow rather than the default restore/build path.
- **FR-012**: System MUST be backed by Haskell-generated vectors for all mnemonic-first family flows added in this feature.
- **FR-013**: System MUST include browser-level UI tests covering family selection, mnemonic entry, and family-specific outputs.

### Key Entities *(include if feature involves data)*

- **Wallet Family**: The semantic derivation mode selected by the user, such as `Shelley`, `Icarus`, or `Byron`.
- **Recovery Material**: The mnemonic and any family-applicable second-factor passphrase required to derive family-specific keys.
- **Family Output**: The address, key, or pipeline values produced after interpreting the recovery material under a selected wallet family.
- **Advanced Entry Mode**: A later, explicitly expert-oriented path for manual key-material input that is intentionally separate from the mnemonic-first journey.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can derive an Icarus bootstrap address from mnemonic input in a single screen without supplying manual xpubs.
- **SC-002**: A user can derive a Byron bootstrap address from mnemonic input in a single screen without supplying manual xpubs.
- **SC-003**: Switching the selected wallet family updates the visible flow and outputs within one interaction and never leaves stale outputs from the previous family.
- **SC-004**: All mnemonic-first family outputs in the unified flow are byte-identical to the Haskell `cardano-addresses` reference for the same inputs.
- **SC-005**: Browser tests cover all supported family-first restore journeys and pass in CI.

## Assumptions

- The initial unified flow will cover `Shelley`, `Icarus`, and `Byron`; `Shared` can remain a follow-up if not completed in the same slice.
- The app may continue to expose existing mnemonic generation separately, but restore/build must start with family selection.
- Advanced manual key-material entry remains valid product scope, but it is not required to ship the family-first mnemonic flow.
- Existing Haskell vector infrastructure will be extended rather than replaced for this feature.
