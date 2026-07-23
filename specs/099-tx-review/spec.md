# Specification: Human-readable transaction review

## P1 user story

As a treasury signer, I review a Conway transaction before signing and see its
payments, signer state, expiry, book-resolved intent, and mechanical ledger
preflight without having to interpret CBOR or CSK's JSON operation envelopes.

## Functional requirements

- FR-001: `csk tx review --tx-file PATH --book PATH ...` MUST accept a raw
  transaction-CBOR file or transaction TextEnvelope and render a deterministic
  terminal summary.
- FR-002: The review MUST remain offline when provider options are absent and
  MUST accept the same paired `--provider blockfrost|koios` and
  `--network mainnet|preprod|preview` selection, vault policy, and redacted
  provider failures as the existing local transaction commands.
- FR-003: The summary MUST display the transaction ID, regular and reference
  input counts, output count, fee, validity lower/upper bounds, and each output
  in ledger order with its raw address, lovelace amount, and native assets.
- FR-004: Outputs classified by the existing intent result as signer-controlled
  MUST be identified as change; the remaining outputs MUST be identified as
  recipient/script outputs. Existing intent evidence MUST supply total
  collateral and collateral-return amounts; the review MUST NOT infer ledger
  semantics independently.
- FR-005: Every required signer MUST be listed in deterministic order with its
  raw hash and present/missing witness status. A selected-book label MUST be
  shown alongside the raw hash when the existing RDF resolver supplies one.
- FR-006: Metadata claims MUST be rendered from the existing transaction-intent
  result. Every RDF resolution returned across the supplied books MUST be
  listed as `raw` plus label, while unresolved claim and transaction identifier
  values remain visible in raw form.
- FR-007: The ledger preflight section MUST say `completed` only when the
  existing validation result is complete. Otherwise it MUST say `incomplete`
  and list each missing-context item without collapsing distinct input or
  reference-input entries.
- FR-008: A completed preflight MUST retain the existing ledger verdict
  (`valid`, `invalid`, or `rejected`) and MUST NOT translate incomplete
  evidence into a verdict.
- FR-009: Malformed transaction CBOR/TextEnvelope, unreadable books, invalid
  book documents, RDF engine failures, ledger engine failures, and provider
  failures MUST remain typed fail-closed errors with actionable diagnostics and
  no partial review output.
- FR-010: The terminal renderer MUST be deterministic: stable section order,
  ledger order for transaction arrays, caller order for books, and no timestamps,
  colors, terminal-width wrapping, network-dependent decoration, or locale-
  dependent number formatting.
- FR-011: Golden/integration coverage MUST pin the complete rendered summary for
  `docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex`, including
  an Amaru-oriented Turtle book that labels its treasury signer, treasury
  script, and metadata transaction identifier.
- FR-012: Integration coverage MUST prove the provider-enriched completed
  preflight path using the existing complete Conway ledger fixture and provider
  context resolution, separately from the representative offline Amaru golden.

## Success criteria

- SC-001: Two identical offline invocations over the representative transaction
  and books produce byte-identical stdout and no provider requests.
- SC-002: The Amaru golden contains the expected transaction ID, `11` inputs,
  `4` reference inputs, `2` outputs, fee `1527153` lovelace, validity upper
  bound `192815425`, change and collateral-return amounts, a missing required
  signer with its selected-book label, metadata claim text, and raw+label book
  resolutions.
- SC-003: The offline golden states that ledger preflight is incomplete and
  lists all source-output plus network/slot/epoch/protocol-parameter/account-
  state gaps reported by the ledger engine.
- SC-004: A provider-backed complete-fixture invocation states that ledger
  preflight completed and preserves the engine's verdict.
- SC-005: Focused CLI/Node package proof and the full repository gate exit zero.

## Non-goals

- Fetching, interpreting, or judging referenced invoices, contracts, or proofs
  of acceptance.
- Signing, attaching witnesses, submitting transactions, or managing vault
  contents.
- Automatically selecting a provider or fetching context without explicit
  provider/network options.
- Replacing or changing the JSON contracts of `tx inspect`, `tx intent`,
  `tx witness plan`, or `tx validate`.
- Adding host-side CBOR, ledger, cryptographic, provider, or RDF semantics.
- Adding a WebUI review surface or changing the authoritative ledger/RDF
  engines.

## Dependencies and assumptions

- Issue #104 / PR #106 is merged and supplies the explicit local
  provider/network context resolver used here.
- TextEnvelope parsing from #67 and provider HTTP from #10 are consumed as-is.
- The review is a presentation composition over existing authoritative
  operation results. Output classification, witness requirements, ledger
  preflight, metadata interpretation, and RDF resolution remain owned by those
  existing operations.
- Issue #87 remains open as a tracked Firefox/RDF initialization flake; it is
  not treated as an expected failure. Issue #90 remains open; fresh worktrees
  are bootstrapped with `nix develop -c spago build` before the gate.
