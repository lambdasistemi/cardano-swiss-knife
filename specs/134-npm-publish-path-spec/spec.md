# Spec — csk#134: npm publish never runs (tarball path parsed as a repo shorthand)

Issue: https://github.com/lambdasistemi/cardano-swiss-knife/issues/134
Milestone: M1. Follows directly from #129.

## Problem in one paragraph

When a release tag is cut, the publish job builds the npm tarball and then hands
its path to `npm publish`. The path is written without a leading `./`, and npm
reads a bare `something/something` argument as the name of a GitHub repository
rather than as a file on disk. So instead of uploading the tarball it tries to
clone a repository that does not exist, fails, and skips the step that would
have attached the release archive and checksums. The package has never appeared
on the registry at any version, and the release page is left empty.

## Why this was invisible until now

The publish job has never completed. Until #129 was fixed it died at its first
step, so this line had never executed even once. The workflow checker validates
that an `npm publish` step exists and carries the right flags; it never asks
whether the argument is something npm will accept as a path. The guard proves
the step is *present*, not that it *works* — the same gap, one step further
down the same job.

## P1 user story

**As the maintainer cutting a release**, I want the publish step to upload the
tarball it just built, so that the package reaches the registry and the release
page carries its artifacts.

## Supporting user story

**As a reviewer of a future change to the publish command**, I want a check that
fails if the argument is one npm would resolve as a package spec rather than a
path, so this cannot regress silently the way it was introduced.

## Functional requirements

- **FR-1** — The publish step passes an argument npm resolves as a filesystem
  path.
- **FR-2** — `scripts/check-release-workflows.mjs` rejects a publish argument
  that npm would resolve as anything other than a path — specifically a bare
  `a/b` shorthand.
- **FR-3** — The guard is demonstrated able to fail: a seeded workflow carrying
  the old bare-path argument must turn it red. A guard only ever shown passing
  is not a deliverable.
- **FR-4** — Every existing release-workflow assertion still holds; the
  ordering guard and the structural publish-job assertions are unchanged.
- **FR-5** — Desirable, at the pair's discretion if it stays cheap: a rehearsal
  (`npm publish --dry-run`) somewhere in CI, so the step is exercised outside a
  real tag.

## Out of scope

- Retagging or re-pointing `v0.1.2` or `v0.1.3`.
- The missing `NPM_TOKEN` secret. That is an operator action, tracked at the
  desk, and no code change can substitute for it.

## Success criteria

- **SC-1** — `./gate.sh` green.
- **SC-2** — The seeded-bad-argument control turns the guard red.
- **SC-3** — At the next release, `Publish npm tarball` succeeds and
  `Upload bundle and checksums` runs. (Gated on `NPM_TOKEN` existing; not
  provable in this PR.)

## Measured evidence (2026-07-29)

Production failure at `v0.1.3`
(https://github.com/lambdasistemi/cardano-swiss-knife/actions/runs/30451145552):

```
npm error code 128
npm error command git --no-replace-objects ls-remote \
  ssh://git@github.com/node-package/lambdasistemi-cardano-swiss-knife-0.1.3.tgz.git
npm error git@github.com: Permission denied (publickey).
```

Local control, the same tarball both times, only the prefix differing:

| Argument | npm behaviour |
| --- | --- |
| `node-package/probe-0.0.1.tgz` | `git ls-remote ssh://git@github.com/node-package/probe-0.0.1.tgz.git` — reproduces production |
| `./node-package/probe-0.0.1.tgz` | reads the tarball; prints `name`, `version`, `filename`, `package size` |

The control also shows `npm publish --dry-run` is fast and needs no
credentials, which is what makes FR-5 plausible.
