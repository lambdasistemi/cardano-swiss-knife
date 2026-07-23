# Plan: Human-readable transaction review

## Technical approach

Add one thin transaction-review composition in the existing Node command
adapter and one pure deterministic renderer in the CLI layer.

The command adapter first runs the existing inspection operation with the
original local input and optional provider selection. When provider context was
resolved, it reuses that returned context with the same original local bytes for
intent, witness-plan, and validation calls, avoiding a second provider client or
independent context policy. One operation carries all selected books through the
existing import/RDF resolver. The adapter returns either one typed failure or a
composite evidence object; it never manufactures partial success after a
sub-operation failure.

The CLI renderer consumes only fields already produced by inspection, intent,
witness-plan, validation, and RDF resolution. It formats fixed sections and raw
decimal strings without locale or terminal-width behavior. `tx review` is a
human-only command: unlike the existing JSON-oriented commands, it rejects
`--output json` and accepts exactly `--tx-file` plus the existing book and
provider/vault selection surface.

## Data flow

```text
--tx-file + optional provider/network + books
  -> existing local input/TextEnvelope parser
  -> existing provider context resolver (only when explicitly selected)
  -> existing inspect / intent / witness-plan / validate / RDF operations
  -> fail-closed composite evidence
  -> pure fixed-width-independent terminal renderer
```

## Slice 1 — Review composition, renderer, and integration proof

One bisect-safe RED→GREEN commit owns:

- `cli/csk.mjs`
- `cli/tx-review.mjs` (new)
- `node/src/commands/tx.js`
- `node/test/cli.test.mjs`
- `node/test/fixtures/tx-review-amaru-book.ttl` (new)
- `node/test/fixtures/tx-review-amaru.golden.txt` (new)
- `docs/user/usage.md`
- `specs/099-tx-review/tasks.md` only when the ticket orchestrator stamps the
  accepted tasks into the reviewed commit

RED first adds focused CLI/integration assertions and the complete Amaru golden.
The focused command is:

```sh
nix run .#ci-node-api
```

GREEN minimally adds the command adapter and renderer, reusing the current
provider/network parsing and operation wrappers. The commit subject is exactly:

```text
feat(cli): add human-readable transaction review
```

with `Tasks: T001, T002, T003, T004, T005, T006, T007, T008, T009`.

## Orchestrator-owned finalization

The ticket orchestrator independently reviews the diff and raw test evidence,
stamps Slice 1 tasks into that same commit, runs the full `./gate.sh`, audits
acceptance and commit messages, updates PR #112, and verifies fresh remote CI.
Only after all checks are green does it stamp finalization tasks while dropping
`gate.sh` in `chore: drop gate.sh (ready for review)` and mark the PR ready.

## Risks and controls

- Provider enrichment could accidentally repeat network requests. Reuse the
  context returned from the first existing operation; tests count requests.
- Rendering could reinterpret ledger facts. The renderer is limited to fields
  already named by authoritative operation results; no CBOR or ledger parsing
  enters the host.
- Book resolution could hide unresolved values. Raw identifiers remain primary
  and labels are additive.
- A malformed sub-result could produce a misleading partial summary. Composite
  review fails closed before rendering.
- Grok driver status and test claims are independently re-derived from raw
  logs, diffs, navigator STATUS, and ticket-owner reruns.
