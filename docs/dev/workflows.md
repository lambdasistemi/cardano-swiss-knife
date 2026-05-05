# Developer Workflows

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

- app bundle at `/`
- documentation at `/docs/`

## Shared PR previews

Pull requests can publish a disposable preview to:

```text
https://preview.dev.plutimus.com/lambdasistemi/cardano-swiss-knife/pr-<PR_NUMBER>/
```

The preview workflow:

1. builds the app bundle
2. builds the MkDocs site
3. assembles one writable static tree
4. calls `paolino/dev-assets/static-preview` to copy it into `/opt/services/previews/lambdasistemi/cardano-swiss-knife/pr-<PR_NUMBER>/`
5. upserts the preview URL as a PR comment

The preview host is served by the same `nixos` self-hosted runner machine, so
no external deploy secret is required.

### URL convention

Preview URLs are derived from the PR number, not the branch name. That keeps them stable across force-pushes and avoids problems with slashes in branch names.
