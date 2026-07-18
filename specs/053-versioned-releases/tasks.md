# Tasks — Versioned releases for the workbench SPA (#53)

## Slice A — release-please pipeline

- [X] T531-SA `release-please-config.json` (node, bump-minor-pre-major,
      bump-patch-for-minor-pre-major, bootstrap-sha=13100d8) +
      `.release-please-manifest.json` `{".": "0.0.0"}` exist and are valid JSON
- [X] T532-SA `package.json` carries `"version": "0.0.0"`
- [X] T533-SA `.github/workflows/release.yml` runs release-please-action@v4 on
      `push: main` + `workflow_dispatch`, token minted from
      `vars.CI_APP_ID`/`secrets.CI_APP_PRIVATE_KEY`; actionlint + YAML parse green
- [X] T534-SA `./gate.sh` green; commit `feat: add release-please pipeline`

## Slice B — release-gated Pages deploy + docs

- [X] T535-SB `pages.yml` triggers are exactly `push: tags: ["v*"]` +
      `workflow_dispatch`; no `push: branches` trigger remains; actionlint green
- [X] T536-SB mkdocs "Releasing" page documents: merge release PR → tag →
      Pages deploy from tag; manual dispatch fallback; how to verify what is live
- [X] T537-SB `./gate.sh` green (incl. mkdocs build); commit
      `feat: deploy pages from release tags`

## Slice C — footer version + title rebrand + UX check

- [X] T538-SC footer renders the embedded version; dev builds show a dev label;
      nix build substitutes the real `package.json` version
- [X] T539-SC `<title>` reads "Cardano Swiss Knife" in the served shell
- [X] T540-SC UX spec asserts footer version == `package.json` version and
      `document.title` == "Cardano Swiss Knife"
- [X] T541-SC `./gate.sh` green; commit `feat: surface the released version in the footer`
