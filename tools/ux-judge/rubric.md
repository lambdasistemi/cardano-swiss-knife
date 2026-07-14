# Ledger Inspector — UX Judge Rubric

Score the Ledger Inspector SPA toward the goal: a **usable, CQuisitor-class Cardano
transaction inspector built on an open RDF/SPARQL engine**. A vision model scores each
captured screen against these dimensions and emits concrete, ranked gaps.

## Reference bar
CQuisitor (https://cardananium.github.io/cquisitor/): a dense transaction workbench —
input + config, a **collapsible type-aware decoded-structure tree that dominates**,
click-a-node → highlight-the-CBOR-bytes, plus validation and Plutus-script views. It is
the familiar, comprehensible reference. Match its comprehensibility and drill-down;
**surpass** it via open books.

## Hard constraints — DO NOT recommend against these (settled decisions)
- **Single-column / vertical layout by design**: load form on top (collapsible once a tx
  is loaded), books its own section, decoded structure full-width below. **Do NOT
  recommend a two-pane / side-by-side layout** — the operator rejected it.
- **Material UI**: real `md-*` Material Web components, Material Symbols, Roboto.
  Recommendations must fit Material 3.
- **Brand is "Ledger Inspector"**, never "CQuisitor".
- **Decoding/crypto is WASM-Haskell**, never a JS reimplementation.

## Differentiator to reward
Open **books** (overlay / blueprint / SHACL / registry) that resolve opaque
script-hashes / datums / addresses / policies to familiar names and types — something
CQuisitor's closed resolution cannot do. Reward when resolution is visible and legible.

## Dimensions (score each 1–5; 5 = CQuisitor-class or better)
1. **first_impression** — within the first viewport, is it obvious what this does and how to start?
2. **hierarchy** — is the decoded output the star? Is secondary config (chain-data, books,
   provider) demoted until it is relevant?
3. **tree_readability** — progressive disclosure (collapsed by default, expand on demand),
   empty/NULL fields dimmed or grouped, type-aware rendering — not a flat wall.
4. **affordances** — obvious clickable nodes, copy controls, tabs, byte-highlighting, resolution cues.
5. **polish** — spacing, density, typographic rhythm, component consistency; workbench-dense, not form-sparse.
6. **first_run** — does a first action succeed with **zero setup** (no key, no CORS failure)?
   The Examples / CBOR-paste path must work immediately.
7. **resolution** — when a book is applied, does opaque data resolve to names clearly? (null if N/A on this screen.)

## Viewport / responsive
Screenshots are captured at multiple viewports (desktop 1440, laptop 1024, mobile 390) and
each is judged at its stated width. A narrow viewport must be **composed for its width** —
single-column, readable, every control reachable, **no horizontal scroll, no clipped or
overlapping elements** — not a squished desktop. Fold responsive fitness into hierarchy,
affordances, and polish for that screen.

## Output — STRICT JSON only, no prose, no markdown fences
{ "scenario": "<name>", "scores": { "first_impression": n, "hierarchy": n,
  "tree_readability": n, "affordances": n, "polish": n, "first_run": n, "resolution": n or null },
  "gaps": [ { "severity": "P1"|"P2"|"P3", "area": "<short>", "what": "<observed>",
  "why": "<impact on usable>", "fix": "<concrete, constraint-respecting>" } ],
  "overall": <integer 0-100> }

Severity: **P1** = blocks "usable" (a first-time user is lost, or an action fails).
**P2** = major friction. **P3** = polish.
