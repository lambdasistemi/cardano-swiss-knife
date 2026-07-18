# Developer Workflows

## Local development

```bash
nix develop
npm install
just build
just bundle
just build-docs
just assemble-site
just test
```

Local browser testing needs both WASM artifacts available under `dist/wasm/`. The Nix `web-dist` package assembles them automatically.

`just assemble-site` produces a writable `site-root/` directory with the app at `/` and the MkDocs manual under `/docs/`.

## CI shape

The main CI workflow validates:

- formatting
- Haskell quality gates
- test vectors
- PureScript build
- MkDocs strict build
- PureScript tests
- Playwright browser tests

## GitHub Pages

The Pages workflow deploys the combined static artifact from `main`:

- the unified MD3 app at canonical root routes and `/inspector/` compatibility routes
- documentation at `/docs/`

## Shared PR previews

Pull requests can publish a disposable preview to:

```text
https://preview.dev.plutimus.com/lambdasistemi/cardano-swiss-knife/pr-<PR_NUMBER>/
```

The preview workflow:

1. builds the unified MD3 app with the canonical Nix `web-dist` package
2. builds the MkDocs site
3. assembles one writable static tree
4. calls `paolino/dev-assets/static-preview` to copy it into `/opt/services/previews/lambdasistemi/cardano-swiss-knife/pr-<PR_NUMBER>/`
5. upserts the preview URL as a PR comment

The preview host is served by the same `nixos` self-hosted runner machine, so
no external deploy secret is required.

### URL convention

Preview URLs are derived from the PR number, not the branch name. That keeps them stable across force-pushes and avoids problems with slashes in branch names.
