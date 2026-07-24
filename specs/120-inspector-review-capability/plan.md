# Plan: Inspector-owned signer review capability

## Technical approach

Advance the pinned ledger-inspector WASM to the merged revision that implements
`tx.review`, allow that operation through the existing WASI dispatcher, and
expose it through the shared packaged Node API.

The common transaction wrapper remains responsible only for host orchestration:
decode the existing transaction input, resolve producer context when explicitly
selected, read ordered Turtle paths, invoke the authoritative engines, and
return typed failures. The canonical inspector envelope remains untouched.
When books are supplied, the RDF resolver first obtains the identifier term set
from the transaction-only `tx.rdf` graph, then joins books through the pinned
RDF engine and retains only transaction-matched resolutions. Imported books are
not returned from the review capability.

The current CLI adapter then delegates to the new public capability. Its
existing `--book` list passes through as `userBooks` paths instead of being
read into the old composite path. The old renderer is reduced to a
deterministic raw dump of the canonical structure; issue #121 later replaces
that placeholder with the final human decision view and new CLI flags.

## Data flow

```text
transaction input + optional provider/network
  -> shared transaction input/context orchestration
  -> pinned ledger inspector tx.review
  -> exact result.review envelope

protocolBooks paths + userBooks paths
  -> fail-closed ordered Turtle reads/import
  -> transaction-only tx.rdf term inventory
  -> pinned RDF-engine label join
  -> transaction-matched resolutions only
  -> additive top-level resolutions (no books)
```

## Slice 1 — Canonical Node review capability

One RED→GREEN commit:

- advances `flake.lock` to inspector revision `b99028a`;
- admits `tx.review` through `node/src/transaction-engine.js`;
- extends the shared RDF resolver with transaction-scoped filtering while
  preserving existing resolver behavior for all other operations;
- adds provider-aware `reviewTransaction` with ordered path inputs, exact
  envelope pass-through, typed book errors, no book dump, and public
  TypeScript declarations;
- adds packaged Node proof for export, envelope/category/evidence/status
  preservation, offline parity, provider credential redaction, ordered book
  paths, and the off-transaction sentinel.

Owned implementation/test files:

- `flake.lock`
- `lib/src/Cardano/Transaction/Rdf.js`
- `node/src/index.js`
- `node/src/index.d.ts`
- `node/src/rdf-engine.js`
- `node/src/transaction-engine.js`
- `node/test/transaction-api.test.mjs`
- `node/test/transaction-books.test.mjs`
- `node/test/transaction-provider.test.mjs`

The ticket owner alone stamps
`specs/120-inspector-review-capability/tasks.md`; the slice workers must not
edit specs or `gate.sh`.

Focused RED/GREEN and slice gate:

```sh
nix run .#ci-node-api
./gate.sh
```

Commit:

```text
feat(node): expose canonical transaction review

Tasks: T001, T002, T003, T004, T005, T006, T007, T008
```

## Slice 2 — Replace the legacy review consumer

One RED→GREEN commit:

- replaces `commands/tx.js`'s four-operation composition with delegation to
  `reviewTransaction`;
- passes the existing CLI `--book` paths through as `userBooks` only for
  review while preserving existing in-memory book behavior for other commands;
- replaces the legacy-shape renderer with the authorized deterministic raw
  canonical dump;
- updates the focused CLI proof and golden without adding #121's flags,
  structured-output contract, or final human rendering.

Owned implementation/test files:

- `cli/csk.mjs`
- `cli/tx-review.mjs`
- `node/src/commands/tx.js`
- `node/test/cli.test.mjs`
- `node/test/fixtures/tx-review-amaru.golden.txt`

The ticket owner alone stamps
`specs/120-inspector-review-capability/tasks.md`; the slice workers must not
edit specs or `gate.sh`.

Focused RED/GREEN and slice gate:

```sh
nix run .#ci-node-api
./gate.sh
```

Commit:

```text
refactor(cli): consume canonical transaction review

Tasks: T009, T010, T011, T012, T013, T014
```

## Orchestrator-owned acceptance

After each navigator-approved commit, the ticket owner independently reviews
the full owned-file diff, verifies the matching RED/GREEN handoffs and commit
trailers, runs `./gate.sh`, stamps that slice's tasks into the same commit, and
pushes. After both slices, the owner refreshes the draft PR body, verifies
remote CI, runs the finalization audit, drops `gate.sh`, and marks the PR ready.
The ticket owner never merges.

## Risks and controls

- **Host semantics could reappear.** Tests assert there is one `tx.review`
  dispatch and no legacy operation composition; RDF membership is queried from
  the transaction graph rather than inferred from review fields.
- **Book contents could leak.** The review output contract omits `books` and a
  sentinel label proves the result is not a full dump.
- **The engine pin could drift beyond the reviewed upstream delivery.** The
  lock revision is asserted in review and the complete gate rebuilds the
  packaged WASM consumer.
- **Provider secrets could leak through generic option spreading.** Book path
  controls are stripped before engine dispatch and provider credentials remain
  in the existing provider boundary; tests search serialized results.
- **The temporary CLI dump could grow into #121.** Slice 2 forbids new flags,
  JSON-output behavior, category/readiness presentation, and WebUI changes.
- **The Qwen driver can loop or overclaim.** Briefs use exact owned files and
  stop conditions; the ticket owner independently checks every status claim,
  diff, approval line, and gate result.
