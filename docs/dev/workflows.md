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

## `surge.sh` PR previews

Pull requests can publish a disposable preview to:

```text
https://lambdasistemi-cardano-swiss-knife-pr-<PR_NUMBER>.surge.sh
```

The preview workflow:

1. builds the app bundle
2. builds the MkDocs site
3. assembles one writable static tree
4. deploys it to `surge.sh`
5. upserts the preview URL as a PR comment

### Required secret

The workflow needs the repository secret `SURGE_TOKEN`.

Generate it locally with:

```bash
nix shell nixpkgs#nodePackages.surge -c surge token
gh secret set SURGE_TOKEN --repo lambdasistemi/cardano-swiss-knife --body "<token>"
```

### URL convention

Preview URLs are derived from the PR number, not the branch name. That keeps them stable across force-pushes and avoids problems with slashes in branch names.
