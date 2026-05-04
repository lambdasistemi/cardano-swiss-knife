# Nix Layout

This directory contains the flake-owned build, check, and CI wiring for
`cardano-addresses-browser`.

The design has three goals:

- keep `flake.nix` thin
- make `nix flake check` authoritative
- keep GitHub Actions readable by running thin `nix run .#...` apps per step

## High-Level Flow

The flake wires the Nix modules in this order:

1. `nix/project.nix`
   Builds the Haskell vector generator with `haskell.nix`.
2. `nix/purescript.nix`
   Builds the PureScript library, app, tests, and bundled web distribution.
3. `nix/packages/default.nix`
   Exposes user-facing flake packages such as `web-dist`.
4. `nix/checks/default.nix`
   Defines the derivation-backed flake checks.
5. `nix/apps/default.nix`
   Exposes thin runnable apps used by CI for streamed logs.

In practice:

- `nix flake check` runs the derivations from `nix/checks`
- GitHub CI runs `nix run .#ci-*`
- each `ci-*` app is just a wrapper that builds one flake check
- GitHub Pages builds `.#web-dist`

## Module Map

### `project.nix`

Haskell project definition.

Responsibilities:

- pins the Haskell package set via `indexState`
- builds the vector generator executable
- provides the Haskell dev shell inputs

Main consumer:

- `flake.nix` uses it to create `packages.test-vectors-exe`
- `flake.nix` also derives `packages.test-vectors`

### `purescript.nix`

PureScript and JS bridge layer.

Responsibilities:

- defines the Node runtime used in Nix builds
- constructs the npm dependency closures needed by PureScript FFI
- defines the PureScript derivations:
  - `lib-build`
  - `app-build`
  - `test-build`
  - `web-dist`

Important design choice:

- Nix provides the toolchain binaries:
  - `purs`
  - `spago`
  - `esbuild`
  - `purs-tidy`
- npm only provides JS libraries actually imported at runtime

This is why `purescript.nix` builds two npm roots:

- `nodeModules`
  runtime JS dependencies only
- `playwrightNodeModules`
  a tiny Playwright-only npm closure for browser tests

This avoids npm trying to install tool packages like `purescript` inside the
sandbox.

### `packages/default.nix`

Small export layer for flake packages.

Current exported package:

- `web-dist`

It also forwards Haskell vector outputs from the Haskell project so `flake.nix`
can expose them cleanly.

### `checks/default.nix`

Authoritative flake checks.

Current checks:

- `format`
- `haskell-quality`
- `vectors`
- `lib-build`
- `app-build`
- `test`
- `playwright`

These are the checks that matter for:

- `nix flake check`
- correctness of CI wrappers

The individual files under `nix/checks/` are small and task-specific:

- `format.nix`
  runs PureScript formatting checks
- `haskell-quality.nix`
  runs `fourmolu`, `hlint`, and `cabal check`
- `vectors.nix`
  diffs committed vectors against generated vectors
- `lib-build.nix`
  builds the PureScript library
- `app-build.nix`
  builds the PureScript app
- `test.nix`
  runs PureScript tests
- `playwright.nix`
  runs browser UI tests against the built static app

### `apps/default.nix`

Thin CI-facing wrappers.

Current apps:

- `ci-check`
- `ci-haskell-quality`
- `ci-check-vectors`
- `ci-build`
- `ci-test`
- `ci-playwright`

These do not define the logic themselves.
They call `nix build .#checks.<system>.<name>`.

That gives us:

- streamed logs in GitHub Actions
- one place of truth in `checks`

### `apps/lib.nix`

Shared helper for app wrappers.

Right now it exports `mkCheckApp`, which builds a flake app that just runs:

```sh
nix build ".#checks.${system}.${checkName}"
```

This keeps the app layer deliberately dumb.

## CI and Pages

### CI

Workflow file:

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

Behavior:

- runs on `nixos`
- configures Cachix
- runs each flake app with `nix run`

Why `nix run` here instead of `nix flake check`:

- better log streaming in GitHub Actions
- clearer failure localization per step

Why still keep `checks`:

- `nix flake check` remains the repo contract
- local and CI behavior stay aligned

### Pages

Workflow file:

- [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)

Behavior:

- builds `.#web-dist`
- uploads the resulting static directory
- deploys that artifact to GitHub Pages

This means Pages no longer depends on `nix develop` or ad hoc shell commands.

## Why This Is Still a Hybrid

This repository still mixes:

- Haskell dependency resolution
- PureScript dependency resolution
- npm dependency resolution

That is intentional.

The cleaner boundary is:

- Haskell packages and tools from `haskell.nix`
- PureScript packages from `spago.lock`
- browser/runtime JS libraries from `package-lock.json`
- build orchestration and CI contracts from Nix

What we explicitly do **not** do anymore:

- install `purescript` from npm inside sandboxed derivations
- install `spago` from npm inside sandboxed derivations
- use GitHub Actions YAML as the source of build logic

## Local Commands

Useful commands when working on this layer:

```sh
nix flake check --print-build-logs
nix build .#web-dist --print-build-logs
nix run .#ci-check
nix run .#ci-test
nix run .#ci-playwright
```

## Possible Future Cleanup

One further cleanup is possible if we want less duplication between apps and
checks:

- introduce `nix/steps/`
- define each step once as an executable
- let both `checks` and `apps` consume the same executable

That is not necessary for correctness today, but it is the next natural
refactor if we want a stricter internal model.
