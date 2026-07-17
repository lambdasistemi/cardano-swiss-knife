# Feature Specification: Truthful absent fields

**Feature Branch**: `fix/42-truthful-absent-fields`
**Created**: 2026-07-17
**Status**: In progress
**Input**: cardano-swiss-knife issue #42, parent epic #45, and issue #41

## P1 user story

As an operator inspecting a decoded transaction, I see a body field in an
"Absent fields" chip only when that field is genuinely absent, so present
signers, validity bounds, and withdrawals are not hidden as nulls.

## Acceptance scenarios

1. Given the checked-in treasury reorganize transaction, the direct body rows
   have this exact present partition, in CDDL order: `inputs`, `outputs`, `fee`,
   `ttl`, `withdrawals`, `auxiliary_data_hash`, `script_data_hash`, `collateral`,
   `required_signers`, `collateral_return`, `total_collateral`, and
   `reference_inputs`.
2. The same transaction has this exact absent partition: `certs`, `update`,
   `validity_start_interval`, `mint`, `network_id`, `voting_procedures`,
   `voting_proposals`, `donation`, and `current_treasury_value`.
3. `ttl` renders `192815425`; `withdrawals` renders the existing withdrawal
   account and `0` lovelace; `required_signers` renders
   `8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1`.
4. In B-Labeled row style, the `required_signers` row inherits issue #41's
   generic resolved label and visibly contains `network_compliance scope owner`.
5. The regression is observed RED before implementation and GREEN afterward;
   the Nix-owned Playwright runner and extended repository gate pass.

## Functional requirements

- **FR-001**: Structure rows MUST be derived from the decoded RDF graph and
  MUST NOT contradict the pinned engine's `tx.browse` or `tx.rdf` results.
- **FR-002**: `required_signers`, `ttl`, and `withdrawals` MUST render as
  present when their existing RDF predicates are present and as null only when
  those predicates are absent.
- **FR-003**: The direct body-field present and absent sets MUST exactly match
  the two acceptance partitions; checking only that three labels moved is
  insufficient.
- **FR-004**: Row order MUST remain the existing 21-field CDDL order and the
  existing absent-chip grouping behavior MUST remain intact for true nulls.
- **FR-005**: The required-signer value MUST retain its identifier IRI/raw hash
  so issue #41's row-generic book resolution renders the owner label.
- **FR-006**: The implementation MUST reuse existing engine RDF. It MUST NOT
  change the engine, byte ranges, tree architecture, book semantics, or add
  provider/network calls.
- **FR-007**: Permanent Playwright coverage MUST use the existing treasury
  fixture and exact Amaru bundle, and `gate.sh` MUST inventory the affected
  fixture and assertions.

## Success criteria

- **SC-001**: The Playwright journey asserts all 21 direct body fields belong
  to exactly one of the 12-present or 9-absent sets.
- **SC-002**: The three repaired rows expose the engine-derived values and the
  required-signer B-Labeled row shows `network_compliance scope owner`.
- **SC-003**: `nix run .#ci-inspector-playwright` and `./gate.sh` exit 0.

## Out of scope

- Byte-range computation or display.
- A decoded-tree redesign or changes to absent-chip presentation.
- Engine, RDF vocabulary, book import, or resolution-semantic changes.
