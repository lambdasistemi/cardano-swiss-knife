# Implementation Plan — Issue 18

**Branch**: `refactor/18-unify-shells-md3` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)

## Summary

Extend the transplanted MD3 workbench into the sole Cardano Swiss Knife shell, reuse the existing address library and encrypted vault, remove cleartext provider credential persistence, close the transaction signing loop in Workbench, then publish one artifact at root and `/inspector/` compatibility paths. Preserve the legacy shell until the final slice has every mapped surface live and browser-covered.

## Technical Context

**Language/Version**: PureScript 0.15.16 and JavaScript ES modules  
**Primary Dependencies**: Halogen 7, Material Web components, cardano-addresses library/WASM, inspector WASI WASM, rdf-shapes-wasm, purescript-rdf-editor  
**Storage**: AES-GCM encrypted vault file for secrets; local storage only for theme, books, provider choice, and network  
**Testing**: Playwright 1.54.1, Nix build/check apps, UX capture, static route/asset smoke  
**Target Platform**: Static browser app on GitHub Pages and PR preview hosting  
**Project Type**: Browser workbench with authoritative WASM engines  
**Performance Goals**: Preserve current decode/sign interaction behavior and responsive 1440/1024/390 layouts  
**Constraints**: Nix-only proof; one engine envelope; local-first secrets; no engine changes; legacy deletion last  
**Scale/Scope**: Seven top-level destinations, four Keys tabs, 73 pre-existing browser cases, 9 UX captures

## Constitution Check

- **One operation model, multiple hosts**: PASS — existing address operations and `cardano-ledger-functional/v1` transaction operations are reused unchanged.
- **Browser-first, CLI-parity-conscious**: PASS — browser-only routing/vault UI remains at the edge; operation semantics stay shared.
- **Authoritative Cardano engines**: PASS — no ledger or crypto semantics are reimplemented.
- **Local-first secret handling**: PASS — encrypted vault only; decrypted values stay in browser memory.
- **Honest capability boundaries**: PASS — UI distinguishes detached witness, attachment action, and patched CBOR; no submission/hardware claims.
- **Nix canonical build and browser verification**: PASS — every slice and final head run the inherited extended gate.

Post-design re-check: PASS. No constitution exception or complexity waiver is required.

## Project Structure

```text
lib/src/Cardano/                 # existing reusable address/mnemonic/signing/script operations
docs/inspector/                  # MD3 shell; becomes the sole product application
  src/Main.purs                 # parent Halogen state/action/render owner
  src/Vault.{purs,js}           # reused encrypted-vault effect boundary
  src/TxSigning.{purs,js}       # local sign + authoritative witness attach
  src/{Routing,Shell}.purs      # seven-route shell and base-path navigation
  tests/                        # transplanted plus unified capability tests
tests/                          # existing csk suites, rewired only at final cutover
nix/                            # unified artifact, browser apps, static route smoke
specs/18-unify-shells-md3/      # ticket contract and task accounting
```

**Structure Decision**: `docs/inspector` is the only application source after final integration. `lib` remains the shared operation package. The legacy `app` tree remains intact through slices 1–5 and is deleted in slice 6.

## Slice 1 — Unify the build and route foundation

Make the MD3 workspace consume the local address package, bundle the address WASM as a base-path-safe asset, and expand route parsing/direct-entry generation without exposing incomplete legacy surfaces in the primary nav. Add a failing-then-passing browser proof for address-WASM loading from a deep deployed subpath.

**Owned files**:

- `docs/inspector/spago.yaml`
- `docs/inspector/spago.lock`
- `docs/inspector/package.json`
- `docs/inspector/package-lock.json`
- `docs/inspector/src/bootstrap.js`
- `docs/inspector/src/Routing.purs`
- `docs/inspector/src/Routing.js`
- `docs/inspector/tests/tx-identify.spec.mjs`
- `lib/src/Cardano/Address/Bootstrap.js`
- `lib/src/Cardano/Address/Derivation.js`
- `lib/src/Cardano/Address/Inspect.js`
- `lib/src/Cardano/Address/Signing.js`
- `lib/src/Cardano/Address/Wasm.js`
- `flake.nix`
- `nix/wasm-ui.nix`

**Proof**: `nix build .#tx-inspector-ui --no-link`, `nix run .#ci-inspector-playwright`, then `./gate.sh`.

## Slice 2 — Migrate Addresses and Scripts

Port the complete legacy address-inspection and native-script author/analyze behavior into MD3 routes, using the shared library unchanged. Add MD3 styling and focused browser coverage while the old root shell remains published.

**Owned files**:

- `docs/inspector/src/Main.purs`
- `docs/inspector/src/Routing.purs`
- `docs/inspector/src/Routing.js`
- `docs/inspector/src/Shell.purs`
- `docs/inspector/dist/styles.css`
- `docs/inspector/tests/unified-address-scripts.spec.mjs`
- `docs/inspector/playwright.config.mjs`

**Proof**: focused new Playwright cases, `nix run .#ci-inspector-playwright`, then `./gate.sh`.

## Slice 3 — Migrate the Keys workflow

Port Mnemonic, Restore, Expert, and Sign & verify into one Keys route with in-page MD3 tabs. Preserve family-first restore, private-value visibility controls, network/path behavior, mnemonic handoff, and generic signing/verification. Vault actions remain on the legacy shell until slice 4.

**Owned files**:

- `docs/inspector/src/Main.purs`
- `docs/inspector/src/Routing.purs`
- `docs/inspector/src/Routing.js`
- `docs/inspector/src/Shell.purs`
- `docs/inspector/dist/styles.css`
- `docs/inspector/tests/unified-keys.spec.mjs`
- `docs/inspector/playwright.config.mjs`

**Proof**: focused new Playwright cases, `nix run .#ci-inspector-playwright`, then `./gate.sh`.

## Slice 4 — Make the vault the only secret store

Reuse the existing vault file format and crypto unchanged inside MD3. Add the Vault route and compatible shelves to Keys and Settings; remove the cleartext provider persistence toggle/get/set flow; scrub legacy credential keys at initialization; preserve only non-secret preferences and books in local storage. Cover vault round trips, compatibility, reload/storage audit, and legacy-key scrubbing.

**Owned files**:

- `docs/inspector/src/Main.purs`
- `docs/inspector/src/Vault.purs`
- `docs/inspector/src/Vault.js`
- `docs/inspector/src/FFI/Storage.purs`
- `docs/inspector/src/FFI/Storage.js`
- `docs/inspector/src/Routing.purs`
- `docs/inspector/src/Routing.js`
- `docs/inspector/src/Shell.purs`
- `docs/inspector/dist/styles.css`
- `docs/inspector/tests/unified-vault.spec.mjs`
- `docs/inspector/tests/tx-identify.spec.mjs`
- `docs/inspector/playwright.config.mjs`

**Proof**: focused vault/storage Playwright cases, source/browser storage audit, `nix run .#ci-inspector-playwright`, then `./gate.sh`.

## Slice 5 — Close the Workbench signing loop

Port the existing local transaction-signing boundary into MD3 Workbench. Connect witness-plan signer state to compatible derived/vault keys, sign the identified body hash locally, invoke `tx.witness.attach`, and render detached witness details, match status, attachment action, and patched CBOR. Add an end-to-end test that derives and vaults a key before signing.

**Owned files**:

- `docs/inspector/src/Main.purs`
- `docs/inspector/src/TxSigning.purs`
- `docs/inspector/src/TxSigning.js`
- `docs/inspector/dist/styles.css`
- `docs/inspector/tests/unified-signing-loop.spec.mjs`
- `docs/inspector/playwright.config.mjs`

**Proof**: signing-loop Playwright case proves one added vkey witness, `nix run .#ci-inspector-playwright`, then `./gate.sh`.

## Slice 6 — Cut over publication and delete the legacy shell

Only after slices 1–5 are live and covered, expose the exact seven-link primary nav, retarget all 18 legacy Playwright cases to their approved homes, publish the unified artifact at root and `/inspector/` compatibility paths, update UX/route smoke expectations, remove legacy build wiring and the `app/src/App.purs` shell (with now-duplicate app modules), and prove the complete combined matrix. This is the only slice authorized to delete legacy shell files.

**Owned files**:

- `docs/inspector/src/Main.purs`
- `docs/inspector/src/Shell.purs`
- `docs/inspector/src/Routing.purs`
- `docs/inspector/src/Routing.js`
- `docs/inspector/dist/index.html`
- `docs/inspector/dist/styles.css`
- `docs/inspector/tests/tx-identify.spec.mjs`
- `docs/inspector/playwright.config.mjs`
- `tests/inspect.spec.ts`
- `tests/mnemonic.spec.ts`
- `tests/derivation.spec.ts`
- `tests/legacy-bootstrap.spec.ts`
- `tests/signing.spec.ts`
- `tests/scripts.spec.ts`
- `tests/vault.spec.ts`
- `tests/transactions.spec.ts`
- `playwright.config.ts`
- `tools/ux-judge/capture.mjs`
- `flake.nix`
- `spago.lock`
- `package.json`
- `package-lock.json`
- `nix/purescript.nix`
- `nix/packages/default.nix`
- `nix/checks/playwright.nix`
- `nix/apps/default.nix`
- `nix/apps/inspector-playwright.nix`
- `nix/apps/ux-capture.nix`
- `nix/apps/combined-site-smoke.nix`
- `app/spago.yaml` (delete)
- `app/shims/fs.cjs` (delete)
- `app/shims/path.cjs` (delete)
- `app/src/App.purs` (delete)
- `app/src/App.js` (delete)
- `app/src/Main.purs` (delete)
- `app/src/App/Vault.purs` (delete)
- `app/src/App/Vault.js` (delete)
- `app/src/TxInspector/Blockfrost.purs` (delete)
- `app/src/TxInspector/Blockfrost.js` (delete)
- `app/src/TxInspector/Inspector.purs` (delete)
- `app/src/TxInspector/Inspector.js` (delete)
- `app/src/TxInspector/Json.purs` (delete)
- `app/src/TxInspector/Json.js` (delete)
- `app/src/TxInspector/Koios.purs` (delete)
- `app/src/TxInspector/Koios.js` (delete)
- `app/src/TxInspector/Provider.purs` (delete)
- `app/src/TxInspector/Signing.purs` (delete)
- `app/src/TxInspector/Signing.js` (delete)
- `dist/index.html` (delete)

**Proof**: `nix run .#ci-inspector-playwright`, `nix run .#ci-playwright`, `nix run .#ci-ux-capture`, `nix run .#ci-combined-site-smoke`, secret-storage grep/browser audit, then `./gate.sh`.

## Commit and review policy

- One driver+navigator pair per slice; RED before GREEN for each behavior change.
- One bisect-safe Conventional Commit per slice with `Tasks:` trailer.
- Driver never pushes; orchestrator reviews diff/gate, marks matching tasks complete in the same amended commit, then pushes.
- The old shell remains through slice 5; only slice 6 may delete it.
- All checks stay on the Nix path because of issue #22.
- The repository's inherited permanent `gate.sh` is extended and retained; unlike a temporary per-PR gate, it is not dropped at finalization.

## Final evidence

The living draft PR body must include the Q-001 route/surface parity table verbatim, signing-loop browser evidence, secret-storage source/browser audit, final `./gate.sh` result and head, all CI checks, and a live preview URL/browser smoke. The orchestrator does not mark ready or merge.
