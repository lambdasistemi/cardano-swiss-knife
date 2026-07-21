# Tasks — Issue #93 Node API Reference Documentation

**Input**: [spec.md](spec.md) and [plan.md](plan.md)

**Execution**: Each implementation slice is one driver+navigator RED/GREEN cycle and one bisect-safe commit. The orchestrator checks tasks only after reviewing the full diff and independently rerunning the gate.

## Slice 1 — Publish and enforce the typed facade

**Goal**: Ship an editor-visible declaration contract whose value exports cannot drift from the installed runtime.

- [ ] T001-S1 Add RED packed-artifact assertions for the advertised `.d.ts` and exact runtime/declaration value-export parity.
- [ ] T002-S1 Define the public inputs, `CskResult<T>`, complete `CskErrorCode` taxonomy, operation outputs, and all 25 package value exports (24 functions plus `CskError`) in `node/src/index.d.ts` without unqualified `any`.
- [ ] T003-S1 Publish `node/dist/index.d.ts` through package metadata and both npm/Nix build paths.
- [ ] T004-S1 Add the TypeScript-AST bidirectional export drift checker and reproducible isolated documentation-tool dependency closure.
- [ ] T005-S1 Run the focused drift/package proof and `./gate.sh`; commit `feat(node): publish typed API facade` with `Tasks: T001, T002, T003, T004, T005`.

## Slice 2 — Make public source documentation mandatory

**Goal**: Every runtime export explains its input, non-throwing result, error codes, and usage at the point maintainers edit it.

- [ ] T006-S2 Add the ESLint JSDoc rule first and capture RED across the currently undocumented public entrypoint.
- [ ] T007-S2 Add params, return union, error taxonomy, and short `@example` JSDoc to every public `node/src/index.js` export and the defining `CskError` class without restructuring runtime code.
- [ ] T008-S2 Wire `eslint-plugin-jsdoc` through the reproducible tooling closure and `ci-node-api`, with required-tag linting scoped only to the true package surface.
- [ ] T009-S2 Prove lint GREEN, prove the runtime export set is unchanged, run `./gate.sh`, and commit `docs(node): document every public export` with `Tasks: T006, T007, T008, T009`.

## Slice 3 — Generate and publish the MkDocs API reference

**Goal**: Build browsable Markdown from the live contract on every docs and Node-source CI path without committing generated output.

- [ ] T010-S3 Add a RED docs-generation/site proof for the missing `docs/api/index.md` target.
- [ ] T011-S3 Configure TypeDoc plus `typedoc-plugin-markdown` to generate an `index.md`-rooted API tree from the facade, including the parent-confirmed #92 property-suite source link.
- [ ] T012-S3 Ignore `docs/api/`, add the MkDocs **API Reference** nav, and make local, main CI, PR preview, and Pages builds generate before strict MkDocs.
- [ ] T013-S3 Run TypeDoc generation inside `ci-node-api` and invoke that check explicitly as merge-blocking GitHub CI.
- [ ] T014-S3 Prove generated Markdown remains untracked, strict MkDocs and `nix run .#ci-node-api` pass, run `./gate.sh`, and commit `docs(node): publish generated API reference` with `Tasks: T010, T011, T012, T013, T014`.

## Finalization (orchestrator-owned, after every task above is checked)

Audit all task/commit links, rerun the final gate, update PR #94 to the delivered contract, verify generated output is absent from git, remove `gate.sh` in `chore: drop gate.sh (ready for review)`, mark the PR ready, and require fresh remote CI green before `COMPLETE`.

## Dependencies and forbidden scope

- Slices run strictly S1 → S2 → S3; Q-001 blocks S3 only.
- Workers must not edit `specs/093-node-api-reference-docs/`, `gate.sh`, PR metadata, `node/test/` property files owned by csk-92, or any sibling worktree.
- Reordering exports, changing runtime behavior, or restructuring `node/src/index.js` requires a parent Q-file before work continues.
