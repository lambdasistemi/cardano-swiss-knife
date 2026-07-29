# Feature Specification — structured signer-review decision view

**Issue**: https://github.com/lambdasistemi/cardano-swiss-knife/issues/121
**Parent epic**: https://github.com/lambdasistemi/cardano-swiss-knife/issues/74
**Depends on**: #120 (merged, PR #124, `afeb71f4872d0389ada005ddff23eef6afa379cc`)
**Blocking upstream dependency**: `cardano-ledger-inspector#168` — see FR-009 and
"Blocked acceptance" below.

## P1 user story

As a treasury signer, I run `csk tx review --tx-file tx.json` and read a deterministic
human decision view derived entirely from the canonical structured review result, with
the exact same structure available through `--output json`.

## Context — the defect this replaces

`csk tx review` shipped in #99 with a renderer that composed several inspector
operations and *reconstructed* transaction meaning in JavaScript. Its worst symptom:
every output was sorted into "change" or "recipient", a two-way split the CLI invented.
The inspector distinguishes five control categories and separately records the strength
of evidence behind each classification; collapsing them destroyed exactly the
distinctions a signer needs, silently.

#120 removed the reconstruction by routing the CLI through the inspector-owned
`tx.review` operation, and deliberately left `csk tx review` printing the raw canonical
envelope as a short-lived placeholder (ruling A-004) rather than porting the guesswork
forward. This feature replaces that placeholder with the real decision view.

The governing constraint, carried from epic rulings A-004 and A-006: **render what the
inspector reported, in the inspector's own vocabulary; never synthesise a field it did
not provide.**

## User stories

- **US-1** — As a signer, I see every output control group with its inspector-native
  category (`signer_controlled`, `external_key`, `script`, `bootstrap`, `unknown`), its
  role, its exact lovelace, and the evidence behind the classification, so I can tell a
  proven fact from a heuristic guess.
- **US-2** — As a signer, I see whether the input context is complete and whether my net
  value change is provable, stated in the inspector's own terms, so I am never told a
  transaction is "ready" by a judgement the CLI made up.
- **US-3** — As a signer using operator books, I see label resolutions only for
  identifiers actually present in the transaction, in the order I supplied the books,
  including two rows for one identifier when my books disagree.
- **US-4** — As a tool author, I get the exact structured result from `--output json`, so
  the CLI, the Node API and the forthcoming WebUI agree on one contract.
- **US-5** — As an existing script author, my current `--book` invocations keep working
  after the ordered protocol/user book flags arrive.

## Functional requirements

- **FR-001** — `csk tx review` renders a deterministic plain-text decision view over the
  `tx.review` result returned by the Node capability `reviewTransaction`. Determinism:
  identical envelope in, byte-identical text out; arrays rendered in envelope order; no
  locale-dependent, time-dependent or hash-ordering-dependent formatting.
- **FR-002** — Output control groups render one row per group, carrying `category`
  verbatim from the inspector's five-value enumeration, plus `role`, `role_provenance`,
  the full `evidence` list, `output_indices`, `output_count`, exact `lovelace`, and
  `asset_class_count`. Categories are never merged, renamed, or reduced to a coarser
  split.
- **FR-003** — Lovelace renders as the exact decimal string the inspector emitted. No
  rounding, no thousands separators, no ADA conversion, no floating point anywhere in
  the render path.
- **FR-004** — `asset_class_count` renders explicitly as a **count of distinct non-ADA
  asset classes**, never as an amount or a value. (The inspector does not publish asset
  quantities — see FR-009.)
- **FR-005** — `context.input_status` and `net_signer_value` (`provable`, `lovelace`,
  `note`) render plainly and prominently, exactly as reported. Every entry in `warnings`
  renders verbatim. **No readiness enum is synthesised.** The issue body names states
  such as `ready_for_witnesses` / `fully_valid` / `blocked`; no such field exists in the
  inspector contract, and inventing one host-side is the precise defect this lane
  removes (epic rulings A-004, A-006).
- **FR-006** — `--output json` is accepted and emits the structured result unchanged
  inside CSK's standard `{ "version": 1, "ok": true, "value": … }` envelope, consistent
  with every other `csk tx` command. The current parser rejection of `--output` for
  `review` is removed.
- **FR-007** — `--protocol-book PATH` and `--user-book PATH` are accepted, each
  repeatable. Protocol books are passed to the capability before user books; within each
  class, paths keep the order they appeared on the command line.
- **FR-008** — `--book PATH` remains accepted as a documented compatibility alias for
  `--user-book`. `--book` and `--user-book` contribute to one user-book list ordered by
  command-line position, so mixing them is unambiguous. Existing `--book` invocations
  behave exactly as before.
- **FR-009** — Every book resolution row renders, in caller book order (protocol books
  then user books, each in supplied order), including several rows for one identifier
  when supplied books disagree about its label. No host-side deduplication, no
  host-picked winner, no full book dump (per A-006; #120 already restricts `resolutions`
  to identifiers present in the transaction).
- **FR-010** — Any top-level field of the review result not covered by a named section
  renders verbatim in a clearly marked trailing section, so a future inspector field is
  never silently dropped by this renderer.
- **FR-011** — Addresses render in full. No truncation or elision of any identifier a
  signer would use to verify a destination.
- **FR-012** — Failure behaviour is unchanged: typed exits for usage, domain, secret,
  provider, engine and book failures, and `--output json` failures still emit the typed
  JSON error envelope.

## Success criteria

- **SC-001** — `nix run .#ci-node-api` and the full `./gate.sh` exit 0 at final HEAD.
- **SC-002** — A regression proof over canonical review results shows
  `signer_controlled` change, `external_key` value and `script`-locked value as three
  distinct rows with their own categories, roles, provenances and exact lovelace, and
  demonstrates that no pair of them collapses into a shared bucket.
- **SC-003** — A proof shows two resolution rows for one identifier with conflicting
  labels, both rendered, in caller book order.
- **SC-004** — A proof shows `--output json` returning the structured result byte-equal
  to what the Node capability returned, wrapped in the standard envelope.
- **SC-005** — The existing end-to-end Amaru review test still passes against the real
  pinned engine, now asserting the decision view rather than the raw dump, and still
  makes no provider request when offline.
- **SC-006** — A proof shows an unrecognised top-level review field surviving into the
  rendered output (FR-010).

## Blocked acceptance — upstream `cardano-ledger-inspector#168`

Issue #121's final acceptance bullet requires the regression fixture to prove the three
categories "with exact lovelace/**asset amounts**". The merged inspector's `tx.review`
result publishes only `asset_class_count` — a cardinality, documented in
`Conway/Inspector/Review.hs` as "Number of distinct non-ADA asset classes" — and carries
no policy id, asset name or quantity anywhere. Exact per-asset amounts therefore cannot
be proven from the current contract, and manufacturing them host-side is the defect this
lane exists to delete.

Per ruling A-001 (corrected), recorded in `rulings/A-001-asset-amounts.md`:

- `cardano-ledger-inspector#168` **blocks final acceptance, ready-for-review, merge and
  completion of #121**, unless the operator amends #121's acceptance criterion.
- It does **not** block bisect-safe slice progress here.
- Interim work must never present `asset_class_count` as an amount (FR-004), and must
  not weaken any test so the incomplete upstream result passes.
- A final upstream-integration slice is reserved for when #168 lands (Slice 4).
- Implementing #168 is out of scope for this ticket and this control turn.

## Non-goals

WebUI rendering (#122). IPFS. Signing. Submission. New provider integrations. Secrets
handling changes. The `/code/tx2` operator acceptance smoke (#123). Any change to
#120-owned files beyond calling the already-exported `reviewTransaction` capability.
Implementing `cardano-ledger-inspector#168`.
