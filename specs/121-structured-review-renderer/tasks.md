# Tasks — structured signer-review decision view

Requirement and criterion ids referenced below are defined in `spec.md`; the render
contract, book-flag semantics and slice boundaries are defined in `plan.md`. Neither is
restated here.

## Slice 0 — orchestration (orchestrator-owned)

- [X] T000 Bootstrap worktree, branch `feat/121-structured-review-renderer`, `gate.sh`,
      draft PR #125; verify the `nix run .#ci-node-api` baseline is green at branch HEAD.
- [X] T000a Record ruling A-001 and the blocking upstream dependency
      `cardano-ledger-inspector#168` in `spec.md` and `rulings/`.

## Slice 1 — `book-flags`

Commit: `feat(cli): accept ordered protocol and user review books`

- [X] T001 RED: prove protocol books are passed before user books, and that
      `--user-book` and `--book` interleave in command-line order (FR-007, FR-008).
- [X] T002 RED: prove one identifier labelled differently by two supplied books yields
      two resolution rows in caller book order, with no deduplication (FR-009, SC-003).
- [X] T003 GREEN: collect `--protocol-book` and `--user-book`/`--book` into the two
      ordered lists and call the capability with `protocolBooks` / `userBooks`; reject
      the two NEW flags for non-`review` transaction commands, leaving `--book`'s
      existing non-`review` legacy `books` behaviour untouched (ruling A-002 — an
      earlier draft said "all three", which contradicted the unchanged-`--book`
      requirement and would have broken shipped tests).
- [X] T004 Update `txUsage` so `csk tx review` documents both new flags and marks
      `--book` as a retained compatibility alias.
- [X] T005 Run `nix run .#ci-node-api` and `./gate.sh`, then commit.

## Slice 2 — `json-output`

Commit: `feat(cli): return the structured review through --output json`

- [X] T006 RED: prove `csk tx review --output json` exits 0 and emits
      `{version:1, ok:true, value:<capability result>}` with the result unchanged
      (FR-006, SC-004).
- [X] T007 RED: prove a typed failure under `--output json` still emits the JSON error
      envelope with its existing code and exit status (FR-012).
- [X] T008 GREEN: stop rejecting `--output` for `review` and stop stringifying the value
      before the JSON envelope; human mode keeps rendering.
- [X] T009 Run `nix run .#ci-node-api` and `./gate.sh`, then commit.

## Slice 3 — `decision-view`

Commit: `feat(cli): render the signer review as a decision view`

- [X] T010 Make the renderer unit proof reachable inside the sandboxed check: copy `cli`
      into the check's work tree and add the new test file to its `node --test` list.
- [X] T011 RED: renderer proof over a canonical review result covering all five control
      categories, asserting each renders its own category, role, role provenance,
      evidence list and exact lovelace, and that no two collapse (FR-002, SC-002).
- [X] T012 RED: renderer proof that `signer_controlled` change, `external_key` value and
      `script`-locked value are three unambiguous rows with exact lovelace, and that the
      asset column is labelled a count of distinct non-ADA asset classes, never an amount
      (FR-004; interim shape per ruling A-001 — asserting exact asset *amounts* is
      Slice 4, blocked on `cardano-ledger-inspector#168`).
- [X] T013 RED: renderer proof for `context.input_status`, `net_signer_value` and every
      warning rendering plainly, with no readiness enum anywhere in the output (FR-005).
- [X] T014 RED: renderer proof that an unrecognised top-level review field survives into
      the rendered document (FR-010, SC-006).
- [X] T015 RED: renderer proof of determinism — two renders of one result are byte-equal,
      and the output carries no digit grouping, locale formatting or float artefact
      (FR-001, FR-003).
- [X] T016 RED: renderer proof of empty-section shapes and full-length addresses
      (FR-011), including the no-`resolutions` case versus the empty-`resolutions` case.
- [X] T017 GREEN: implement the render contract in `cli/tx-review.mjs`, replacing the
      raw envelope dump.
- [X] T018 Rewrite the end-to-end Amaru golden to the decision view and keep its
      no-provider-request assertion (SC-005).
- [X] T019 Document the decision view and the new flags in the `csk tx review` section
      of `docs/user/usage.md`.
- [X] T020 Run `nix run .#ci-node-api` and `./gate.sh`, then commit.

## Slice 4 — `upstream-asset-amounts`

Blocked on https://github.com/lambdasistemi/cardano-ledger-inspector/issues/168. Not
dispatchable in this control turn; see `spec.md` "Blocked acceptance" and ruling A-001.

- [X] T021 When #168 lands: render exact per-asset policy id, asset name and quantity.
- [X] T022 When #168 lands: upgrade the three-category regression proof to assert exact
      asset amounts, satisfying #121's literal acceptance bullet.

## Finalization (orchestrator-owned)

- [ ] T023 Refresh the PR body against delivered behaviour.
- [ ] T024 Run the finalization audit over every commit on the branch.
- [ ] T025 Drop `gate.sh`.
- [ ] T026 Mark PR #125 ready. The A-001 gate on T021/T022 (i.e. on cardano-ledger-inspector#168) is DISCHARGED: #168 merged as 007251ea, #121 Slice 4 landed as 8ee2f61.

## Slice 5 — `engines-manifest-sync`

Added after the Slice 4 gate run. `./gate.sh` failed at `check-release-manifests`:
this repo records the inspector pin in TWO more places besides `flake.lock`, and
they still held the pre-#168 revision. The Slice 4 brief's owned-files list did
not know about them — an orchestrator planning gap the gate caught.

- [X] T027 Sync `release/engines.json` and `docs/reference/engines.md` to the
      inspector revision and narHash now in `flake.lock`
      (`007251eaaf3d5b75df2bd0902b4f01081c0df0a1`). Historical references to the
      old revision in `specs/**` are records of what was true then and must not
      be rewritten.
