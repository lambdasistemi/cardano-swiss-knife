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

## Version on the live site

The footer of the live site shows the released version. That version comes
from the tag the current deployment was built from, so it always matches
what's on GitHub Releases.

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
