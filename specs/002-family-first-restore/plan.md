# Implementation Plan: Family-First Restore and Build Flow

**Branch**: `[002-family-first-restore]` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/002-family-first-restore/spec.md`

## Summary

Rework the current mnemonic and legacy address surfaces into a single family-first restore/build flow where the user chooses `Shelley`, `Icarus`, or `Byron` before entering recovery material. The implementation should keep mnemonic input as the primary path, derive each family with upstream-compatible semantics, and defer manual key-material entry into explicit advanced follow-up work.

## Technical Context

**Language/Version**: PureScript 0.15.x, JavaScript FFI, Haskell vector generator  
**Primary Dependencies**: Halogen 7, Spago workspace, `cardano-crypto.js`, existing browser crypto FFI, `cardano-addresses` from Hackage for vectors  
**Storage**: N/A  
**Testing**: `purs-tidy`, `spago test`, Haskell vector generation/checks, Playwright, GitHub Actions on `nixos` runner  
**Target Platform**: Browser SPA running fully client-side  
**Project Type**: Web application plus reusable PureScript library  
**Performance Goals**: Reactive family switching and mnemonic derivation without blocking the UI noticeably for normal single-user interaction  
**Constraints**: Offline-capable after initial load, browser-native only, Haskell vectors remain the source of truth  
**Scale/Scope**: One new user-facing restore/build slice spanning `Shelley`, `Icarus`, and `Byron`

## Constitution Check

- **Browser-Native**: Pass. All derivation and address construction remain local in-browser.
- **Feature Parity with CLI**: Pass if family-specific mnemonic flows match upstream `cardano-addresses` semantics and vectors.
- **Pipeline UX**: Pass. This feature improves the user-facing pipeline by aligning it to wallet-family semantics.
- **PureScript + Halogen**: Pass. No deviation.
- **Correctness Over Features**: Pass only if new family flows are backed by Haskell vectors before merge.
- **Reference Semantics Over Implementation Loyalty**: Pass. Reuse JS dependencies only where they map cleanly to upstream family derivation semantics.

## Project Structure

### Documentation (this feature)

```text
specs/002-family-first-restore/
├── plan.md
└── spec.md
```

### Source Code (repository root)

```text
app/
└── src/
    └── App.purs

lib/
└── src/
    └── Cardano/
        └── Address/
            ├── Bootstrap.purs
            ├── Bootstrap.js
            ├── Derivation.purs
            └── Derivation.js

haskell/
├── app/
│   └── Main.hs
└── cardano-addresses-browser-vectors.cabal

test/
└── src/
    └── Test/
        ├── Main.purs
        ├── Vectors.purs
        └── Vectors.js

tests/
├── derivation.spec.ts
└── legacy-bootstrap.spec.ts
```

**Structure Decision**: Reuse the current app/library/vector split. The first implementation may remain in `App.purs`, but a follow-up modularization ticket already exists and should absorb any refactor once the family-first behavior is stable.

## Phases

### Phase 0 - Research and Semantic Alignment

1. Confirm upstream `cardano-addresses` mnemonic-to-root semantics for `Byron`, `Icarus`, and `Shelley`.
2. Decide which passphrase variants are in scope for the first family-first slice.
3. Document any families or advanced modes that remain explicitly deferred.

### Phase 1 - Vector Design

1. Extend the Haskell vector generator with mnemonic-first `Icarus` bootstrap vectors.
2. Extend the Haskell vector generator with mnemonic-first `Byron` bootstrap vectors.
3. If `Shelley` is being folded into the same screen immediately, add cross-family vectors that prove switching family changes semantics rather than just presentation.
4. Regenerate committed vectors and update PureScript fixtures.

### Phase 2 - Library Semantics

1. Add family-aware mnemonic derivation helpers in the library layer.
2. Reuse the existing bootstrap constructors for final address construction where appropriate.
3. Ensure family-specific validation and passphrase requirements return user-facing errors.

### Phase 3 - UI Integration

1. Replace the current `Legacy` mental model with a family-first restore/build flow.
2. Make family selection the first choice on the screen.
3. Reuse the existing mnemonic state and privacy controls.
4. Show only the controls and outputs relevant to the selected family.
5. Keep manual xpub/root-xpub entry out of the default path; if present at all, gate it behind an advanced affordance.

### Phase 4 - Verification

1. Add PureScript golden tests for mnemonic-first `Icarus` and `Byron` flows.
2. Add Playwright coverage for:
   - selecting `Icarus` and deriving a bootstrap address from mnemonic
   - selecting `Byron` and deriving a bootstrap address from mnemonic
   - switching family with the same mnemonic and seeing the result update
   - privacy mode masking behavior across families
3. Run the standard CI gate and merge only after vectors, tests, and browser checks are green.

## Deferred Follow-Ups

- Advanced manual key-material entry (`addr_xvk`, `root_xvk`, private keys) as a separate expert path
- Any `Shared`-specific restore/build work not completed in this slice
- `App.purs` modularization under the existing refactor ticket

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Existing monolithic `App.purs` remains for initial implementation | Behavior change is higher priority than UI module refactor | Splitting files first would slow the user-facing correction without changing semantics |
