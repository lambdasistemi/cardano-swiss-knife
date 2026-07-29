# Spec — csk#138: provenance rejects publication, and nothing rehearses the registry

Issue: https://github.com/lambdasistemi/cardano-swiss-knife/issues/138
Milestone: M1. Third in the chain after #129 and #134.

## Problem

Publishing with provenance makes npm attest which repository built the package;
the registry then requires the package's own `package.json` to declare that same
repository. Ours declares none, so the registry rejects the upload with a 422
and the asset-upload step after it is skipped.

That is a one-field fix. The reason this ticket is larger is the second half:
**nothing exercises a real registry round-trip**, so each of the three defects
in this step has only been discovered in production, one tag at a time, each
costing a burnt version number. The `--dry-run` rehearsal added in #134 cannot
catch this class — dry-run never contacts the registry, so provenance is never
validated.

## P1 user story

**As the maintainer cutting a release**, I want the publish step to succeed at
the registry, so the package is actually installable and the release carries its
artifacts.

## Supporting user story

**As the maintainer**, I want to find out that publication is broken *before*
burning a version number, so a fourth requirement behind this step surfaces in a
rehearsal rather than in a release.

## Functional requirements

- **FR-1** — `package.json` declares a `repository` whose `url` matches this
  repository. Authored as `git+https://github.com/lambdasistemi/cardano-swiss-knife.git`,
  which npm normalizes to the form provenance compares against.
- **FR-2** — A release check **fails** when `package.json` has no
  `repository.url`, or when its normalized value does not match the repository.
- **FR-3** — FR-2's check is demonstrated able to fail: a seeded `package.json`
  with a missing and with a mismatched `repository.url` must each turn it red.
- **FR-4** — A rehearsal contacts the **real registry**: it publishes one
  prerelease under `--tag next`, exercising authentication, provenance
  generation, and the registry's provenance validation for real.
- **FR-5** — The rehearsal must never write the `latest` dist-tag, and must
  never publish a version that a real release would later want.
- **FR-6** — No existing release contract regresses: the version/tag agreement
  contract, the package/tarball contract, the publish-argument guard from #134,
  and the step-ordering guard all still hold.

## Out of scope

- Retagging `v0.1.2`, `v0.1.3`, `v0.1.4`.
- The pointer notes on those three release pages (orchestrator-owned, and
  deliberately written only once an artifact-carrying release exists).

## Success criteria

- **SC-1** — `./gate.sh` green.
- **SC-2** — The seeded controls (missing and mismatched `repository.url`) both
  turn the new check red; removing the seed returns it green.
- **SC-3** — The rehearsal runs against the real registry and the prerelease is
  visible under the `next` dist-tag, with `latest` untouched.
- **SC-4** — The following release publishes: package on the registry at the
  released version, and `*.tgz` + `SHA256SUMS` attached to the release.
  (Orchestrator-owned; not provable inside this PR.)

## What provenance requires — checked once, not per failure

- `repository.url` present and matching the building repository.
- The comparison is **case-sensitive**: npm/cli#8036 records a real failure
  where provenance carried `FrontEndDev-org` while the normalized package URL
  carried `frontenddev-org`. Our slug is entirely lowercase so we are not
  exposed — but the guard should compare properly rather than assume.
- `repository.directory` applies only to monorepo sub-packages. Not applicable.
- Already satisfied by the publish job: `--access public`, `id-token: write`,
  a GitHub-hosted runner, npm ≥ 9.5.

References: https://github.com/npm/cli/issues/8036 ·
https://docs.npmjs.com/generating-provenance-statements/

## Measured evidence

At `v0.1.4` (https://github.com/lambdasistemi/cardano-swiss-knife/actions/runs/30462056696),
with the token present and the #134 path fix in place, npm read the tarball
(`@lambdasistemi/cardano-swiss-knife@0.1.4`, 9.0 MB, shasum computed), reached
the registry, and received:

```
npm error code E422
npm error 422 Unprocessable Entity - PUT https://registry.npmjs.org/@lambdasistemi%2fcardano-swiss-knife
  Error verifying sigstore provenance bundle: Failed to validate repository information:
  package.json: "repository.url" is "", expected to match
  "https://github.com/lambdasistemi/cardano-swiss-knife" from provenance
```

Repository state: `require('./package.json').repository` → `null`.
