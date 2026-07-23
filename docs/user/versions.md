# Versions and releases

## What the footer version is

The workbench footer shows a line like `Cardano Swiss Knife v0.1.0`. Every
deployment of the live workbench is built from a tagged GitHub release —
the version in the footer names exactly which release you are using.

## Why it can be trusted

There is no path that puts unreleased code on the live site. The workbench
is only ever built and deployed from a release tag, never from an
in-progress commit. So what you are using always equals the latest
published release — no exceptions, no "almost released" builds.

This matters for a treasury operator or co-signer: when you inspect a
transaction or verify a signature in the workbench, you are looking at the
behavior of a specific, named, auditable release — not an untested
snapshot.

## Reading the changelog

To see what changed between versions:

- the GitHub releases page lists every release with its notes:
  https://github.com/lambdasistemi/cardano-swiss-knife/releases
- `CHANGELOG.md` in the repository lists the same history in one file:
  https://github.com/lambdasistemi/cardano-swiss-knife/blob/main/CHANGELOG.md

Both are grouped by change type (Features, Bug Fixes, Documentation, and so
on), so you can scan for anything relevant to the pages or workflows you
rely on.

## Verifying the single version authority

<!-- release-docs:procedure:version-verify -->
The version of record lives in root `package.json`. Verify the single
version authority against every published surface:

```bash
# package.json is the authority
node -p "require('./package.json').version"

# CLI and Node must report the same value
csk --version
node -e "import('@lambdasistemi/cardano-swiss-knife').then(m => console.log(m.version))"
```

CLI, Node API, WebUI footer, npm package metadata, Nix package metadata,
the git tag (`vX.Y.Z`), and the GitHub release title must all match. A
mismatch means you are not on a consistent release — do not trust mixed
artifacts.
<!-- /release-docs:procedure:version-verify -->

## Bundle checksum verification

<!-- release-docs:procedure:checksum-verify -->
Release artifacts include a published `SHA256SUMS` file next to the
universal bundle on the GitHub release. After download:

```bash
sha256sum -c SHA256SUMS
# or on systems without GNU coreutils:
shasum -a 256 -c SHA256SUMS
```

Reject any bundle whose checksum does not match. Do not run unsigned or
unlisted artifacts as if they were a published release.
<!-- /release-docs:procedure:checksum-verify -->

## Verifying what is live

Compare the version in the footer against the latest release:

https://github.com/lambdasistemi/cardano-swiss-knife/releases/latest

These should always match. If they do not:

1. Hard-refresh the page (your browser may be serving a stale cached
   bundle).
2. If the mismatch persists after a hard refresh, report it — this would
   mean the live site is not showing the release it claims to be.

## The "dev" label

If the footer ever shows `dev` instead of a version number, you are **not**
on the released site. This happens on local or preview builds that were
never tagged and published. Do not treat anything you see on a `dev` build
as canonical — inspect, sign, or verify only against a workbench showing a
real `vX.Y.Z` version.
