# Feature Specification: Provider and validation truth

**Feature Branch**: `fix/43-provider-validation-truth`
**Created**: 2026-07-17
**Status**: Complete
**Input**: cardano-swiss-knife issues #43 and #30, parent epic #45

## P1 user story

As a workbench user with Blockfrost selected and no credentials, I decode a
transaction and observe no request to Koios, a visible explanation that
validation context is unavailable, and a banner that never says validation
passed while ledger evaluation is incomplete.

## Acceptance scenarios

1. Given Blockfrost is selected with an empty project ID, decoding the existing
   Conway fixture sends zero requests to every Koios endpoint.
2. That same no-credentials decode renders a prominent Validation-tab notice
   whose cause names the missing Blockfrost credentials.
3. That same result reports `Status = incomplete` and `Complete = no`, renders
   an amber `Validation incomplete` banner, and contains no `Validation passed`
   claim.
4. A configured Blockfrost validation-context fetch that fails at the network
   boundary renders the provider failure cause in the same notice and does not
   consult Koios.
5. A complete applyTx result with all required context may render
   `Validation passed`; incomplete, invalid, rejected, or context-error results
   may not.
6. The regression is observed RED before implementation and GREEN afterward;
   the Nix-owned Playwright runner and extended repository gate pass.

## Functional requirements

- **FR-001**: Provider dispatch MUST use only the selected provider. Empty
  Blockfrost credentials MUST NOT trigger a Koios fallback.
- **FR-002**: A selected provider that cannot fetch validation context because
  credentials are absent MUST record an explicit, user-readable cause without
  issuing a substitute-provider request.
- **FR-003**: Provider validation-context failures, including browser network
  or CORS failures, MUST render prominently in the Validation tab with their
  captured cause.
- **FR-004**: Browser normalization MUST preserve structured ledger `status`,
  `complete`, and `valid_for_supplied_context` values instead of deriving the
  verdict from presentation strings or JSON parse success.
- **FR-005**: The green `Validation passed` banner MUST require
  `status = valid`, `complete = true`, and
  `valid_for_supplied_context = true`; incomplete evaluation MUST use warning
  tone and explicit incomplete wording.
- **FR-006**: Ledger validation and SHACL conformance MUST remain separate
  evidence axes. SHACL success MUST NOT turn an incomplete ledger result green.
- **FR-007**: Permanent Playwright coverage MUST assert request routing,
  surfaced provider cause, incomplete wording/tone, absence of a pass claim,
  and the complete-valid positive case.
- **FR-008**: The implementation MUST NOT add providers, change credential UX,
  introduce an offline-first path, or modify the ledger engine.

## Success criteria

- **SC-001**: The no-credentials Blockfrost journey records zero Koios requests
  and visibly reports `Blockfrost credentials not supplied`.
- **SC-002**: The incomplete journey renders `Validation incomplete`, never
  `Validation passed`, and uses the warning verdict class.
- **SC-003**: The existing complete configured-provider journey proves the
  positive `Validation passed` case.
- **SC-004**: `nix run .#ci-inspector-playwright` and `./gate.sh` exit 0.

## Out of scope

- New providers or provider fallback redesign.
- Credential persistence, enrollment, or settings UX changes.
- Offline-first validation context.
- Conway ledger semantics or engine/WASM changes.
