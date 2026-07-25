# Implementation plan — structured signer-review decision view

## Tech stack and boundaries

Plain ES modules, Node 22, no new dependencies. All work lands in the CLI host layer.

- `cli/tx-review.mjs` — the renderer. Pure: canonical review result in, string out. No
  I/O, no engine access, no provider access, no clock, no randomness.
- `cli/csk.mjs` — argument surface only: the new book flags, `--output json`
  acceptance, usage text.
- `node/test/` — proofs and fixtures.
- `nix/checks/node-api.nix` — one added copy line so the sandboxed check can reach
  `cli/` for the renderer unit proof, plus the new test file in the `node --test` list.

Explicitly untouched: `node/src/index.js`, `node/src/commands/tx.js`,
`lib/src/Cardano/**`, `docs/inspector/**`. The CLI already calls the exported
`reviewTransaction` capability through `node/src/commands/tx.js`; #121 needs no new
capability.

### Architecture-boundary constraint (mechanically enforced)

`scripts/check-architecture-boundary.sh` greps `cli/` and `node/src/` for tokens
including `plutus`, `blake2b`, `ed25519`, `cbor-x`, `cborg`, `n3`, `sparqljs`,
`Authorization`, `project_id`. Any file under `cli/` containing those substrings —
**including inside a comment or a string literal** — fails the gate. Section headings
and prose in the renderer must avoid them. Test fixtures under `node/test/` are not
scanned.

## Render contract

One deterministic plain-text document. Two-space indentation per level. Sections appear
in this fixed order and are always present, even when empty. Booleans print as `yes` /
`no`. A null or absent scalar prints as `(not reported)`. An empty list prints `(none)`
on its own indented line. Counts in section headers come from the array length. Arrays
render in envelope order; object fields render in the fixed order named below — never
in JSON key order, never sorted.

Numeric values are copied as the exact decimal strings the inspector emitted. The render
path performs no arithmetic: no rounding, no thousands separators, no ADA conversion, no
`Number()` on a lovelace value.

### Section order and rationale

1. **Header** — what is being signed.
2. **What is not proven** — input completeness, net signer value provability, warnings.
   Placed second, before the value detail, so a signer cannot miss it (FR-005: "plainly,
   not buried").
3. **Output control groups** — where the value goes and who controls it.
4. **High-value movements**.
5. **Sources**.
6. **Collateral**.
7. **Claims** — self-declared intent, clearly marked as such.
8. **Book resolutions** — caller-order label decoration.
9. **Additional inspector fields** — verbatim passthrough of anything unrecognised
   (FR-010).

### Worked example

Rendering the canonical envelope currently frozen in
`node/test/fixtures/tx-review-amaru.golden.txt` must produce exactly:

```
csk tx review — cardano-tx-review/v1

Transaction
  tx id      a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1
  body hash  a213c84030a6ae1c05c9443b07d1b853b48637d769eec188af9ff3258b0713b1
  fee        1527153 lovelace

What is not proven
  input context status        incomplete
  regular inputs              11
  resolved regular inputs     0
  missing regular inputs      11
  net signer value provable   no
  net signer value lovelace   (not reported)
  net signer value note       missing input context, net signer gain/loss unprovable

Warnings (2)
  Metadata describes intent but is self-declared; verify it against the destination addresses and contract policy.
  Declared required signer hashes are absent from the witness set.

Output control groups (2)
  group 1 of 2
    category                        script
    role                            script_lock
    role provenance                 ledger_proven
    evidence                        ledger_proven
    lovelace                        611069353175
    distinct non-ADA asset classes  1
    outputs                         1 (indices 0)
    addresses
      3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d
  group 2 of 2
    category                        signer_controlled
    role                            signer_change
    role provenance                 heuristic
    evidence                        ledger_proven, heuristic
    lovelace                        75884469
    distinct non-ADA asset classes  0
    outputs                         1 (indices 1)
    addresses
      018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c3

High-value movements (1)
  movement 1 of 1
    category                        script
    role                            script_lock
    role provenance                 ledger_proven
    evidence                        ledger_proven
    lovelace                        611069353175
    distinct non-ADA asset classes  1
    outputs                         1 (indices 0)
    addresses
      3132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d

Sources (4)
  regular_input    count 11  resolved 0  missing 11  resolved lovelace 0
  withdrawal       count 1  lovelace 0
  collateral       conditional yes  inputs 1  body total lovelace 2290730  return lovelace 75120892
  reference_input  count 4  read only yes

Collateral
  conditional               yes
  input count               1
  body total lovelace       2290730
  return lovelace           75120892

Claims (1)
  claim 1 of 1
    label          reorganize
    value          Treasury reorganize: merge UTxOs into one continuing output
    detail         Routine treasury maintenance / destination treasury / metadata label 1694 / self-declared
    self declared  yes

Book resolutions (2, in caller book order; duplicates preserved)
  resolution 1 of 2
    identifier  a64d1b9e1aeffe54056034d84977061b45a92691efc282fbee3fc094
    label       Amaru treasury script
    type        overlay:Identifier
  resolution 2 of 2
    identifier  8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1
    label       Amaru treasury signer
    type        overlay:Identifier
```

Notes the driver must respect:

- The `distinct non-ADA asset classes` wording is required by FR-004. It must not be
  labelled "assets", "asset amount", "value" or anything an operator could read as a
  quantity. See `rulings/A-001-asset-amounts.md`.
- Sources render one line per entry, keyed on `kind`, showing every field present on
  that entry in the schema's declared order for that source variant. An unrecognised
  source `kind` renders its fields verbatim in envelope key order rather than being
  dropped.
- `Book resolutions` is omitted entirely — heading included — only when the capability
  returned no `resolutions` key at all (the no-book case, which #120 proves must not
  synthesise the field). When the key is present but empty, the heading renders with
  `(none)`.
- `Additional inspector fields` renders only when the review object carries a top-level
  key outside the twelve the schema requires; its body is `JSON.stringify(value, null, 2)`
  indented two spaces under `key:`.

## `--output json`

`--output json` prints the standard CSK envelope with the structured result as `value`:

```json
{"version":1,"ok":true,"value":{"ledger_functional_layer":"…","op":"tx.review","result":{"review":{…}},"resolutions":[…]}}
```

That is exactly what `render(result, true)` already produces for every other `tx`
command; the only change is that `review` stops being excluded and stops being converted
to a string first. Human mode keeps calling the renderer. Typed failures under
`--output json` continue to emit the existing JSON error envelope.

## Book flags

`values` collects three ordered lists during argument parsing:

- `protocolBook[]` — every `--protocol-book PATH`, in command-line order.
- `userBook[]` — every `--user-book PATH` **and** every `--book PATH`, interleaved in
  command-line order.

The call becomes
`tx.review(input, { protocolBooks: values.protocolBook, userBooks: values.userBook })`.
`--book` keeps its current meaning (a user book), so existing invocations are unchanged;
the usage text marks it as a retained compatibility alias for `--user-book`.

`--protocol-book` and `--user-book` are **review-only**: supplying either to any other
transaction command is a usage error, exit 2. `--book` is **not** restricted that way — it
keeps both of its existing roles unchanged. Under `review` it is the compatibility alias
above; under every other transaction command it remains the legacy `books` source, as at
baseline (`cli/csk.mjs:170` consumes `values.book` under exactly `command !== "review"`,
and `node/test/cli.test.mjs:178-179` drives `inspect`/`browse`/`identify`/`intent` with
repeated `--book` and asserts the imported books).

Ruling A-002 settled this. An earlier draft of this section and of the Slice 1 brief said
"all three flags stay rejected for non-`review` commands", which is irreconcilable with the
unchanged-`--book` requirement and would have broken shipped, passing tests. The navigator
refused to approve GREEN against the contradiction and escalated; the ruling is recorded in
`rulings/A-002-book-non-review-contract.md`.

## Slices

Each slice is one bisect-safe commit: builds at HEAD, gate green, no placeholder state.

### Slice 1 — `book-flags`

Ordered `--protocol-book` / `--user-book` with the `--book` compatibility alias, wired
through to the capability. Human output stays the raw dump; `--output json` stays
rejected. Touches `cli/csk.mjs` (parser + usage) and `node/test/cli.test.mjs`.

RED: a CLI test asserting protocol books precede user books, that `--book` and
`--user-book` interleave in command-line order, and that duplicate identifiers with
conflicting labels produce two resolution rows in caller order.

### Slice 2 — `json-output`

`--output json` accepted for `review`, emitting the structured result in the standard
envelope. Human output still the raw dump. Touches `cli/csk.mjs` and
`node/test/cli.test.mjs`.

RED: a CLI test asserting the JSON envelope equals the capability result and that
`--output json` failures still produce the typed JSON error envelope.

### Slice 3 — `decision-view`

The renderer itself. Replaces the raw dump with the deterministic document above; adds
the renderer unit proof over canonical review results covering all five control
categories, the three-category regression case (FR-002/SC-002), conflicting duplicate
resolutions (SC-003), the unrecognised-field passthrough (SC-006), and empty-section
shapes. Rewrites the end-to-end Amaru golden to the decision view (SC-005). Touches
`cli/tx-review.mjs`, `node/test/cli.test.mjs`, a new
`node/test/tx-review-render.test.mjs` plus its fixtures, `nix/checks/node-api.nix`, and
the `csk tx review` section of `docs/user/usage.md`.

Determinism proof: render twice, assert byte equality, and assert the output contains no
digit grouping and no `NaN`/`Infinity`/`e+` artefact.

### Slice 4 — `upstream-asset-amounts` (BLOCKED on `cardano-ledger-inspector#168`)

Reserved. When `tx.review` publishes per-asset policy id, asset name and quantity, this
slice renders them exactly and upgrades the regression proof to assert exact asset
amounts, satisfying #121's literal acceptance bullet. Per ruling A-001 (corrected), #121
cannot be marked ready-for-review, merged, or reported complete before this lands, unless
the operator amends the acceptance criterion. Slices 1–3 must not anticipate the shape of
#168's output, and must not weaken any assertion to make the current incomplete result
pass.

## Gate

`./gate.sh` at the repo root, inherited from #120's final gate — including
`just release-gates` and `just release-docs`, kept deliberately because that lane proved
two release-pin drift classes escape gates that assume a change is "CLI-only". It also
runs a branch-wide Conventional Commit + `Tasks:` trailer check.

Per-slice focused proof: `nix run .#ci-node-api` (hermetic; it packs the tarball the CLI
tests need). A bare `node --test node/test/cli.test.mjs` in the worktree fails for
environment reasons — it needs `CSK_PACKAGE_TARBALL` and a built `node/dist` — so the
focused command is the nix app, not the raw test runner.

Baseline verified before any slice: `nix run .#ci-node-api` exits 0 at branch HEAD.
