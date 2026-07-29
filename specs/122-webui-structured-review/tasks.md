# Tasks — WebUI Structured Signer Review

Issue: https://github.com/lambdasistemi/cardano-swiss-knife/issues/122

One commit per slice, bisect-safe, `Tasks:` trailer naming the closed tasks.

## Slice 1 — `consume-tx-review`

Commit subject: `feat(webui): consume the shared structured signer review`

- [X] T101 RED: assert the review parser exists, is exported, and parses a
      `tx.review` envelope into the typed value using the real field names from
      `cli/tx-review.mjs`. NARROWED per A-002: a node test of the FFI module
      cannot prove the workbench actually calls `tx.review` — it would pass with a
      parser nobody invokes. The end-to-end proof moves to T105a in slice 2, where
      Playwright has something visible to assert. Moved, not dropped.
- [X] T102 GREEN: call `tx.review` via `runLedgerOperation` alongside the
      existing operations, and parse its envelope into a typed value.
- [X] T103 GREEN: delete the `IntentSummary`-based derivation of signer-facing
      meaning. Deletion is the deliverable — an orphaned-but-present derivation
      does not satisfy FR-002. `tx.intent` itself stays where other views need it.
- [X] T104 Proof: `just check` and `nix run .#ci-build` green.

## Slice 2 — `render-review-document`

Commit subject: `feat(webui): render categories, provenance, readiness and blockers`

- [ ] T105a RED (moved from slice 1 per A-002): assert end-to-end that the
      workbench calls `tx.review` and the result reaches the render layer —
      provable here because there is now rendered output to assert against.
- [ ] T105 RED: assert every blocker the engine reports is rendered — the test
      must fail when one is dropped, not merely when none render.
- [ ] T105b GREEN (from A-003): render the preserved `version` and the
      unknown-field passthrough section, matching the CLI's "Additional
      inspector fields" behaviour (ruling A-003 / SC-006 on #121). Slice 1
      preserves these in the parsed value; rendering them is this slice.
- [ ] T106 GREEN: render control categories and evidence provenance.
- [ ] T107 GREEN: render readiness state and every blocker.
- [ ] T108 Proof: `nix run .#ci-playwright` green with the blockers visible in a
      browser, not only typechecked.

## Slice 3 — `book-decoration`

Commit subject: `feat(webui): decorate the review with operator book labels`

- [ ] T109 RED: assert a book identifier ABSENT from the transaction is not
      shown. This criterion is about what is withheld, so the test must exercise
      the absent case.
- [ ] T110 GREEN: decorate the engine result with book labels, restricted to
      identifiers present in the transaction.
- [ ] T111 Proof: `nix run .#ci-playwright` green.

## Slice 4 — `value-emphasis`

Commit subject: `feat(webui): distinguish high-value and signer-controlled value`

- [ ] T112 RED: assert high-value movements and signer-controlled change are
      rendered distinguishably from external-key and script-locked value.
- [ ] T113 GREEN: implement the distinction within the existing design system —
      no new one (explicit non-goal).
- [ ] T114 Proof: `nix run .#ci-playwright` green; distinctness is a rendered
      property and cannot be claimed from a build.

## Slice 5 — `per-asset-amounts`

Commit subject: `feat(webui): render exact per-asset amounts in the review`

Added by acceptance amendment 2026-07-29 so the WebUI reaches parity with the
CLI behaviour landed in #121.

- [ ] T115 RED: assert exact policy id, asset name and decimal quantity for a
      control group holding assets, and clean rendering for one holding none.
      Assertions compare exact values — a test that still passes on a wrong
      quantity proves nothing.
- [ ] T116 GREEN: render per-asset detail per control group, keeping
      `asset_class_count` independent — neither derived from the other, matching
      the upstream contract and the CLI.
- [ ] T117 Proof: `nix run .#ci-playwright` green.

## Orchestrator-owned

- [ ] T118 Final: full `./gate.sh` green at HEAD, PR body refreshed against
      delivered behaviour, finalization audit over every branch commit, drop
      `gate.sh`, mark ready. Merge is pre-authorized once CI is green — CI, not
      local gates alone.
