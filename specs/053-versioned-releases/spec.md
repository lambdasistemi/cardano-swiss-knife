# Spec — Versioned releases for the workbench SPA (#53)

Issue: https://github.com/lambdasistemi/cardano-swiss-knife/issues/53

## P1 user story

As a treasury actor, I open the live workbench and observe a footer version
`vX.Y.Z` that matches the latest GitHub release tag and changelog.

## Context

csk currently releases by continuous Pages deploy on every merge to `main` —
no tags, no changelog, no record of which build was live when. attx and the
inspector both have versioned pipelines; csk is the outlier. The decided model
(operator choice, 2026-07-18) is **release-gated deploy**: Pages publishes
only from release tags, so the live site always equals the latest GitHub
release.

## User stories

- US1: A treasury actor reads the footer of the live workbench and sees the
  released version; the same version exists as a GitHub release with a
  changelog describing what changed.
- US2: A maintainer merges feat/fix PRs to `main` without deploying; shipping
  is the explicit act of merging the release-please PR, which tags and
  deploys.
- US3: A maintainer needs an emergency redeploy and triggers the Pages
  workflow manually (`workflow_dispatch`) without cutting a release.

## Functional requirements

- FR1: `release-please` (node type, manifest mode) maintains a release PR
  from conventional commits on `main`, authored via the org App token
  (`vars.CI_APP_ID` + `secrets.CI_APP_PRIVATE_KEY`, org-visible) so CI runs
  on the release PR.
- FR2: Merging the release PR creates tag `vX.Y.Z`, a GitHub release, and
  updates `CHANGELOG.md` + the `version` field of `package.json`.
- FR3: The Pages workflow triggers on `v*` tag push (created by the App
  token, so the event fires) and `workflow_dispatch` only; the `push: main`
  trigger is removed.
- FR4: The built SPA embeds the `package.json` version at build time; the
  footer renders it. Dev builds render a recognizable dev placeholder.
- FR5: The HTML `<title>` reads "Cardano Swiss Knife".
- FR6: mkdocs docs describe the release flow: when to merge the release PR,
  what deploys when, how to verify what is live.

## Success criteria

- Playwright UX check asserts the footer shows the version from
  `package.json` and `document.title` is "Cardano Swiss Knife".
- `./gate.sh` green at every slice HEAD.
- After merge: release-please opens a release PR proposing `0.1.0`; merging
  it tags `v0.1.0`, publishes the release, and the Pages deploy from the tag
  serves a footer reading `v0.1.0`.

## Exclusions (non-goals, verbatim from the issue)

- No binary/CLI distribution (Homebrew, AppImage, deb, rpm) — csk ships as a
  web app only
- No changes to cardano-ledger-inspector versioning (the engine has its own
  v0.1.0 pipeline)
- No changelog backfill for pre-versioning history
- No npm package publication
- PR preview deploys unchanged
