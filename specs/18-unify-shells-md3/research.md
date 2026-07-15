# Research — Issue 18 unified MD3 shell

## Decision 1: Keep the transplanted MD3 application as the sole shell source

**Decision**: Extend `docs/inspector` into the unified product app. Keep its existing Halogen root, theme, route-base handling, transaction workbench, RDF editor, and provider boundary. Port legacy surfaces into that state machine. Do not grow the legacy `app/src/App.purs` shell.

**Rationale**: The issue explicitly selects the MD3 base, the inspector suite already proves 55 workflows and responsive behavior there, and parity-before-deletion requires the old shell to remain untouched until final cutover.

**Alternatives considered**: Restyle the legacy shell as MD3 (rejects the issue's chosen base); introduce a third shell and migrate both into it (adds an unrequested surface and a third parity boundary).

## Decision 2: Reuse the local address library as a package, not copied code

**Decision**: Add the repository's `lib` package as a path dependency of the MD3 workspace and include its existing npm/WASM runtime requirements in the unified derivation. Do not copy address, mnemonic, derivation, signing, or script semantics into `docs/inspector`.

**Rationale**: The constitution requires authoritative Cardano engines and shared operations. The existing library is already tested and is the implementation used by the legacy shell.

**Alternatives considered**: Copy PureScript modules into the inspector tree (creates divergent implementations); reproduce operations in browser JavaScript (constitution violation).

## Decision 3: Resolve the address WASM asset from the shipped bundle

**Decision**: Have the unified bootstrap publish a base-path-safe address WASM URL, analogous to the inspector and RDF-shapes asset URLs, and let existing address FFI modules consume it with their current Node fallback intact.

**Rationale**: The current address FFI fetches `wasm/cardano-addresses.wasm` relative to the document URL, which breaks direct deep routes and deployed subpaths. Bundle-derived URLs remain correct for `/`, root route suffixes, and `/inspector/` compatibility routes.

**Alternatives considered**: Copy a `wasm/` directory into every route (duplicated artifact); hard-code an absolute host path (breaks Pages/preview subpaths).

## Decision 4: Preserve one parent state machine during migration

**Decision**: Keep `docs/inspector/src/Main.purs` as the cross-workflow state owner while extracting only cohesive effect boundaries such as vault encryption and transaction signing. Port render/action blocks incrementally rather than redesigning the component graph.

**Rationale**: Restore → vault → Workbench signing is intentionally cross-surface state. A component architecture rewrite would add risk and scope without improving ticket acceptance.

**Alternatives considered**: Independent routed components with message passing and shared store (larger architectural rewrite); merge both monoliths mechanically (unreviewable and difficult to test incrementally).

## Decision 5: Keep non-secret local storage; remove secret persistence

**Decision**: Continue persisting theme, library books, provider choice, and network. Remove credential get/set and persistence-toggle behavior, scrub the three legacy credential keys during initialization, and make the existing encrypted file vault the only persistent secret store.

**Rationale**: The issue constrains secrets, not all browser persistence. Automatic import of legacy cleartext credentials is impossible before a vault is unlocked and would prolong cleartext handling; scrubbing prevents reuse and makes migration explicit.

**Alternatives considered**: Ban all local storage (unnecessary regression); auto-create/encrypt a vault without a user passphrase (changes vault crypto/consent); retain opt-in cleartext provider persistence (direct acceptance failure).

## Decision 6: Publish one artifact at root and compatibility subpaths

**Decision**: Build one unified MD3 artifact, publish it canonically at the site root, and serve that same artifact at existing `/inspector/` compatibility entry points. Preserve direct route entry files.

**Rationale**: This provides one source shell while keeping transplanted tests, previews, and old links valid during the epic transition.

**Alternatives considered**: Redirect every `/inspector/` path immediately (would weaken local/static parity and current suite coverage); keep the legacy root artifact (fails single-shell acceptance).

## Decision 7: Six vertical commits with deletion last

**Decision**: Land foundation, Addresses+Scripts, Keys, vault security, signing loop, then final publication/test cutover and legacy deletion. Every commit builds and passes the full gate; the legacy shell remains until slice 6.

**Rationale**: These are independently reviewable capability boundaries and preserve the epic's parity-before-deletion invariant.

**Alternatives considered**: One big-bang commit (not bisect-safe or reviewable); delete legacy code before rewiring tests (explicitly forbidden).

## Baseline evidence

- Branch base: current `origin/main` at `89259f0`; the brief's `394f9319` was the #17 feature commit, followed by its gate/site/evidence commits.
- Clean pre-ticket `./gate.sh`: exit 0.
- Browser baseline: 18 Cardano Swiss Knife cases plus 55 inspector cases.
- UX baseline: 9/9 captures.
- Combined site baseline: `/`, `/inspector/`, `/inspector/inspect`, `/inspector/settings`, and `/inspector/library` returned 200.
- Known issue #22: use only the Nix-materialized path.
