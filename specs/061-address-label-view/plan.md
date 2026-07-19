# Implementation Plan: Address-first decoded-tree labeling

**Branch**: `fix/61-address-label-view` | **Date**: 2026-07-19 | **Spec**:
`specs/061-address-label-view/spec.md`

## Summary

Use the reusable address value already present on decoded-tree Address rows as
the primary operator-facing identity. Keep the current raw/credential-oriented
value visible as secondary evidence, expose the address target in the inline
label editor, and extend the existing browser journey to prove save, immediate
resolution, export, and reload by address.

## Technical Context

**Language/Version**: PureScript 0.15.16 and JavaScript on Node 22
**Primary Dependencies**: Halogen 7, existing RDF-shapes browser bridge
**Storage**: Existing browser local-book store; no schema change
**Testing**: Existing inspector Playwright suite
**Target Platform**: Static browser WebUI
**Project Type**: PureScript web application
**Performance Goals**: No additional network or engine calls during rendering
**Constraints**: Consume already-projected address data; remain offline-capable;
do not implement #63, #62, or #10
**Scale/Scope**: One decoded-tree rendering/state module and one existing
browser regression file

## Constitution Check

- **One operation model, multiple hosts**: Pass. This is presentation of data
  already projected by the authoritative engine; it adds no new operation or
  host-specific semantic contract.
- **Browser-first, CLI-parity-conscious**: Pass. The browser view consumes the
  existing reusable address identity and does not move address logic into the
  host.
- **Authoritative Cardano engines**: Pass. No address parsing, derivation, or
  ledger behavior is added to PureScript or JavaScript.
- **Local-first secret handling**: Pass. No secret material is involved.
- **Honest capability boundaries**: Pass. The UI remains an annotation view and
  does not imply signing, validation, or submission behavior.
- **Nix/browser quality gate**: Pass by plan. RED/GREEN browser proof and the
  repository `./gate.sh` are mandatory in the implementation slice.

No constitution violation or design unknown requires research, a new data
model, or an external interface contract.

## Existing Data and UI Contract

The decoded-tree row already provides:

- `annotationValue`: the reusable Bech32 address for Address rows;
- `annotationPredicate`: `cardano:bech32` for those rows;
- `raw`/`value`: the existing raw or credential-oriented identity;
- `resolvedLabel`: the selected-book label when one matches.

`Main.purs` currently renders the raw/value identity in the primary line while
using the address only behind the save action. The implementation will make
the address visible at the display/edit boundary without altering the row type,
RDF queries, book serializer, or engine.

## Project Structure

```text
docs/inspector/src/Main.purs
docs/inspector/tests/tx-identify.spec.mjs
specs/061-address-label-view/
├── spec.md
├── plan.md
└── tasks.md
```

**Structure Decision**: Keep the behavior in the existing decoded-tree
renderer/state and extend the existing end-to-end annotation journey. No new
module, fixture, stylesheet, or dependency is needed.

## Slice 1 — Address display/edit path and browser proof

1. Add RED assertions to the existing known-address annotation journey. The
   assertions must prove the Bech32 address is the primary visible/copy target,
   the inline editor names that address target, and the prior raw/credential
   identity remains available.
2. In `Main.purs`, select the address annotation value as the primary identity
   only for address rows with a real `cardano:bech32` target. Preserve fallback
   behavior for rows without one and preserve non-address rendering unchanged.
3. Keep secondary identity evidence visible both before and after a label
   resolves, so a resolved name never hides which address matched.
4. Reuse the existing save path; its generated Turtle must continue to bind the
   label through `cardano:bech32`. Prove immediate resolution, export, and
   clean-context reload in the browser journey.
5. Run the full inspector browser suite through
   `nix run .#ci-inspector-playwright`, then run `./gate.sh`.

This is one vertical, bisect-safe slice because display, edit context,
persistence proof, and regression coverage describe one inseparable
operator-facing correction.

## Owned Files

- `docs/inspector/src/Main.purs`
- `docs/inspector/tests/tx-identify.spec.mjs`

## Forbidden Scope

- `docs/inspector/src/FFI/RdfShapes.*` and all engine/provider behavior: the
  required address data already exists.
- Book serialization/deduplication: #62.
- Bookable-identifier predicates/button restriction: #63.
- Shared provider/capability extraction: #10.
- Stylesheets, fixtures, dependencies, vaults, transaction stores, witness,
  submission, CLI/Node, and release packaging.

## Commit Shape

One implementation commit:

```text
fix(inspector): show address identity when labeling

Tasks: T611, T612, T613, T614
```

The ticket-orchestrator checks the matching tasks in the same amended commit
after driver and navigator verification.
