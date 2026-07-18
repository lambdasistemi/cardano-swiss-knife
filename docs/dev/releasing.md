# Releasing

## Release PR

Merges to `main` do not deploy anything. The Release workflow runs
[release-please](https://github.com/googleapis/release-please) on every push
to `main` and keeps a release PR up to date, authored with the CI App token
so its own commits trigger CI.

## Cutting a release

Merging the release PR:

- tags the resulting commit `vX.Y.Z`
- creates a GitHub release
- updates `CHANGELOG.md`

The tag push triggers the Pages workflow, which builds and deploys from the
tagged tree. The live site is always exactly the latest release — never an
untagged commit on `main`.

## Docs releases

Docs are part of the released site: nothing under `docs/` reaches the live
site until it ships in a tagged release. A docs-only change that never bumps
the version never goes live, no matter how correct it is.

release-please has no configuration option that releases on `docs:`
commits — checked against its config schema, not assumed. Its releasable
types are fixed to `fix`/`feat`/`perf`/`revert` (plus breaking changes);
`docs:` alone never triggers a version bump or release PR update, whatever
`changelog-sections` says.

So the convention: a docs change that affects the shipped site is committed
as `fix(docs): …`, which release-please treats as a patch bump and pulls
into the release PR. Repo-internal docs — README, `specs/`, `.worker`
briefs, anything that never ships to the site — stay plain `docs:` and ride
along with the next release that a `fix`/`feat` commit triggers.

`docs:` commits (of either kind) now render in the changelog under their own
"Documentation" section, so shipped-docs and repo-internal docs work are
both visible in `CHANGELOG.md` — only the `fix(docs)` ones actually cut a
release.

## Version on the live site

The footer of the live site shows the released version. That version comes
from the tag the current deployment was built from, so it always matches
what's on GitHub Releases.

## Repository settings

The `github-pages` environment must allow deployments from `v*` tags
(Settings → Environments → github-pages → deployment branch and tag rules).
Without that rule the tag-triggered deploy job is rejected by environment
protection before any step runs — the build job succeeds and the deploy job
fails with no failed steps. The `v0.1.0` deploy hit exactly this.

## Emergency redeploy

If Pages needs to be rebuilt without cutting a release (a hotfix to the
deploy pipeline itself, a stuck build), run the Pages workflow manually via
`workflow_dispatch`. It deploys whichever ref you select without tagging or
creating a release.

## Verification

Compare the version shown in the live footer against
[the latest release](https://github.com/lambdasistemi/cardano-swiss-knife/releases/latest).
They should always match.

## Initial version

The first release was pinned to `0.1.0` with a `Release-As: 0.1.0` commit
footer — without it, release-please defaults an unreleased repository's first
release to `1.0.0`.
