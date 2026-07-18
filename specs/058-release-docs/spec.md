# Spec — Extensive documentation for versioned releases (#58)

Issue: https://github.com/lambdasistemi/cardano-swiss-knife/issues/58
Follows #53 (versioned, release-gated releases; v0.1.0 live).

## P1 user story

As a treasury actor, I follow the Docs link from the workbench footer and
observe the workbench's own manual, including a Versions and releases page
explaining what the footer version means and how to verify what is live.

## User stories

- US1: A treasury actor clicks "Docs" in the live workbench footer and lands
  on the workbench manual (not the engine's docs).
- US2: A treasury actor reads "Versions and releases" and can verify that
  what they are using equals the latest GitHub release.
- US3: A maintainer reads the Releasing reference and can cut, pin, debug,
  and emergency-redeploy releases without spelunking workflows.
- US4: A maintainer lands a docs improvement as `fix(docs): …` and observes
  a patch release shipping it (docs are never stranded on main).
- US5: A maintainer copying the pattern to another repo reads the
  architecture dataflow and the troubleshooting signatures first.

## Functional requirements

- FR1: `release-please-config.json` gains `changelog-sections` rendering
  `docs`-type commits ("Documentation") alongside the defaults. Verified
  fact: release-please has NO option to make `docs:` commits
  release-triggering — the policy is therefore a documented convention:
  site-affecting docs commits use `fix(docs): …` (patch → release);
  repo-internal docs (README, specs/) stay `docs:`.
- FR2: User Manual page `docs/user/versions.md` ("Versions and releases"):
  footer version meaning, live==release invariant and why it holds
  (tag-gated deploys), reading the changelog/releases page, verification.
- FR3: `docs/dev/releasing.md` becomes a full reference: pipeline anatomy
  (config, manifest, App token + bot-PR-no-CI rationale, release.yml /
  pages.yml / ci.yml tour), version-stamping internals (Version.purs FFI
  placeholder, nix sed, dev label, single-literal rule), operations runbook
  (cutting, Release-As first-release pinning, emergency redeploy, required
  repo settings incl. the `v*` environment tag policy), troubleshooting
  (observed signatures: build-green/deploy-fail-no-steps, 1.0.0 first
  release default, flake ignoring untracked files).
- FR4: `docs/architecture/release-flow.md` with a mermaid dataflow:
  commit → release PR → tag → Pages deploy → footer version.
- FR5: The workbench topbar gains a "Docs" tab — SPA route `/manual`
  rendering the same-origin manual (`basePath <> "docs/"`) in the content
  area via an iframe, keeping the app shell visible. The route cannot be
  `/docs`: that path is where the mkdocs artifact lives on Pages. The footer
  "Docs" link also retargets from the engine docs to the manual. The UX
  suite asserts the tab, the iframe src, and the footer href. The iframe
  target only resolves on the assembled Pages site (the UI derivation does
  not contain the mkdocs output), so tests assert presence and src, not
  loaded content.

- FR6: README reduced to a bare-minimum pointer: project name, one-sentence
  description, live app link, Docs tab link
  (https://lambdasistemi.github.io/cardano-swiss-knife/manual), engine repo
  link. Before cutting, any README-only fact (engine coupling via flake
  inputs, signing-flow stance, local dev commands) is verified present in —
  or folded into — the manual's Architecture/Developer pages.
- FR7 (verified already satisfied): the webapp footer "Source" link targets
  the repository and stays asserted (tx-identify.spec.mjs:2135).

## Success criteria

- `mkdocs build --strict` and `./gate.sh` green at every slice HEAD.
- Playwright asserts the footer Docs href is the workbench manual.
- Post-merge: the PR cuts a patch release whose deploy serves the new pages
  and the retargeted footer link.

## Exclusions (verbatim from the issue)

- No long-form docs embedded in the SPA bundle (the mkdocs site is part of
  the same release artifact)
- No engine (cardano-ledger-inspector) documentation changes
- No versioned-docs archive (mike); single current version only
- No release-mechanics changes beyond `changelog-sections`
