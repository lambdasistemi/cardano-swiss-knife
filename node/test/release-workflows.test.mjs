import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)), "..");
const checker = join(repoRoot, "scripts", "check-release-workflows.mjs");
const justfile = join(repoRoot, "justfile");
const releaseYml = join(repoRoot, ".github", "workflows", "release.yml");
const ciYml = join(repoRoot, ".github", "workflows", "ci.yml");
const pagesYml = join(repoRoot, ".github", "workflows", "pages.yml");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
};

const runChecker = (root = repoRoot) =>
  run(process.execPath, [checker, "--repo-root", root], { cwd: root });

/** Minimal "good" fixtures used only as mutation bases for negative cases. */
const goodReleaseYaml = (opts = {}) => {
  const {
    omitVersionCheck = false,
    omitTagCheckout = false,
    reverseBuildPublish = false,
    omitPublish = false,
    omitChecksums = false,
    selfHostedPublish = false,
    proofsAfterPublish = false,
    unrelatedUpload = false,
    omitNixSetup = false,
    broadGlobalPermissions = false,
    omitPublishOidc = false,
    unscopedAppTokens = false,
  } = opts;

  const runsOn = selfHostedPublish ? "nixos" : "ubuntu-latest";

  const checkout = omitTagCheckout
    ? `      - uses: actions/checkout@v4\n`
    : `      - uses: actions/checkout@v4
        with:
          ref: \${{ needs.release-please.outputs.tag_name }}
`;

  const nixSetup = omitNixSetup
    ? `      - uses: cachix/cachix-action@v15
        with:
          name: paolino
          authToken: \${{ secrets.CACHIX_AUTH_TOKEN }}
`
    : `      - uses: paolino/dev-assets/setup-nix@v0.0.1
        with:
          cachix-auth-token: \${{ secrets.CACHIX_AUTH_TOKEN }}
`;

  const versionCheck = omitVersionCheck
    ? ""
    : `      - name: Verify tag matches package.json
        run: node scripts/check-release-version.mjs --tag "\${{ needs.release-please.outputs.tag_name }}"
`;

  const build = `      - name: Build release artifacts
        run: |
          nix build .#node-package --out-link node-package
          nix build .#csk --out-link csk
          nix build .#release-bundle --out-link release-bundle
`;

  const packageProof = `      - name: Package proof
        run: node scripts/check-release-package.mjs --node-package node-package --csk csk --release-bundle release-bundle
`;

  const finalVersionProof = omitVersionCheck
    ? ""
    : `      - name: Final version proof
        run: node scripts/check-release-version.mjs --tag "\${{ needs.release-please.outputs.tag_name }}" --node-package node-package --csk csk --release-bundle release-bundle
`;

  const npmPublish = omitPublish
    ? ""
    : `      - name: Publish npm
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
        run: npm publish --access public --provenance node-package/*.tgz
`;

  let upload = "";
  if (!omitPublish || !omitChecksums) {
    if (unrelatedUpload) {
      upload = `      - name: Upload release assets
        env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
        run: gh release upload "\${{ needs.release-please.outputs.tag_name }}" README.md --clobber
`;
    } else if (omitChecksums) {
      upload = `      - name: Upload release assets
        env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
        run: gh release upload "\${{ needs.release-please.outputs.tag_name }}" node-package/*.tgz --clobber
`;
    } else {
      upload = `      - name: Upload release assets
        env:
          GH_TOKEN: \${{ steps.app-token.outputs.token }}
        run: gh release upload "\${{ needs.release-please.outputs.tag_name }}" release-bundle/*.tgz release-bundle/SHA256SUMS --clobber
`;
    }
  }

  const proofs = `${packageProof}${finalVersionProof}`;
  let ordered;
  if (proofsAfterPublish) {
    // Build still first, but package/version proofs moved after npm publish.
    ordered = `${build}${npmPublish}${proofs}${upload}`;
  } else if (reverseBuildPublish) {
    ordered = `${npmPublish}${upload}${build}${proofs}`;
  } else {
    ordered = `${build}${proofs}${npmPublish}${upload}`;
  }

  const topPermissions = broadGlobalPermissions
    ? `permissions:
  contents: write
  pull-requests: write
  id-token: write
`
    : `permissions:
  contents: read
`;

  const rpJobPermissions = broadGlobalPermissions
    ? ""
    : `    permissions:
      contents: read
`;

  const publishJobPermissions = omitPublishOidc
    ? `    permissions:
      contents: read
`
    : broadGlobalPermissions
      ? ""
      : `    permissions:
      contents: read
      id-token: write
`;

  const rpTokenWith = unscopedAppTokens
    ? `          app-id: \${{ vars.CI_APP_ID }}
          private-key: \${{ secrets.CI_APP_PRIVATE_KEY }}
          owner: lambdasistemi
`
    : `          app-id: \${{ vars.CI_APP_ID }}
          private-key: \${{ secrets.CI_APP_PRIVATE_KEY }}
          owner: lambdasistemi
          permission-contents: write
          permission-pull-requests: write
`;

  const publishTokenWith = unscopedAppTokens
    ? `          app-id: \${{ vars.CI_APP_ID }}
          private-key: \${{ secrets.CI_APP_PRIVATE_KEY }}
          owner: lambdasistemi
`
    : `          app-id: \${{ vars.CI_APP_ID }}
          private-key: \${{ secrets.CI_APP_PRIVATE_KEY }}
          owner: lambdasistemi
          permission-contents: write
`;

  return `name: Release
on:
  push:
    branches: [main]
  workflow_dispatch:
${topPermissions}jobs:
  release-please:
    runs-on: nixos
${rpJobPermissions}    outputs:
      release_created: \${{ steps.release.outputs.release_created }}
      tag_name: \${{ steps.release.outputs.tag_name }}
    steps:
      - uses: actions/create-github-app-token@v1
        id: app-token
        with:
${rpTokenWith}      - uses: googleapis/release-please-action@v4
        id: release
        with:
          token: \${{ steps.app-token.outputs.token }}
  publish:
    needs: release-please
    if: \${{ needs.release-please.outputs.release_created == 'true' }}
    runs-on: ${runsOn}
${publishJobPermissions}    steps:
      - uses: actions/create-github-app-token@v1
        id: app-token
        with:
${publishTokenWith}${checkout}      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
${nixSetup}${versionCheck}${ordered}`;
};

const goodCiYaml = (opts = {}) => {
  const { hardCodedTarball = false, incompleteMatrix = false } = opts;
  if (incompleteMatrix) {
    return `name: CI
on: [push]
jobs:
  node-package-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: |
          shopt -s nullglob
          tarballs=(node-package/*.tgz)
          if [ \${#tarballs[@]} -ne 1 ]; then
            echo "expected exactly one .tgz" >&2
            exit 1
          fi
          export CSK_PACKAGE_TARBALL="\${tarballs[0]}"
          npm run test:package
`;
  }
  if (hardCodedTarball) {
    return `name: CI
on: [push]
jobs:
  node-package-smoke:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Smoke
        env:
          CSK_PACKAGE_TARBALL: \${{ github.workspace }}/node-package/lambdasistemi-cardano-swiss-knife-0.1.1.tgz
        run: npm run test:package
`;
  }
  return `name: CI
on: [push]
jobs:
  node-package-smoke:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Smoke packed Node artifact
        shell: bash
        run: |
          shopt -s nullglob
          tarballs=(node-package/*.tgz)
          if [ \${#tarballs[@]} -ne 1 ]; then
            echo "expected exactly one .tgz, found \${#tarballs[@]}" >&2
            exit 1
          fi
          export CSK_PACKAGE_TARBALL="\${{ github.workspace }}/\${tarballs[0]}"
          npm run test:package
`;
};

const goodPagesYaml = (opts = {}) => {
  const {
    omitTagCheck = false,
    omitDispatchTagInput = false,
    bareRefNameOnly = false,
  } = opts;

  const dispatchBlock = omitDispatchTagInput
    ? `  workflow_dispatch:\n`
    : `  workflow_dispatch:
    inputs:
      tag:
        description: "Release tag to publish"
        required: true
        type: string
`;

  if (bareRefNameOnly) {
    return `name: Pages
on:
  push:
    tags: ["v*"]
${dispatchBlock}jobs:
  build:
    runs-on: nixos
    steps:
      - uses: actions/checkout@v4
      - name: Verify tag matches package.json
        run: node scripts/check-release-version.mjs --tag "\${{ github.ref_name }}"
      - run: nix build .#combined-site
  deploy:
    needs: build
    runs-on: nixos
    steps:
      - uses: actions/deploy-pages@v4
`;
  }

  const tagCheck = omitTagCheck
    ? ""
    : `      - name: Verify tag matches package.json
        run: node scripts/check-release-version.mjs --tag "\${{ steps.release-tag.outputs.tag }}"
`;

  return `name: Pages
on:
  push:
    tags: ["v*"]
${dispatchBlock}jobs:
  build:
    runs-on: nixos
    steps:
      - name: Resolve release tag
        id: release-tag
        run: |
          set -euo pipefail
          if [ "\${{ github.event_name }}" = "workflow_dispatch" ]; then
            TAG="\${{ inputs.tag }}"
          else
            TAG="\${{ github.ref_name }}"
          fi
          case "\$TAG" in
            v*) ;;
            *)
              echo "pages publish requires a v* release tag; got: \$TAG" >&2
              exit 1
              ;;
          esac
          echo "tag=\$TAG" >> "\$GITHUB_OUTPUT"
      - name: Checkout release tag
        uses: actions/checkout@v4
        with:
          ref: \${{ steps.release-tag.outputs.tag }}
${tagCheck}      - run: nix build .#combined-site
  deploy:
    needs: build
    runs-on: nixos
    steps:
      - uses: actions/deploy-pages@v4
`;
};

const withGoodTree = (mutate) => {
  const root = mkdtempSync(join(tmpdir(), "csk-release-workflows-"));
  const paths = {
    releasePath: join(root, ".github", "workflows", "release.yml"),
    ciPath: join(root, ".github", "workflows", "ci.yml"),
    pagesPath: join(root, ".github", "workflows", "pages.yml"),
  };
  for (const path of Object.values(paths)) {
    mkdirSync(dirname(path), { recursive: true });
  }
  writeFileSync(paths.releasePath, goodReleaseYaml());
  writeFileSync(paths.ciPath, goodCiYaml());
  writeFileSync(paths.pagesPath, goodPagesYaml());
  mutate({
    root,
    ...paths,
    write: (path, text) => writeFileSync(path, text),
  });
  return root;
};

test("release-workflows checker and just recipe exist", () => {
  assert.ok(existsSync(checker), "scripts/check-release-workflows.mjs is missing");
  assert.ok(existsSync(justfile), "justfile is missing");
  assert.ok(existsSync(releaseYml), "release.yml is missing");
  assert.ok(existsSync(ciYml), "ci.yml is missing");
  assert.ok(existsSync(pagesYml), "pages.yml is missing");
  const justText = readFileSync(justfile, "utf8");
  assert.match(
    justText,
    /^release-workflows:/m,
    "justfile must define release-workflows",
  );
  assert.match(
    justText,
    /^ci:.*\brelease-workflows\b/m,
    "just ci must depend on release-workflows",
  );
  assert.match(justText, /^ci:.*\brelease-gates\b/m);
  assert.match(justText, /^ci:.*\brelease-package\b/m);
  assert.match(justText, /^ci:.*\brelease-version\b/m);
  // Recipe must run tests before the standalone checker so TAP counts appear.
  const recipe = justText.match(/^release-workflows:\n((?:[ \t]+.+\n)*)/m);
  assert.ok(recipe, "release-workflows recipe body missing");
  const body = recipe[1];
  const testPos = body.indexOf("node --test");
  const checkerPos = body.indexOf("check-release-workflows.mjs");
  assert.ok(testPos >= 0, "release-workflows must run node --test");
  assert.ok(checkerPos >= 0, "release-workflows must run the checker");
  assert.ok(
    testPos < checkerPos,
    "release-workflows must run tests before the checker (literal TAP counts)",
  );
});

test("checker passes on the real workflow tree", () => {
  const { status, output } = runChecker(repoRoot);
  assert.equal(status, 0, `checker failed on the real tree:\n${output}`);
});

test("checker passes on the good fixture tree", () => {
  const root = withGoodTree(() => {});
  const { status, output } = runChecker(root);
  assert.equal(status, 0, `checker failed on good fixtures:\n${output}`);
});

test("negative: missing release_created gating fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(
      releasePath,
      `name: Release
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  release-please:
    runs-on: nixos
    steps:
      - uses: actions/create-github-app-token@v1
        id: app-token
        with:
          app-id: \${{ vars.CI_APP_ID }}
          private-key: \${{ secrets.CI_APP_PRIVATE_KEY }}
          owner: lambdasistemi
      - uses: googleapis/release-please-action@v4
        with:
          token: \${{ steps.app-token.outputs.token }}
`,
    );
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted a workflow without release_created gating");
  assert.match(output, /release_created/i);
});

test("negative: missing version validation fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ omitVersionCheck: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted missing version validation");
  assert.match(output, /version|tag|package\.json|check-release-version/i);
});

test("negative: missing exact-tag checkout fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ omitTagCheckout: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted missing exact-tag checkout");
  assert.match(output, /tag_name|checkout|ref/i);
});

test("negative: publish-before-build ordering fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ reverseBuildPublish: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted publish-before-build ordering");
  assert.match(output, /before|order|build/i);
});

test("negative: proofs moved after publish fail", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ proofsAfterPublish: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted package/version proofs after external publish",
  );
  assert.match(output, /before any external|check-release-package|check-release-version/i);
});

test("negative: missing npm or GitHub publication fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ omitPublish: true, omitChecksums: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted missing npm/GitHub publication");
  assert.match(output, /npm publish|gh release|publish/i);
});

test("negative: missing checksum artifacts fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ omitChecksums: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted missing checksum artifacts");
  assert.match(output, /SHA256SUMS|checksum|release-bundle/i);
});

test("negative: unrelated GitHub upload assets fail", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ unrelatedUpload: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted GitHub upload of unrelated assets",
  );
  assert.match(output, /release-bundle|SHA256SUMS|unrelated/i);
});

test("negative: self-hosted publish runner fails provenance contract", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ selfHostedPublish: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted self-hosted/nixos publish runner (npm provenance)",
  );
  assert.match(output, /GitHub-hosted|provenance|ubuntu/i);
});

test("negative: missing hosted Nix setup fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ omitNixSetup: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted publish without explicit Nix install on hosted runner",
  );
  assert.match(output, /Nix|setup-nix|install-nix/i);
});

test("negative: Node 22 three-OS matrix gaps fail", () => {
  const root = withGoodTree(({ ciPath, write }) => {
    write(ciPath, goodCiYaml({ incompleteMatrix: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted incomplete OS/Node matrix");
  assert.match(output, /macos-latest|windows-latest|Node 22|node-version/i);
});

test("negative: hard-coded tarball version fails", () => {
  const root = withGoodTree(({ ciPath, write }) => {
    write(ciPath, goodCiYaml({ hardCodedTarball: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted a hard-coded tarball version");
  assert.match(output, /hard-code|0\.1\.1\.tgz|versioned tarball/i);
});

test("negative: pages missing tag/package agreement fails", () => {
  const root = withGoodTree(({ pagesPath, write }) => {
    write(pagesPath, goodPagesYaml({ omitTagCheck: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(status, 0, "checker accepted pages without tag/package agreement");
  assert.match(output, /tag|package\.json|version|check-release-version/i);
});

test("negative: pages dispatch without tag input fails", () => {
  const root = withGoodTree(({ pagesPath, write }) => {
    write(pagesPath, goodPagesYaml({ omitDispatchTagInput: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted pages workflow_dispatch without required tag input",
  );
  assert.match(output, /tag input|workflow_dispatch|dispatch/i);
});

test("negative: pages bare github.ref_name path fails", () => {
  const root = withGoodTree(({ pagesPath, write }) => {
    write(pagesPath, goodPagesYaml({ bareRefNameOnly: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted pages using only github.ref_name (unusable/stale on dispatch)",
  );
  assert.match(output, /ref_name|tag input|dispatch|resolved release tag|inputs\.tag/i);
});

test("negative: broad workflow-global write/OIDC permissions fail", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ broadGlobalPermissions: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted broad workflow-global contents/pull-requests/id-token write",
  );
  assert.match(output, /workflow-global|contents: write|id-token: write|pull-requests: write/i);
});

test("negative: publish job missing id-token OIDC fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ omitPublishOidc: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted publish without job-level id-token: write",
  );
  assert.match(output, /id-token|OIDC|provenance/i);
});

test("negative: unscoped App-token minting fails", () => {
  const root = withGoodTree(({ releasePath, write }) => {
    write(releasePath, goodReleaseYaml({ unscopedAppTokens: true }));
  });
  const { status, output } = runChecker(root);
  assert.notEqual(
    status,
    0,
    "checker accepted unscoped create-github-app-token mint (full installation access)",
  );
  assert.match(output, /permission-|unscoped|App-token|scope/i);
});
