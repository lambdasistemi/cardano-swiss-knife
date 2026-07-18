# Tasks — Extensive documentation for versioned releases (#58)

## Slice A — release policy: changelog + convention

- [ ] T581-SA `release-please-config.json` has explicit `changelog-sections`
      incl. `{"type": "docs", "section": "Documentation"}`; valid JSON
- [ ] T582-SA `docs/dev/releasing.md` documents the fix(docs) convention and
      the verified absence of a config-only route
- [ ] T583-SA `./gate.sh` green; commit `fix(docs): document the shipped-docs release convention`

## Slice B — user manual page

- [ ] T584-SB `docs/user/versions.md` covers footer meaning, live==release
      invariant, changelog reading, verification; nav entry added
- [ ] T585-SB `./gate.sh` green; commit `fix(docs): add the versions and releases user manual`

## Slice C — developer reference + architecture dataflow

- [ ] T586-SC `docs/dev/releasing.md` covers pipeline anatomy, stamping
      internals, operations runbook, troubleshooting signatures
- [ ] T587-SC `docs/architecture/release-flow.md` mermaid dataflow + nav
- [ ] T588-SC `./gate.sh` green; commit `fix(docs): expand the releasing reference`

## Slice D — footer Docs link + UX assertion

- [ ] T589-SD Shell.purs footer Docs href = workbench manual; Playwright
      asserts the new href
- [ ] T590-SD `./gate.sh` green; commit `fix: point the footer docs link at the workbench manual`
