# Implementation Plan: Provider and validation truth

**Branch**: `fix/43-provider-validation-truth` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

## Root cause

`docs/inspector/src/Provider.purs` explicitly routes validation-context fetches
from selected Blockfrost to Koios whenever the Blockfrost key is empty. This is
the source of the live `/tip` and `/cli_protocol_params` CORS failures.

`docs/inspector/src/Provider.js` already captures validation-context exceptions
inside resolution metadata, but it has no explicit missing-credential outcome
and the UI does not promote that cause into a clear Validation-tab notice.

`normalizeValidation` currently converts ledger status, completeness, and
context validity into display metrics only. `Main.purs` then treats the
normalizer's `valid` parse flag plus SHACL conformance as the verdict, so a
well-formed but incomplete ledger response becomes `Validation passed`.

## Owned implementation files

```text
docs/inspector/src/Provider.purs
docs/inspector/src/Provider.js
docs/inspector/src/FFI/Json.js
docs/inspector/src/FFI/Json.purs
docs/inspector/src/Main.purs
docs/inspector/tests/tx-identify.spec.mjs
```

The driver does not edit specs, `gate.sh`, manifests, locks, generated assets,
styles, PR metadata, or any engine repository/file.

## Slice 1 — intake and acceptance gate (orchestrator-owned, complete)

1. Refresh main, read #43, #30, and parent #45, and establish a clean full-gate
   baseline in the issue worktree.
2. Confirm both local root causes and extend `gate.sh` with the permanent
   provider/validation truth journey anchors.
3. Open draft PR #51 with the bug label, `paolino` assignee, and closing
   references for #43 and #30.

## Slice 2 — selected-provider and ledger-verdict truth

One driver+navigator RED/GREEN commit owns the regression and minimal fix
because request selection, context availability, and the rendered verdict are
one observable decode contract.

1. Add Playwright RED coverage on the existing no-credentials Conway fixture:
   count every Koios route, assert zero requests, assert the visible Blockfrost
   missing-credential cause, and assert an incomplete warning banner with no
   pass wording. Add selected-provider network-failure coverage and a positive
   complete-valid banner assertion.
2. Remove the cross-provider fallback. When selected Blockfrost lacks
   credentials, skip provider I/O and record an explicit validation-context
   credential error in the existing resolution metadata.
3. Preserve structured ledger status/completeness/context-validity plus provider
   resolution errors in the typed browser normalization.
4. Render provider context errors as a prominent Validation-tab notice and
   derive the banner exclusively from the structured ledger contract, with
   incomplete mapped to warning tone.
5. Prove GREEN with `nix run .#ci-inspector-playwright`, obtain navigator
   approval, run `./gate.sh`, and create one bisect-safe commit.

Commit subject: `fix: render provider and validation truthfully`

## Live-boundary proof

The provider boundary cannot be proven by pure normalization tests. The
Playwright journey intercepts the actual browser network routes, counts Koios
requests under selected Blockfrost, and forces a selected-provider fetch
failure. This hermetic route-level smoke lives in the existing Nix Playwright
gate and fails loudly if dispatch crosses provider boundaries again.

## Finalization

The ticket orchestrator independently reviews the full diff and commit, stamps
Slice 2 task accounting into that same commit, reruns the full extended gate at
final HEAD, pushes, and updates draft PR #51. The PR remains draft and is never
marked ready or merged.

## Risks and controls

- **Test-suite fallback dependency**: generic fixture helpers currently rely on
  the faulty fallback. Make their intended provider explicit without weakening
  the new zero-request assertion.
- **String-derived verdict regression**: carry typed structured fields through
  the FFI record; do not inspect metric labels or values to decide pass/fail.
- **SHACL false green**: ledger completeness gates green before SHACL evidence
  is considered.
- **CORS ambiguity**: browser CORS and network failures both surface as the
  captured fetch error; the UI must display that cause without inventing a
  ledger invalid result.
- **Test invocation drift**: use the Nix app as-is because its csk#22 wrapper
  does not forward focused Playwright arguments.
