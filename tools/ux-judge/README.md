# ux-judge

An automated UX/UI feedback loop for the Ledger Inspector SPA. It replaces "the operator
opens a preview and reacts" with a repeatable, scored punch-list a machine produces on
every run — so "usable" becomes a number that trends, not a vibe.

## What it does
1. **capture** (`capture.mjs`) — headless Playwright drives the SPA through fixed user
   journeys and screenshots each (`out/NN-*.png`). Robust nav for the 36MB wasm bundle.
2. **judge** (`judge.sh`) — a headless `claude -p` vision pass reads each screenshot +
   `rubric.md` and emits strict JSON: per-dimension scores + ranked, constraint-respecting
   gaps (`out/NN-*.judge.txt`).
3. **report** (`report.mjs`) — aggregates into `out/report.md` (overall score + scenario
   table + ranked P1/P2/P3 punch-list) and appends the score to `history.jsonl` (trend).

`rubric.md` is the crux: it defines "usable" against the CQuisitor reference bar **and
bakes in the settled constraints** (single-column layout, Material UI, WASM-Haskell,
open-books differentiator) so the judge never recommends a rejected direction.

## Run
```sh
nix develop -c bash tools/ux-judge/run.sh                 # judge Cardano Swiss Knife production at /inspector/
UX_BASE_URL=http://127.0.0.1:8000/inspector/ \
  nix develop -c bash tools/ux-judge/run.sh               # judge a local build or preview override
```
The default target is
`https://lambdasistemi.github.io/cardano-swiss-knife/inspector/`. Set
`UX_BASE_URL` to judge a locally served build or preview instead.

Output: `tools/ux-judge/out/report.md`. `out/` and `node_modules` are gitignored.

## Scenarios (extend in `capture.mjs`)
- `01-initial` — first impression / empty state
- `02-decoded-valid` — the decoded-structure tree (core CQuisitor-parity surface)
- `03-validation-broken` — the phase-1 validation view

## Wiring it unattended
Add a CI job that runs `run.sh` against each PR-preview URL and posts `report.md` +
the overall score as a PR comment, so every UX change is measured before merge.
