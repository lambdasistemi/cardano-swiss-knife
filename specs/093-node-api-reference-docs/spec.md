# Feature Specification — Node API Reference Documentation

**Issue**: #93  
**Parent**: #74  
**Priority**: P1

## User story

As a consumer of `@lambdasistemi/cardano-swiss-knife`, I can discover the complete public Node API in my editor and on the documentation site, including each input, the non-throwing result union, and the stable error-code taxonomy, so I do not have to reverse-engineer JavaScript source.

## Acceptance scenarios

1. Installing the packed package exposes a declaration facade through `package.json`; an editor sees named functions, structured inputs, and `CskResult<T>` as `{ ok: true, value: T } | { ok: false, error: { code, message } }`.
2. Every public value exported by the built runtime has one matching value declaration, and every declared value exists at runtime. Either-direction drift fails `ci-node-api`.
3. Every public function in `node/src/index.js`, plus the public `CskError` definition in `node/src/error.js`, has JSDoc with parameters, return shape, error taxonomy, and a short example. Removing one block or a required tag makes the JSDoc lint fail.
4. TypeDoc with `typedoc-plugin-markdown` generates `docs/api/index.md` and linked Markdown beneath `docs/api/` from the checked-in declaration/JSDoc contract before MkDocs runs.
5. `docs/api/` is ignored generated output. A clean checkout contains no generated API Markdown, while local, PR-preview, and Pages builds regenerate it and strict MkDocs includes an **API Reference** navigation entry.
6. The generated reference links readers to the property-based executable contract delivered by #92.
7. A pull request that changes `node/src/**`, the declaration facade, or docs tooling cannot merge when export drift, JSDoc completeness, TypeDoc generation, or strict MkDocs fails.

## Functional requirements

- **FR-001**: The public contract covers exactly the package entrypoint exported by `package.json`; CLI command adapters and internal helper exports are not presented as package API.
- **FR-002**: The checked-in `.d.ts` facade defines reusable public input types, the discriminated result union, and the complete Node API error-code union. It must not paper over the contract with unqualified `any`.
- **FR-003**: `package.json`, the source build, the Nix package build, and the packed artifact agree on the declaration file path.
- **FR-004**: The drift proof imports the built runtime with `Object.keys(await import(...))`, extracts value declarations from the facade, sorts both sets, and fails with both missing and stale names reported.
- **FR-005**: `eslint-plugin-jsdoc` enforces documentation on the package entrypoint exports and `CskError`, including parameters, returns, and examples where applicable.
- **FR-006**: Source JSDoc explicitly says public operations resolve to `CskResult<T>` and captures the codes callers can branch on; public operations are documented as returning failures rather than throwing.
- **FR-007**: TypeDoc Markdown generation is deterministic from checked-in sources and never requires committed generated output.
- **FR-008**: The existing `ci-node-api` check runs facade drift, JSDoc lint, and TypeDoc generation in addition to existing Node tests; GitHub Actions invokes this merge-blocking check explicitly.
- **FR-009**: Every existing docs build path generates API Markdown before `mkdocs build --strict`: the main CI build, PR preview, Pages publication, and the local `just build-docs` workflow.
- **FR-010**: The reference docs link to #92's canonical repository-relative property-suite source at `node/test/api-properties.test.mjs`, as authorized through Q-001.

## Non-goals

- Documenting CLI command adapters as a second API.
- Rewriting prose user or operator guides.
- Changing runtime behavior, reordering exports, or restructuring `node/src/index.js`.
- Reimplementing provider HTTP or TextEnvelope parsing owned by #10 and #67.
- Committing generated Markdown.

## Success criteria

- **SC-001**: A packed-package smoke proves that the declaration file exists at the advertised path and that runtime/declaration value-export sets are identical.
- **SC-002**: A negative fixture or mutation proof demonstrates that each of drift, missing JSDoc, and TypeDoc failure is detected before GREEN.
- **SC-003**: `nix run .#ci-node-api` and `./gate.sh` pass from the issue worktree.
- **SC-004**: Fresh GitHub Actions for the final remote SHA are green, including Node API enforcement and PR preview, before the ticket reports `COMPLETE`.

## Clarifications

- The public package surface is `node/src/index.js` plus the re-exported `CskError` definition; exports used only by sibling implementation modules or CLI adapters remain internal.
- The existing all-PR workflow is stricter than a path-filtered job and satisfies the requirement that Node-source changes always build docs.
- Q-001 resolved the #92 property-suite link target as `node/test/api-properties.test.mjs`; the epic owner has directed csk-92 to converge on that filename.
