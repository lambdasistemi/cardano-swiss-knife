# Releasing

## Overview

The model, in five steps:

1. Merges to `main` accumulate as unreleased changes.
2. The Release workflow keeps a release PR up to date via release-please.
3. Merging the release PR tags the commit `vX.Y.Z` and publishes a GitHub
   release.
4. The tag push triggers the Pages workflow, which builds and deploys from
   the tagged tree.
5. The footer of the live site states the version it was built from.

## Pipeline anatomy

`release-please-config.json` drives the whole thing:

- `release-type: node` — the version of record lives in `package.json`.
- `bump-minor-pre-major` + `bump-patch-for-minor-pre-major` — pre-1.0
  semantics: a `feat:` bumps the minor digit, a `fix:` bumps the patch
  digit, and nothing bumps major while the version starts with `0.`.
- `include-component-in-tag: false` — tags are plain `vX.Y.Z`, not
  `component-vX.Y.Z` (this repo has one package).
- `changelog-sections` — an explicit list controlling which commit types
  get their own changelog heading, including `docs` under "Documentation"
  (see [Docs releases](#docs-releases) below for what that does and does
  not trigger).
- `bootstrap-sha` — the commit release-please treats as the start of
  history. Without it, the first release PR would trawl the entire
  pre-versioning commit history looking for conventional-commit types.

`.release-please-manifest.json` is the authoritative record of the last
version actually released — release-please diffs commits against this, not
against git tags, to decide what the next version should be.

## The App token

The release PR is authored with a GitHub App token, not the default
`GITHUB_TOKEN`. This matters for one reason: workflows do not run on pull
requests or tag pushes created by `GITHUB_TOKEN`. A release PR opened with
the default token would sit with zero checks and could never merge under
required-checks branch protection — and a tag pushed with it would never
trigger the Pages workflow at all.

The mint step in `release.yml`:

```yaml
- uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ vars.CI_APP_ID }}
    private-key: ${{ secrets.CI_APP_PRIVATE_KEY }}
    owner: lambdasistemi
```

The App (`vars.CI_APP_ID` / `secrets.CI_APP_PRIVATE_KEY`) is installed with
`visibility: all repos` under the `lambdasistemi` org, so the same
credentials work across every repo using this pattern. The side effect that
makes the whole pipeline work: tags and releases created with an App token
*do* fire `push: tags` workflows, unlike ones created with `GITHUB_TOKEN`.
That's what lets the Pages workflow react to the tag release-please pushes.

## Workflow tour

- **`release.yml`** — triggers on `push: main` and `workflow_dispatch`.
  Mints the App token, then runs `googleapis/release-please-action@v4`.
  Sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`, required for
  JS-based actions to run on the self-hosted `nixos` runners.
- **`pages.yml`** — triggers on `push: tags: v*` and `workflow_dispatch`.
  Builds the combined app bundle (`nix build .#combined-site`) and the
  MkDocs site, assembles them into one static tree, and deploys to the
  `github-pages` environment.
- **`ci.yml`** — runs on every PR and on `push: main`, including the
  App-token-authored release PR itself (which is exactly why the App
  token is required — a `GITHUB_TOKEN`-authored PR would never get these
  checks in the first place).

## Version stamping internals

The footer version is not read at runtime from anywhere — it's baked into
the JS bundle at build time:

- `docs/inspector/src/Version.js` is a foreign-function import exporting a
  single placeholder: `export const versionTag = "__CSK_VERSION__";`.
- `Version.purs` renders it: if the tag still starts with `__` (the
  placeholder, unsubstituted), the footer shows `dev`; otherwise it shows
  `v<tag>`.
- The placeholder literal `__CSK_VERSION__` must appear **exactly once** in
  the source tree. The build-time `sed` is a blind string replace — a
  second occurrence would get rewritten too, silently breaking dev
  detection.
- `nix/wasm-ui.nix` reads the version from `package.json` at Nix eval time,
  builds the bundle, then runs
  `sed -i "s/__CSK_VERSION__/${version}/g" dist/index.js` right after the
  deps+app concatenation and before the install phase copies files out.

A dev build (`nix develop`, a local `spago bundle`, anything that isn't the
packaged Nix derivation with a stamped version) never runs that `sed`, so
its bundle keeps the placeholder and the footer shows `dev`.

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

## Operations runbook

### Cutting a release

Merge the release PR. In order, this:

1. Tags the resulting commit `vX.Y.Z`.
2. Creates a GitHub release.
3. Updates `CHANGELOG.md`.
4. The tag push triggers the Pages workflow, which builds and deploys from
   the tagged tree — never from an untagged commit on `main`.

### First-release pinning

release-please defaults a tag-less repository's first release to `1.0.0`,
regardless of `bump-minor-pre-major`/`bump-patch-for-minor-pre-major` — those
flags only govern bumps *after* there's a prior version to bump from. The
fix is a `Release-As: x.y.z` commit footer on `main`; this repo used exactly
that to pin the first release to `0.1.0`.

### Emergency redeploy

If Pages needs to be rebuilt without cutting a release (a hotfix to the
deploy pipeline itself, a stuck build), run the Pages workflow manually via
`workflow_dispatch`. It deploys whichever ref you select without tagging or
creating a release. Use this sparingly — it is the only path in this
pipeline that can put an untagged build live.

### Required repository settings

The `github-pages` environment must allow deployments from `v*` tags
(Settings → Environments → github-pages → deployment branch and tag rules).
Without that rule the tag-triggered deploy job is rejected by environment
protection before any step runs — the build job succeeds and the deploy job
fails with no failed steps.

## Troubleshooting

Signatures from real incidents in this repo:

- **Build job green, deploy job fails with no failed steps** — environment
  protection rejected the ref. Add the `v*` tag rule to the `github-pages`
  environment. The `v0.1.0` deploy hit exactly this.
- **First release PR proposes `1.0.0`** — tag-less repositories default
  there regardless of pre-major flags. Add a `Release-As: x.y.z` commit
  footer.
- **`Module X was not found` in the Nix build, for a file that exists on
  disk** — the file is not git-tracked. Flakes only see tracked files;
  `git add` it.
- **Docs merged but not live** — docs are release-gated. See
  [Docs releases](#docs-releases).

## Verification

Compare the version shown in the live footer against
[the latest release](https://github.com/lambdasistemi/cardano-swiss-knife/releases/latest).
They should always match.
