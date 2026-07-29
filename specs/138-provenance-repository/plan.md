# Plan — csk#138

Two slices. The first is small and obvious; the second is the one that matters.

## Slice A — the field and a guard that proves it

`package.json` gains:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/lambdasistemi/cardano-swiss-knife.git"
}
```

The published tarball's `package.json` is copied verbatim from the repo root by
`nix/purescript.nix`, so the field propagates with no packaging change.

The guard belongs where the other package-level release contracts live
(`scripts/check-release-package.mjs` or `check-release-manifests.mjs` — the pair
picks whichever already owns `package.json` assertions; do not invent a new
script). It must:

- require `repository.url` to be present and non-empty;
- **normalize before comparing** — strip a `git+` prefix and a `.git` suffix, so
  the authored form and the provenance form are compared like for like;
- compare case-sensitively against the expected repository, because the
  registry does (npm/cli#8036);
- **not** hard-code the expected URL as a literal only in the test — derive it,
  so a repo rename is caught rather than silently accepted.

**FR-3 is the part that must not be skipped.** Two seeded controls: a
`package.json` with no `repository`, and one whose `repository.url` points at a
different repository. Each must turn the check red, and the message must name
the field. A guard shown only passing is precisely what let three defects
through.

## Slice B — a rehearsal that touches the real registry

This is the slice that stops the bleeding. Everything else has been a fix for a
symptom discovered in production.

**Shape:** a `workflow_dispatch` job that builds the real tarball, republishes it
under a prerelease version to the `next` dist-tag, and never touches `latest`.

Constraints the pair must respect:

- **Never `latest`.** `--tag next` is mandatory. A prerelease published without
  an explicit dist-tag becomes `latest` and would be served to every plain
  `npm install`.
- **The prerelease version must not collide with a future real release.** Derive
  it from the current version plus a run-unique suffix (e.g.
  `<version>-rc.<github.run_number>`), so repeated rehearsals never clash and no
  real release number is consumed.
- **`package.json` stays the single version authority.** Do not bump the
  repository's `package.json` to a prerelease — that fights the existing
  version/tag contract, which `just release-version` enforces. Rewrite the
  version inside the built tarball and repack, or use whatever mechanism keeps
  the repo's authored version untouched.
- **It must exercise provenance for real**: `--provenance` and `--access public`
  on a GitHub-hosted runner with `id-token: write`. A rehearsal without
  provenance would not have caught this ticket's own defect and is therefore
  worthless for its purpose.
- **`check-release-workflows.mjs` must still pass.** It locates *the*
  publication job structurally; a second job that runs `npm publish` may confuse
  that detection, the step-ordering guard, or the #134 publish-argument guard.
  If the checker needs to learn the difference between the release publisher and
  the rehearsal, that is in scope — extending it is expected, weakening it is
  not. If an existing assertion goes red, Q-file rather than loosen it.

If a clean shape exists to run this automatically before a tag, keep it. If it
would require contorting the release flow, keep the manual dispatch and say so
in `WIP.md` — the orchestrator will file the permanent version as a follow-up.
Do not force it.

## Risk register

| Risk | Caught by |
| --- | --- |
| Guard passes on a mismatched URL because of `git+`/`.git` normalization | Seeded mismatch control (FR-3) |
| Rehearsal publishes to `latest` and poisons `npm install` | Explicit `--tag next`; navigator blocks its absence |
| Rehearsal consumes a real version number | Run-unique prerelease suffix |
| Second publish job breaks the workflow checker's job detection | `just release-workflows` in the gate |
| package.json edit breaks packaging/manifest contracts | `just release-package`, `just release-gates` in the gate |

## Slices and ownership

**Slice A** — owned: `package.json`, the chosen `scripts/check-release-*.mjs`,
its test file under `node/test/`.
**Slice B** — owned: `.github/workflows/` (the rehearsal), and
`scripts/check-release-workflows.mjs` + `node/test/release-workflows.test.mjs`
if the checker must learn about the second job.

Forbidden throughout: `cli/`, `node/src/`, `lib/`, `nix/`, `package-lock.json`
(unless the `repository` addition genuinely requires a lock touch — Q-file
first), `specs/`, `gate.sh`.

## Orchestrator-owned, after the PR merges

1. Run the rehearsal; verify the prerelease is on the registry under `next` and
   that `latest` is untouched.
2. Only then merge the 0.1.5 release PR.
3. Verify the real publish: registry version, release assets, Pages.
4. Write the pointer note once and add it to the `v0.1.2`, `v0.1.3` and
   `v0.1.4` release pages.
