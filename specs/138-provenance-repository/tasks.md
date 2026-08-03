# Tasks — csk#138

## Slice A — repository field, and a guard proven able to fail

Commit subject: `fix: declare the repository so provenance validation passes`
Trailer: `Tasks: T138`

- [X] T138 RED — seed two failing controls against the chosen package-level
      release check: a `package.json` with no `repository`, and one whose
      `repository.url` points at a different repository. Both must be rejected,
      with the message naming the field. Observe them fail before writing the
      guard.
- [X] T138 GREEN — add `repository` to `package.json`
      (`git+https://github.com/lambdasistemi/cardano-swiss-knife.git`) and the
      guard that enforces it, normalizing `git+`/`.git` before a case-sensitive
      comparison.
- [X] T138 PROOF — `./gate.sh` green; seeded controls observed red before and
      green after.

## Slice B — a rehearsal against the real registry

Commit subject: `feat: rehearse npm publication against the real registry`
Trailer: `Tasks: T138`

- [X] T138 RED — assert the rehearsal's contract in
      `node/test/release-workflows.test.mjs`: the rehearsal job publishes with
      `--tag next`, with `--provenance`, and a seeded variant **without**
      `--tag next` must be rejected. That negative is the one that matters: an
      untagged prerelease silently becomes `latest`.
- [X] T138 GREEN — add the `workflow_dispatch` rehearsal that builds the real
      tarball, republishes it at a run-unique prerelease version under
      `--tag next` with provenance, leaving the repository's authored version
      untouched; extend `check-release-workflows.mjs` if it must distinguish the
      rehearsal from the release publisher.
- [X] T138 PROOF — `./gate.sh` green.

## Orchestrator-owned (no slice, no code)

- [ ] T138-O1 finalization audit, drop `gate.sh`, mark ready, merge.
- [ ] T138-O2 run the rehearsal; verify the prerelease is on the registry under
      `next` and that `latest` is untouched. **Required before O3.**
- [ ] T138-O3 merge the 0.1.5 release PR.
- [ ] T138-O4 verify the real publish: registry version, release assets
      (`*.tgz` + `SHA256SUMS`), Pages at the new version.
- [ ] T138-O5 write the pointer note once and add it to the v0.1.2, v0.1.3 and
      v0.1.4 release pages.
- [ ] T138-O6 if the pair kept the rehearsal manual, file the permanent pre-tag
      rehearsal as an M2 follow-up.
