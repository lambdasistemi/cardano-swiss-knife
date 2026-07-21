# Tasks: IndexedDB Transaction Workbench

**Input**: [spec.md](spec.md), [plan.md](plan.md), issue #76, parent #66,
release epic #74, merged #75/#67, and concurrent #77

**Story**: A browser operator persistently manages several #75 entries,
switches the existing inspector among them, and safely produces or attaches
interoperable witnesses while seeing exact completeness.

## Slice 0 — Intake, specification, and plan (orchestrator-owned)

- [X] T761 Refresh canonical main, read #76/#75/#67/#77, inspect the merged
  entry domain, store port, witness codec, existing Halogen/vault/signing
  surfaces, and bind the ticket to the canonical tmux quadrant.
- [X] T762 Create the guarded issue worktree and draft PR #97, bootstrap #90's
  fresh artifacts, and prove the clean architecture/shared-test/Playwright
  baseline through the committed lifecycle gate.
- [X] T763 Author, validate, commit, and push the specification, implementation
  plan, exact slice ownership, live IndexedDB proof, and #77 coordination seam.

## Slice 1 — IndexedDB EntryStore contract (driver+navigator)

- [X] T764 [US1] Add RED contract tests for database/store upgrade creation,
  put, overwrite, lookup, missing lookup, deterministic list, and reopen.
- [X] T765 [US1] Add RED failure tests for request/transaction errors and
  malformed or unknown-status persisted records.
- [X] T766 [US1] Implement the versioned IndexedDB object store keyed by
  `entryId`, with explicit request and transaction completion/error handling.
- [X] T767 [US1] Implement explicit #75 `TxEntry` encode/decode and export a
  concrete `EntryStore Aff` without changing the domain or dependencies.
- [X] T768 Obtain navigator RED/GREEN approval, run the focused Node contract
  plus `./gate.sh`, and commit once with `Tasks: T764, T765, T766, T767, T768`.

**Owned files**:

- `docs/inspector/src/FFI/EntryStore.purs`
- `docs/inspector/src/FFI/EntryStore.js`
- `docs/inspector/test/entry-store.test.mjs`

**Commit contract**:

```text
feat(web): add IndexedDB transaction entry store

Implement the browser EntryStore port with explicit persisted codecs,
deterministic IndexedDB operations, and direct adapter contract proof.

Tasks: T764, T765, T766, T767, T768
```

## Slice 2 — Persistent entry list and inspector consumer (driver+navigator)

- [X] T769 [US2] Add RED Playwright coverage for adding two finite-TTL entries,
  rendering an entry list, switching selection, and surviving reload.
- [X] T770 [US2] Add RED proof that the selected entry drives the existing
  inspector and that missing engine id/signer/expiry data blocks persistence.
- [X] T771 [US2] Add a focused Halogen `Workbench` component that loads the
  injected store, owns entry collection/selection, and emits selected entries.
- [X] T772 [US2] Derive entry seeds only from typed engine results, persist
  before success, and wire `Main` so inspection consumes selected entry CBOR.
- [X] T773 [US2] Render accessible list/switcher, entry identity/status,
  #75-derived required/satisfied/missing signer groups, and minimal plain CSS.
- [X] T774 Obtain navigator RED/GREEN approval, run focused Playwright and
  `./gate.sh`, and commit once with
  `Tasks: T769, T770, T771, T772, T773, T774`.

**Owned files**:

- `docs/inspector/src/Workbench.purs`
- `docs/inspector/src/FFI/Json.purs`
- `docs/inspector/src/FFI/Json.js`
- `docs/inspector/src/Main.purs`
- `docs/inspector/dist/styles.css`
- `tests/transactions.spec.ts`

**Commit contract**:

```text
feat(web): manage persistent transaction workbench entries

Load and switch durable entries through a focused Halogen workbench while the
existing inspector consumes the selected entry's unsigned transaction.

Tasks: T769, T770, T771, T772, T773, T774
```

## Slice 3 — Witness production, attachment, and completeness (driver+navigator)

- [ ] T775 [US3] Add RED Playwright proof for producing a missing signer with
  an unlocked local vault key and exporting raw plus TextEnvelope witness data.
- [ ] T776 [US3] Add RED proof for equivalent raw/TextEnvelope pasted witness
  collection, engine-confirmed signer relevance, and explicit replacement.
- [ ] T777 [US3] Add RED rejection proof for malformed/wrong-envelope,
  unrelated signer, unauthorized duplicate, and persistence failures.
- [ ] T778 [US3] Implement vault-key witness production through existing WASM
  signing and collect it through #75 using the returned signer hash.
- [ ] T779 [US3] Implement pasted witness normalization via #67, ledger-engine
  relevance proof, and #75 collection without host-side CBOR/signature logic.
- [ ] T780 [US3] Persist accepted mutations, render raw/enveloped output and
  exact 0/N→N/N completeness, and preserve isolation across entries/reload.
- [ ] T781 Obtain navigator RED/GREEN approval, run focused Playwright and
  `./gate.sh`, and commit once with
  `Tasks: T775, T776, T777, T778, T779, T780, T781`.

**Owned files**:

- `docs/inspector/src/Workbench.purs`
- `docs/inspector/src/TxSigning.purs`
- `docs/inspector/src/TxSigning.js`
- `docs/inspector/src/Main.purs`
- `docs/inspector/dist/styles.css`
- `tests/transactions.spec.ts`

**Commit contract**:

```text
feat(web): collect workbench transaction witnesses

Produce vault-backed witnesses, validate raw or enveloped pasted witnesses,
persist domain collection, and render per-entry signer completeness.

Tasks: T775, T776, T777, T778, T779, T780, T781
```

## Orchestrator-owned finalization

- [ ] T782 Review and stamp every behavior slice, independently run
  `./gate.sh`, audit source boundaries and commit/task linkage, update PR #97,
  push accepted SHAs, and publish the frozen Workbench integration seam to #77.
- [ ] T783 Verify fresh GitHub Actions green on the final implementation SHA,
  then stamp T782-T783 while dropping `gate.sh` in
  `chore: drop gate.sh (ready for review)`, mark PR #97 ready, and push.
- [ ] T784 Verify fresh GitHub Actions green on the sentinel SHA, report
  `COMPLETE` with PR #97 to the epic owner, and do not merge.

## Dependencies and execution order

1. T761-T763 freeze the ticket contract before implementation dispatch.
2. T764-T768 provide persistence before any component depends on it.
3. T769-T774 establish the durable selected-entry component and inspector seam.
4. T775-T781 add witness mutation only after list/selection persistence works.
5. The orchestrator checks each behavior task set in the same accepted commit,
   pushes immediately, and clears both worker panes before the next brief.
6. T782 includes direct #77 coordination; only a genuine shared-file conflict
   or blocking dependency escalates to the epic owner via Q-file.
7. T783 requires remote CI on the implementation SHA; T784 requires remote CI
   again after the gate sentinel is dropped.
8. The ticket orchestrator never merges the PR.
