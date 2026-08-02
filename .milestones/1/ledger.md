# Milestone ledger — csk M1: mainnet-review UX & interop hardening

Home: https://github.com/lambdasistemi/cardano-swiss-knife/milestone/1
Owner desk: tmux session `csk`, window csk:1 `ms1-mainnet-review`, runtime `/tmp/ms-csk-1`
Repos: lambdasistemi/cardano-swiss-knife (home), lambdasistemi/cardano-ledger-inspector

## Outcome test (observable, audited before MILESTONE-COMPLETE)

A treasury signer runs ONE review flow over `/code/tx2` and can answer, without
reading CBOR or provider JSON: pays 437,500 ADA to CZ Venture (and from which
book that label resolves); which outputs are signer-controlled change vs
external vs script/collateral; exact fee/collateral; which 2 signatures are
required/present/missing; provider+preflight completeness; readiness state.
Semantics come from ONE inspector-owned structured review, identical across
inspector WASI/native/Extism and CSK Node/CLI/WebUI — no host re-derivation.
Plus epic #66's outcome (entry store, multi-signer witness collection, submit)
audited 7\/7 and closed 2026-07-29; enforcement gap tracked as csk#126.

## State (2026-07-29 sweep — operator delegated control to the desk)

| unit | where | state |
|---|---|---|
| epic #74 signer-review repair | csk:2 quadrant, owner %2716, /tmp/epic-74 | ACTIVE, chain authorized end-to-end |
| cli#31 / cli#165 / csk#120 | PRs #167/#166/#124 | MERGED 2026-07-24 |
| cli#168 per-asset amounts | inspector PR #169 | MERGED 2026-07-29 05:51Z (guard-merge, 007251e), #168 closed |
| csk#121 CLI renderer | csk PR #125 | MERGED 2026-07-29 07:44Z (4823f8d), issue closed |
| csk#122 WebUI renderer | epic lane csk:2 | INTAKE STARTED under standing authorization |
| csk#123 final acceptance | — | AUTHORIZED after 121+122; enforcing check for signer-review contract |
| epic #66 tx-management | audited 7/7 PASS, closed 2026-07-29 (D5) | CLOSED; enforcement gap tracked as csk#126 in M1 |
| llm-settings sweep-script ticket (D4) | paolino/llm-settings#58 | FILED + desk-verified 2026-07-29, lane closed |
| release (D3) | v0.1.2 tag PARTIAL (no assets\/npm\/pages, csk#129); fix lane t129 live | publish chain repair -> 0.1.3 is the release |

## Priority

1. e74 chain to completion: 121 -> 122 -> 123 (123 closes the contract gap).
2. inspector M1 (cli#170 review-envelope residual, cli#159 treasury datum
   schema, cli#138 provider-failure surfacing) — cross-repo support for the
   outcome; #170 should land before #123 parity acceptance (epic owner
   sequences).
3. #66 audit -> D5 closure decision; audit-gap ticket csk#126 (orphaned
   store suites into CI) added to M1.
4. Release 0.1.2 (D3) after #121.
5. csk M2 green-gates bugs (22,25,87,90) — dispatch when a lane frees.

Milestone map: csk M1..M4 + inspector M1..M3 cover every open issue in both
repos (see MAP 2026-07-29T07:20Z in STATUS.md for membership).
## Parked decisions

Operator delegated control 2026-07-29. D1 executed (merged), D2 lifted, D4 done (issue #58).
- D3: release 0.1.2 (PR #81) — desk authorizes after #121 unless operator objects.
- (D5 resolved: #66 closed after 7\/7 audit; gap -> #126.)

## Escalations in flight

None. Desk monitor b3akjiwah tails epic-74 + t66 + t-sweep STATUS files.
- D6 (queued): commission orphaned-check inventory (csk M2) — three
  never-executed-check findings in M1 (#126, #129, ci-vault-cli); file via the
  t129 lane at its wrap-up, dispatch when a lane frees.

## RESUMED 2026-08-02 post-reclaim — lanes woken at recorded resume points
All lanes parked with resume points in their STATUS files; see
/tmp/machine/pausa/csk.md. Resume: desk relays RELEASE to %2716, %4704, %5003.
t129 resume point: run gate+commit for approved Slice B in issue-138, then
rehearsal publish, then 0.1.5. wt-cleanup resume point: execute retirements
from its completed census. e74 resume point: csk-122 PR #127 Slice 4.
- 2026-07-29 GC census response: 30 csk worktrees retired (Codex lane under
  Claude hold), all 39 GC-root symlinks freed; 5 skips blocked only by live
  processes in old worktrees (65,71,72,77,92) — reap-then-retire candidates.
