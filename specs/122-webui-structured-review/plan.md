# Implementation Plan — WebUI Structured Signer Review

## Tech context

- Halogen workbench under `docs/inspector/src/`. `Main.purs` is ~6,950 lines and
  holds the transaction flow; `FFI/Json.purs` (468 lines) holds the `operation*`
  parsers that currently reconstruct meaning.
- Engine access is `runLedgerOperation h "<op>" <argsJson>`, already used for
  `tx.inspect`, `tx.identify`, `tx.intent`, `tx.witness.plan`, `tx.validate`,
  `tx.evaluate.scripts`, `tx.rdf` around `Main.purs:6202-6260`.
- `tx.review` is published by the pinned inspector and already consumed by the
  CLI (`cli/tx-review.mjs`) and the node API. The engine work is done; this is a
  consumption change.
- Proofs: `just check` (purs-tidy), `nix run .#ci-build`, and — load-bearing here
  — `nix run .#ci-playwright` for browser-level evidence.

## Design

The workbench asks the engine the wrong question. It asks `tx.intent` (facts)
and derives the signer-facing meaning itself. It should ask `tx.review`
(meaning) and render it.

That makes this a substitution, not an addition, and the substitution is the
point: FR-002 is only satisfied when the old derivation is **deleted**, not left
dormant beside the new path. A slice that adds `tx.review` rendering while
leaving the `IntentSummary` derivation in place has not done the ticket — it has
doubled the duplication.

`tx.intent` itself stays available: other parts of the workbench legitimately
use inspect/identify/witness-plan/validate results. What goes is the code that
turns an intent result into signer-facing *judgement*.

## Slices

Each is one bisect-safe commit.

### Slice 1 — `consume-tx-review`

Call `tx.review`, parse its envelope into a typed value, and delete the
`IntentSummary`-based interpretation that currently produces signer-facing
meaning.

- `docs/inspector/src/Main.purs` (review call + wiring)
- `docs/inspector/src/FFI/Json.purs` + its FFI `.js` (review parser; remove the
  derivation the review replaces)

Proof: `just check`, `nix run .#ci-build`. RED: a test asserting the review
result reaches the render layer, failing before the call exists.

**Risk, assessed at dispatch not now:** how much of `IntentSummary` is
signer-facing judgement versus plumbing other views depend on. If removal reaches
further than expected, the driver stops and Q-files rather than widening.

### Slice 2 — `render-review-document`

Render categories, evidence provenance, readiness state and every blocker from
the parsed result.

- `docs/inspector/src/Main.purs` (render functions)

FR-003 is the sharp one: every blocker must render. The proof must fail if a
blocker is dropped, not merely if none render.

### Slice 3 — `book-decoration`

Decorate with operator book labels, restricted to identifiers present in the
transaction.

- `docs/inspector/src/Main.purs`, book plumbing as needed

Proof must include a book carrying an identifier absent from the transaction,
asserting it is not shown — the criterion is about what is *withheld*.

### Slice 4 — `value-emphasis`

Make high-value movements and signer-controlled change visually distinct from
external-key and script-locked value.

Proof is browser-level (`ci-playwright`): distinctness is a rendered property,
not a typed one.

### Slice 5 — `per-asset-amounts`

Render per-asset policy id, asset name and exact quantity per control group,
keeping `asset_class_count` independent.

Mirrors the CLI shape landed in #121 (`cli/tx-review.mjs`). Assertions compare
exact quantities, not shapes — a test that passes on a wrong amount proves
nothing, which #121 established by mutation-testing its own assertions.

## Ordering rationale

Slice 1 must land first: nothing else can render a result that is not yet
fetched. Slices 2-5 each add a facet of the same rendered document and could in
principle reorder, but 2 before 3 keeps book decoration decorating something that
already exists, and 5 last keeps the newest upstream field from complicating the
substitution in slice 1.

## Risks

- **`Main.purs` size.** A 7k-line module invites incidental churn. Every slice
  names its owned region; out-of-scope edits are strikes.
- **Playwright is the only real proof of rendering.** Typecheck and purs-tidy
  say nothing about whether a signer sees the blockers. Slices 2-5 must not
  claim done on a build alone.
- **Deletion is the deliverable in slice 1.** Review must confirm the old path
  is gone rather than orphaned; an unused derivation left in the tree still
  satisfies a naive "does it render" check and fails FR-002.
