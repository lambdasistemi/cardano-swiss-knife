# Tasks — Extensive documentation for versioned releases (#58)

## Slice A — release policy: changelog + convention

- [X] T581-SA `release-please-config.json` has explicit `changelog-sections`
      incl. `{"type": "docs", "section": "Documentation"}`; valid JSON
- [X] T582-SA `docs/dev/releasing.md` documents the fix(docs) convention and
      the verified absence of a config-only route
- [X] T583-SA `./gate.sh` green; commit `fix(docs): document the shipped-docs release convention`

## Slice B — user manual page

- [X] T584-SB `docs/user/versions.md` covers footer meaning, live==release
      invariant, changelog reading, verification; nav entry added
- [X] T585-SB `./gate.sh` green; commit `fix(docs): add the versions and releases user manual`

## Slice C — developer reference + architecture dataflow

- [X] T586-SC `docs/dev/releasing.md` covers pipeline anatomy, stamping
      internals, operations runbook, troubleshooting signatures
- [X] T587-SC `docs/architecture/release-flow.md` mermaid dataflow + nav
- [X] T588-SC `./gate.sh` green; commit `fix(docs): expand the releasing reference`

## Slice D — Docs tab in the UI

- [X] T589-SD RouteManual exists (Routing.purs path `manual`); topbar shows a
      "Docs" tab; `/manual` renders the manual iframe (`routeBase <> "docs/"`);
      footer Docs href = workbench manual; `manual` added to every route
      enumeration (wasm-ui fallback loop, smokes)
- [X] T590-SD Playwright asserts the Docs tab, the iframe src, the footer
      href; nav-count assertions updated
- [X] T591-SD `./gate.sh` green; commit `feat: add a docs tab to the workbench`

## Slice E — bare-minimum README

- [X] T592-SE README-only facts verified present in (or folded into) the
      manual's Architecture/Developer pages
- [X] T593-SE README.md reduced to a minimal pointer incl. the Docs tab link
- [X] T594-SE `./gate.sh` green; commit `fix(docs): fold the readme into the manual` (manual pages changed, per the convention)
