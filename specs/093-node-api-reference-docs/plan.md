# Implementation Plan — Node API Reference Documentation

## Technical context

- Runtime: Node.js 22, ESM, bundled with esbuild.
- Package contract: checked-in `node/src/index.d.ts`, published as `node/dist/index.d.ts` and advertised through `package.json`.
- Contract tooling: TypeScript compiler API for declaration value-export discovery; ESLint plus `eslint-plugin-jsdoc`; TypeDoc 0.28 with `typedoc-plugin-markdown` 4.x.
- Reproducibility: root `package-lock.json` plus a Nix `importNpmLock` tooling closure that selects only documentation dependencies rather than installing the full PureScript toolchain from npm.
- Docs: generated `docs/api/` output, ignored by git, then consumed by the existing strict MkDocs Material build.

## Design

The checked-in facade is the editor and generated-reference signature authority. Runtime source retains JSDoc because maintainers encounter and extend exports there; CI enforces both surfaces and compares only value-bearing declarations to runtime keys so exported interfaces/types do not create false drift.

`node/dist/index.d.ts` is part of the built and packed artifact. The drift checker runs against that artifact rather than only source paths, proving publication wiring as well as name parity. Public result types use a shared discriminated union and a documented error-code union; operation-specific values are structured where stable and otherwise use JSON-safe `unknown` fields rather than `any`.

TypeDoc writes an `index.md` entry file beneath `docs/api/` using the Markdown plugin. Every local and hosted docs build runs generation first. The Node API Nix check independently generates into a disposable work directory, so malformed declarations or comments fail even without a site publish.

## Slices

### Slice 1 — Publish and enforce the typed facade

RED first: add packed-artifact assertions for the advertised declaration file and an export-set drift check that fails with no facade present.

GREEN: add the hand-written declaration facade, package metadata, build-copy wiring, TypeScript-based bidirectional drift checker, and isolated Nix tooling dependency closure. Extend `ci-node-api` to run the proof against the built package.

Owned files:

- `node/src/index.d.ts`
- `node/test/api-contract.test.mjs`
- `node/test/package-smoke.mjs`
- `scripts/check-node-api-exports.mjs`
- `package.json`
- `package-lock.json`
- `nix/purescript.nix`
- `nix/checks/node-api.nix`

Proof: focused unit cases that force both drift directions, packed-package smoke against the real artifact, then `./gate.sh`.

### Slice 2 — Make public source documentation mandatory

RED first: configure the public-export JSDoc rule and demonstrate it reports the current undocumented exports.

GREEN: add complete source JSDoc immediately above every public export without reordering or restructuring runtime code; document `CskError` at its defining sibling. Add ESLint tooling and execute lint inside `ci-node-api`.

Owned files:

- `node/src/index.js`
- `node/src/error.js`
- `eslint.config.js`
- `package.json`
- `package-lock.json`
- `nix/purescript.nix`
- `nix/checks/node-api.nix`

Proof: captured RED lint, focused GREEN lint, unchanged runtime export set, then `./gate.sh`.

### Slice 3 — Generate and publish the MkDocs API reference

RED first: add the API nav target and generation check so strict docs/TypeDoc fails while no generator output exists.

GREEN: add TypeDoc Markdown configuration and dependencies, ignore generated output, generate before all local/CI/preview/Pages docs builds, explicitly invoke the expanded `ci-node-api` GitHub check, and link generated reference content to #92's canonical `node/test/api-properties.test.mjs` source.

Owned files:

- `node/src/index.d.ts`
- `typedoc.json`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `nix/purescript.nix`
- `nix/checks/node-api.nix`
- `justfile`
- `mkdocs.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/pages.yml`

Proof: TypeDoc generation into a clean ignored tree, `git status` confirms no generated Markdown is tracked, strict MkDocs succeeds, `nix run .#ci-node-api` succeeds, then `./gate.sh`.

## Sequencing and concurrency

Slices execute S1 → S2 → S3. S2 depends on S1's public-name/type inventory; S3 depends on both the typed facade and source documentation. Q-001 is resolved: csk-92 owns `node/test/api-properties.test.mjs`, and this ticket links but never edits it. Any need to restructure `node/src/index.js` is a parent-bound scope change.

## Final verification

After all slices, run the complete gate, audit commits and task accounting, remove `gate.sh` in the final sentinel commit, update the PR body, mark the PR ready, and wait for fresh remote CI. Do not report completion until the final remote SHA has green required checks and preview/docs generation.
