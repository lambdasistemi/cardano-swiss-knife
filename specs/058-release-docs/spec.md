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
- FR5: The SPA footer "Docs" link targets the workbench manual
  (https://lambdasistemi.github.io/cardano-swiss-knife/docs/); the UX suite
  asserts the new href.

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
