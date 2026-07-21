# Tasks: Provider Submission for Completed Entries

**Input**: [spec.md](spec.md), [plan.md](plan.md), issue #77, parent #66,
release epic #74, merged dependencies #10/#75, and concurrent ticket #76

**Story**: One shared operation submits only complete live entries through the
configured Blockfrost/Koios transport and is consumed by thin Node, CLI, and
explicit workbench adapters.

## Slice 0 — Intake, specification, and plan (orchestrator-owned)

- [X] T771 Refresh canonical main, read #77/#66/#74/#10/#75/#76, confirm both
  direct dependencies are merged, and inspect shared provider, TxEntry,
  ledger-engine, Node/CLI, browser, architecture, and test boundaries.
- [X] T772 Verify the current official Blockfrost and Koios binary submission
  contracts, identify a safe invalid-CBOR live-boundary proof, and establish a
  clean `./gate.sh` baseline.
- [X] T773 Author and validate specification, implementation plan, task/slice
  contracts, commit and push planning artifacts, and open the issue-linked
  draft PR.

## Slice 1 — Shared provider submission (driver+navigator)

**Goal**: Deliver provider-neutral binary submission, completed-entry gating,
and typed receipts/errors solely in the canonical shared provider module.

- [X] T774 [US1] Add RED tests for exact Blockfrost submit endpoint, method,
  project-id/content-type headers, signed-CBOR body, HTTP 200 receipt, and all
  network bases.
- [X] T775 [US1] Add RED tests for exact Koios `/submittx`, existing optional
  bearer policy, CBOR content type/body, HTTP 202 receipt, and all networks.
- [X] T776 [US1] Add RED tests proving #75-derived incomplete, expired, and
  submitted states return deterministic errors with zero transport calls.
- [X] T777 [US1] Add RED tests for malformed CBOR hex, provider rejection,
  malformed JSON, invalid transaction id, and credential redaction.
- [X] T778 [US1] Implement the production/injectable submit functions,
  provider request mapping, binary fetch body, typed errors, and receipt with
  submitted entry by consuming existing provider and TxEntry policy.
- [X] T779 [US1] Prove no endpoint/auth duplication, no manifest/engine/domain
  expansion, and no host-side CBOR or ledger semantic fallback.
- [X] T780 Obtain navigator RED/GREEN approval, run the focused shared test and
  `./gate.sh`, and commit exactly once with
  `Tasks: T774, T775, T776, T777, T778, T779, T780`.

**Owned files**:

- `lib/src/Cardano/Provider.purs`
- `lib/src/Cardano/Provider.js`
- `test/src/Test/Provider.purs`

**Commit contract**:

```text
feat(provider): submit completed transaction entries

Route completed, live transaction entries through the selected shared
Blockfrost or Koios binary submit contract and return a typed receipt while
failing closed before IO for every ineligible entry.

Tasks: T774, T775, T776, T777, T778, T779, T780
```

## Slice 2 — Node and CLI submission adapters (driver+navigator)

**Goal**: Expose the shared operation through existing host contracts without
duplicating provider policy or weakening secret handling.

- [X] T781 [US2] Add RED packed-Node tests/types for completed-entry input,
  both provider routes, receipt output, lifecycle pre-IO rejection, coded
  provider failures, and credential redaction.
- [X] T782 [US2] Add RED CLI tests for explicit confirmation/cancellation,
  entry and signed-transaction file parsing, provider/network selection,
  structured output, exit codes, and vault-backed Blockfrost credentials.
- [X] T783 [US2] Expose a typed `submitTransactionEntry` Node operation that
  validates only host input shape and delegates policy to `Cardano.Provider`.
- [X] T784 [US2] Add `csk tx submit` through `node/src/commands/tx.js`, keeping
  credentials out of arguments/output and keeping submission separate from
  attach.
- [X] T785 [US2] Update the public export/type inventories and package smoke
  only where required by the new supported operation.
- [X] T786 Obtain navigator RED/GREEN approval, run focused Node/CLI tests and
  the extended `./gate.sh`, and commit exactly once with
  `Tasks: T781, T782, T783, T784, T785, T786`.

**Owned files**:

- `node/src/index.js`
- `node/src/index.d.ts`
- `node/src/error.js` (only if mapping requires it)
- `node/src/commands/tx.js`
- `cli/csk.mjs`
- `node/test/transaction-provider.test.mjs`
- `node/test/api-contract.test.mjs`
- `node/test/cli.test.mjs`
- `node/test/package-smoke.mjs` (only if required)
- `scripts/check-node-api-exports.mjs` (only if required)

**Commit contract**:

```text
feat(cli): expose completed-entry submission

Expose the shared completed-entry submit operation through the typed Node API
and an explicit CLI command while preserving result, confirmation, and secret
handling contracts.

Tasks: T781, T782, T783, T784, T785, T786
```

## Slice 3 — Confirmable workbench submission (driver+navigator; waits for #76)

**Goal**: Integrate with #76's committed active-entry/store/action shape and no
other browser state model.

- [X] T787 [US3] Receive and inspect #76's committed release point, rebase or
  merge it as directed, replace the provisional plan paths with exact owned
  files, and obtain parent/cross-lane resolution for any overlap before
  dispatch.
- [X] T788 [US3] Add browser RED for unavailable incomplete/expired submit and
  confirmation cancellation with zero provider requests.
- [X] T789 [US3] Add browser RED for engine-backed signed-CBOR assembly,
  selected-provider submission, success receipt, and persistence of the
  returned submitted entry.
- [X] T790 [US3] Add browser RED for provider failure leaving the entry
  complete/retryable with an actionable redacted error.
- [X] T791 [US3] Implement the explicit workbench action using only #76's
  state/store seam, existing ledger engine adapter, and shared provider submit.
- [X] T792 Obtain navigator RED/GREEN approval, run focused Playwright and the
  extended `./gate.sh`, and commit exactly once with
  `Tasks: T787, T788, T789, T790, T791, T792`.

**Owned files** (frozen after #76 merged to `origin/main` `02adeb3`; accepted
PR head `f5cb320`):

- `docs/inspector/src/Workbench.purs`
- `docs/inspector/src/TxSigning.purs`
- `docs/inspector/src/Provider.purs`
- `docs/inspector/src/Main.purs`
- `docs/inspector/dist/styles.css`
- `tests/transactions.spec.ts`

The slice extends #76's selected-entry/store/current-slot seam. It may not add
another entry list, persistence owner, provider policy implementation, or
host-side CBOR/ledger logic.

**Commit contract**:

```text
feat(workbench): confirm completed-entry submission

Add an explicit confirmed submit action to the entry-driven workbench, using
the ledger engine for assembly and the shared provider capability for IO while
persisting submitted state only after acceptance.

Tasks: T787, T788, T789, T790, T791, T792
```

## Orchestrator-owned finalization

- [X] T793 Review and stamp each behavior slice in its own accepted commit,
  independently run the evolving `./gate.sh`, push each frozen slice, and
  verify fresh remote CI before advancing dependent work.
- [X] T794 Run and record the safe real-provider invalid-CBOR rejection smoke,
  complete the PR body/final audit, verify every implementation task is
  checked, then stamp T793-T794 while dropping `gate.sh` in
  `chore: drop gate.sh (ready for review)` and mark the PR ready.
- [X] T795 Verify fresh GitHub Actions green on the final sentinel SHA, report
  `COMPLETE` with the PR URL to the epic owner, and do not merge.

## Dependencies and execution order

1. T771-T773 establish and publish the contract before implementation.
2. T774-T777 form Slice 1 RED and must be navigator-approved before T778.
3. T778-T780 complete and freeze the shared capability before host adapters.
4. Before Slice 2 dispatch, the orchestrator extends `gate.sh` with the Node
   API check; T781-T782 form RED before T783-T785 GREEN.
5. Slice 3 remains parked until #76 publishes a committed release point. T787
   resolves the exact integration/ownership contract before any browser RED.
6. Before Slice 3 dispatch, the orchestrator extends `gate.sh` with the exact
   inspector build/Playwright proof selected from #76's gate.
7. The ticket orchestrator checks each slice's tasks into that same reviewed
   behavior commit before push. Accepted pushed slices are frozen.
8. T794 requires all behavior tasks, local gates, exact-SHA implementation CI,
   and live-boundary evidence. T795 requires fresh CI again after the gate
   sentinel is dropped.
9. Driver and navigator panes are `/clear`ed together after every slice. The
   ticket orchestrator never merges the PR.
