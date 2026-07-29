# Plan — csk#134

## The shape of the fix

Two edits, one commit:

1. `.github/workflows/release.yml:106` — prefix the publish argument so npm
   resolves it as a path.
2. `scripts/check-release-workflows.mjs` — a guard on the publish job's
   argument, so the bare form cannot come back.

## What the guard must actually assert

The interesting question is not "does the string start with `./`" but "would npm
treat this as a path". Those are close but not identical, and the guard should
be written against the real rule rather than against the one example we hit.

npm resolves an argument as a file only when it is path-shaped — a leading
`./`, `../`, `/`, `~/`, or a Windows drive prefix. Anything else that contains a
`/` is read as a GitHub `user/repo` shorthand. That is why
`node-package/x.tgz` became `github.com/node-package/x.tgz.git`, and it is the
rule the guard should encode.

Write the assertion positively — *the argument must be path-shaped* — rather
than as a blacklist of the one bad form. A blacklist of `a/b` would silently
pass some other non-path spec (`@scope/pkg`, `git+https://…`, a bare package
name) that would be equally wrong here.

## FR-3 is the part that matters

A guard demonstrated only on the good workflow proves nothing. The test must
seed a workflow document carrying the **old** bare-path argument and assert the
checker rejects it, with the failure message naming the publish argument. This
is the analogue of the negative control that closed #129, and for the same
reason: it distinguishes "the check works" from "the check silently stopped
checking".

`node/test/release-workflows.test.mjs` already builds synthetic workflow
documents for exactly this kind of negative assertion — follow the existing
shape there rather than inventing a new harness.

## FR-5 — the rehearsal, if it stays cheap

I measured `npm publish --dry-run` locally: it needs no credentials, no network
auth, and returned in under a second on a 225-byte package. It reads the
tarball and prints name/version/filename.

`ci.yml` already has a `node-package-artifact` job that runs
`nix build .#node-package`, so the built tarball is in hand there. A dry-run
against it would exercise the real argument shape on every PR rather than only
at a tag.

This is **desirable, not contractual**. Take it if it is a small addition to an
existing job; if it turns into its own job, a new nix attribute, or credential
plumbing, drop it and say so in `WIP.md` — the static guard is what the desk
made contractual, and FR-5 must not put the ticket at risk.

## Risk register

| Risk | Caught by |
| --- | --- |
| The `./` change breaks an existing structural assertion that greps for `node-package/*.tgz` | `just release-workflows` (existing suite runs unchanged) |
| The new guard is vacuous | FR-3 seeded-failure control — required, not optional |
| The guard is over-tight and rejects a legitimate future form | Write it as "must be path-shaped", not "must equal this string" |
| Scope creep into the NPM_TOKEN problem | Out of scope by the spec; it is an operator action |

## Slices

One slice, one commit.

**Slice A — publish argument is a path, and a guard that proves it.**
RED: seeded bad-workflow test fails against the current checker. GREEN: the
guard plus the `./` fix.

Owned files: `.github/workflows/release.yml`,
`scripts/check-release-workflows.mjs`, `node/test/release-workflows.test.mjs`.

Forbidden: everything else — `cli/`, `node/src/`, `nix/`, `package.json`,
`package-lock.json`, `justfile`, `specs/`, `gate.sh`, `.github/workflows/ci.yml`
and `pages.yml` **unless** FR-5 is taken, in which case `ci.yml` is added to the
owned set and nothing else.

## Not this ticket

`NPM_TOKEN` does not exist. Until the desk announces it, no code change can make
a real publish succeed. The desk has gated the 0.1.4 release merge on that
announcement; this PR merges when green regardless, because the fix is correct
independently of the token.
