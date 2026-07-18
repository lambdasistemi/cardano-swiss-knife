# Plan — Extensive documentation for versioned releases (#58)

## Tech notes

- All content ships in the mkdocs tree (`docs/*.md` + `mkdocs.yml` nav);
  mermaid is already configured (pymdownx.superfences custom fence).
- Commit convention adopted BY this PR: the docs slices are committed as
  `fix(docs): …` so the PR itself exercises US4 and cuts the patch release
  that ships the pages. Slice D is a plain `fix:` (real link bug).
- The footer Docs link lives in `docs/inspector/src/Shell.purs` `siteFooter`
  (`extLink "https://lambdasistemi.github.io/cardano-ledger-inspector/" "Docs"`);
  the MD3-shell Playwright test asserts footer link hrefs — assertions move
  with the change.
- `changelog-sections` for the node package: explicit list with feat/fix
  visible as today plus `{"type": "docs", "section": "Documentation"}`.
- csk keeps its permanent `gate.sh`; no drop commit.

## Slices

### Slice A — release policy: changelog + convention

`release-please-config.json` changelog-sections; `docs/dev/releasing.md`
gains the "Docs releases" policy section (fix(docs) convention + why the
config-only route does not exist). Commit: `fix(docs): document the
shipped-docs release convention`.

### Slice B — user manual page

`docs/user/versions.md` + nav under User Manual. Commit: `fix(docs): add
the versions and releases user manual`.

### Slice C — developer reference + architecture dataflow

`docs/dev/releasing.md` full expansion per FR3; `docs/architecture/release-flow.md`
mermaid dataflow + nav. Commit: `fix(docs): expand the releasing reference`.

### Slice D — footer Docs link + UX assertion

Shell.purs href → workbench manual; tx-identify.spec.mjs assertion updated.
Commit: `fix: point the footer docs link at the workbench manual`.

## Post-merge operational step (part of acceptance)

release-please opens/updates the release PR (patch, v0.1.1) listing the
fix(docs) commits (and Documentation section for any docs: entries); merge
it; tag deploy serves the new pages; live footer Docs link lands on the
manual.
