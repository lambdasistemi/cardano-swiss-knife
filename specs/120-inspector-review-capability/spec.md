# Specification: Inspector-owned signer review capability

## P1 user story

As a CSK host developer, I call one shared transaction-review capability and
receive the exact structured signer review produced by the pinned ledger
inspector, decorated only with operator-book labels for identifiers present in
that transaction.

## Functional requirements

- **FR-001**: The public Node API MUST expose `reviewTransaction(input,
  options)` and dispatch the inspector-owned `tx.review` operation. It MUST NOT
  compose `tx.inspect`, `tx.intent`, `tx.witness.plan`, or `tx.validate`, or
  reconstruct signer meaning in CSK.
- **FR-002**: The inspector envelope (`ledger_functional_layer`, `op`, and
  every field below `result.review`) MUST pass through unmodified. This
  includes the inspector's control categories, evidence provenance,
  `context.input_status`, `net_signer_value.provable`, claims, warnings, and
  any future additive fields.
- **FR-003**: CSK MUST NOT synthesize a readiness enum. The currently merged
  inspector has no `ready_for_witnesses`, `fully_valid`, `blocked`, or
  `rejected` review field; hosts consume only the status fields the inspector
  actually returns.
- **FR-004**: `reviewTransaction` MUST accept ordered
  `protocolBooks: string[]` and `userBooks: string[]` options whose entries are
  Turtle file paths. Protocol-book order and user-book order MUST be
  preserved, with protocol books processed before user books.
- **FR-005**: Unreadable or invalid supplied books MUST return a typed
  fail-closed error with no partial review value. The existing `BOOK_IMPORT`
  error family is the compatibility contract.
- **FR-006**: With supplied books, the capability MUST add one top-level
  `resolutions` array and MUST NOT return imported book contents. Resolution
  rows MUST be restricted to identifiers present in the transaction-only
  `tx.rdf` graph; an unrelated labeled book entity MUST not appear.
- **FR-007**: Transaction membership for label resolution MUST be determined
  mechanically by the pinned RDF engine over RDF terms. CSK MUST NOT select
  identifiers by interpreting review fields or adding Cardano semantics in
  JavaScript.
- **FR-008**: Offline CBOR and TextEnvelope review inputs MUST perform no
  provider request. An explicit provider/network selection MUST reuse the
  existing provider-context implementation and pass the resolved producer
  context to `tx.review`.
- **FR-009**: Provider credentials, vault passphrases, book contents, and
  other secrets MUST never appear in a successful or failed review result.
- **FR-010**: The packaged ledger-inspector input MUST advance to merged
  revision `b99028af070c85211098cbfee87bb5a80e4639df`, which contains
  cross-target `tx.review` support built on the shared wrapper delivered by
  inspector issues #31 and #165.
- **FR-011**: The existing internal `commands/tx.js` review adapter MUST
  delegate to `reviewTransaction` and remove the former
  inspect+intent+witness-plan+validate composition.
- **FR-012**: Until issue #121 replaces the presentation, existing
  `csk tx review --book PATH` MUST pass those paths through as user books and
  emit a deterministic raw dump of the canonical envelope plus resolutions.
  This placeholder MUST add no new flags, `--output json` behavior, readiness
  state, category mapping, or human decision interpretation.
- **FR-013**: Signing, witness attachment, transaction submission, WebUI
  rendering, and new CLI review flags remain out of scope.

## Success criteria

- **SC-001**: A packaged Node test proves `reviewTransaction` is exported and
  returns `op: "tx.review"` with `version: "cardano-tx-review/v1"`, inspector
  control categories/evidence/status fields intact, and no legacy composite
  fields.
- **SC-002**: Raw CBOR and equivalent TextEnvelope inputs return equal
  canonical reviews without outbound network access.
- **SC-003**: A book test proves relevant labels resolve, an unrelated
  sentinel label is absent, no imported `books` value is returned, and invalid
  or unreadable paths fail as `BOOK_IMPORT`.
- **SC-004**: Provider-backed coverage proves the existing context resolver is
  used and no credential appears in the returned value.
- **SC-005**: The existing CLI review command emits the deterministic canonical
  raw golden, keeps rejecting `--output json`, and no longer depends on the
  legacy composite evidence shape.
- **SC-006**: `nix run .#ci-node-api` and the complete `./gate.sh` both exit
  zero.

## Clarifications

- The exact inspector envelope is authoritative; additive book decoration is
  top-level and does not mutate `result.review`.
- “Identifiers actually present” means terms established from the original
  transaction-only `tx.rdf` graph, not all labeled entities in the combined
  book graph.
- Existing `--book` is an operator/user-book compatibility path. New
  `--protocol-book` / `--user-book` CLI flags and the final human renderer
  belong to issue #121.
- The raw canonical CLI dump is a deliberate short-lived, non-semantic
  placeholder so this ticket remains bisect-safe while #121 stays separately
  reviewable.

## Non-goals

- A CSK-owned readiness model or any host-side ledger interpretation.
- A full-book listing, inline mutation of inspector control groups, or
  resolution of identifiers absent from the transaction.
- CLI `--output json`, new CLI flags, final CLI rendering, or WebUI rendering.
- IPFS fetching, signing, witness attachment, or submission.
