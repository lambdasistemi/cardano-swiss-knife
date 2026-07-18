# Plan — Versioned releases for the workbench SPA (#53)

## Tech notes

- **release-please node type** keyed off root `package.json`. The file has no
  `version` field today — slice A adds `"version": "0.0.0"` and a manifest
  `{".": "0.0.0"}` with `bootstrap-sha` pinned to the PR base commit
  (`13100d8`), so release-please only scans commits from this PR onward. The
  PR's own `feat:` commits then propose **0.1.0** as the first release.
- **App token**: org-level `vars.CI_APP_ID` + `secrets.CI_APP_PRIVATE_KEY`
  (visibility: all repositories) — same pattern as attx. Tags/releases
  created with the App token DO fire `push: tags` workflows (proven in attx).
- **Version injection**: `docs/inspector/src/version FFI` exports a
  `__CSK_VERSION__` placeholder string; `nix/wasm-ui.nix` seds the bundled
  `dist/index.js`, replacing the placeholder with
  `(builtins.fromJSON (builtins.readFile ../package.json)).version`.
  Dev builds render the placeholder-derived "dev" label.
- **Pages gating**: `pages.yml` trigger becomes
  `push: tags: ["v*"]` + `workflow_dispatch`. Checkout uses the triggering
  ref, so a tag event builds the tagged tree. Nothing else in the workflow
  changes.
- csk keeps a permanent `gate.sh` at the repo root — drivers run `./gate.sh`,
  no drop commit in this repo.

## Slices

### Slice A — release-please pipeline

`release-please-config.json` (node type, bump-minor-pre-major,
bump-patch-for-minor-pre-major, bootstrap-sha), `.release-please-manifest.json`
at `0.0.0`, `package.json` gains `"version": "0.0.0"`,
`.github/workflows/release.yml` running googleapis/release-please-action@v4
on `push: main` + `workflow_dispatch` with the App token. Pages behavior
unchanged in this slice — bisect-safe: releases become possible, deploys
still continuous.

### Slice B — release-gated Pages deploy + docs

Rewire `pages.yml` triggers (`v*` tags + `workflow_dispatch`, drop
`push: main`); add a "Releasing" docs page to the mkdocs tree describing the
flow and verification. Bisect-safe: with no tags yet, merging this only stops
continuous deploys; the manual dispatch fallback remains.

### Slice C — footer version + title rebrand + UX check

FFI version module + footer render in `Shell.purs`, placeholder substitution
in `nix/wasm-ui.nix`, `<title>` → "Cardano Swiss Knife" in
`docs/inspector/dist/index.html`, UX assertions (footer version matches
`package.json`, document.title) following the tx-identify.spec.mjs precedent.

## Post-merge operational step (part of ticket acceptance)

Merge the release PR release-please opens (proposing 0.1.0) → verify tag
v0.1.0 + GitHub release + Pages deploy from the tag → live footer reads
v0.1.0.
