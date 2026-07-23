import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)), "..");
const checker = join(repoRoot, "scripts", "check-release-version.mjs");
const justfile = join(repoRoot, "justfile");
const packageJsonPath = join(repoRoot, "package.json");
const versionModulePath = join(repoRoot, "node", "src", "version.js");
const cliPath = join(repoRoot, "cli", "csk.mjs");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const expectedVersion = packageJson.version;
const expectedTag = `v${expectedVersion}`;
const expectedTarball = `${packageJson.name.replace(/^@/, "").replace(/\//g, "-")}-${expectedVersion}.tgz`;
const mutatedVersion = "9.9.9";
assert.notEqual(mutatedVersion, expectedVersion);

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

const runChecker = (args = []) =>
  run(process.execPath, [checker, ...args], { cwd: repoRoot });

const buildAttr = (attr) => {
  const outLink = mkdtempSync(join(tmpdir(), `csk-version-build-${attr}-`));
  rmSync(outLink, { recursive: true, force: true });
  const result = run("nix", ["build", `.#${attr}`, "-o", outLink]);
  return { status: result.status, output: result.output, outLink };
};

const copyWritable = (from, to) => {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, readFileSync(from));
};

const copyWritableTree = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) copyWritableTree(src, dest);
    else copyWritable(src, dest);
  }
};

// Minimal mutable tree the checker reads for source-level authority checks.
const withSourceTree = (mutate) => {
  const root = mkdtempSync(join(tmpdir(), "csk-version-src-"));
  for (const rel of [
    "package.json",
    "package-lock.json",
    "node/src/version.js",
    "node/src/index.js",
    "node/src/index.d.ts",
    "cli/csk.mjs",
    "nix/purescript.nix",
    "nix/wasm-ui.nix",
  ]) {
    const from = join(repoRoot, rel);
    if (!existsSync(from)) continue;
    const to = join(root, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
  mutate(root);
  return root;
};

const extractTarball = (tarballPath) => {
  const scratch = mkdtempSync(join(tmpdir(), "csk-version-extract-"));
  const unpack = run("tar", ["-xzf", tarballPath, "-C", scratch]);
  assert.equal(unpack.status, 0, `tar extract failed:\n${unpack.output}`);
  const packageRoot = join(scratch, "package");
  assert.ok(existsSync(packageRoot), "tarball missing package/ root");
  return { scratch, packageRoot };
};

const publicEntrypoint = (packageRoot) => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const exportEntry = pkg.exports?.["."];
  const relative =
    typeof exportEntry === "string"
      ? exportEntry
      : exportEntry?.import ?? "./node/dist/index.js";
  return join(packageRoot, relative);
};

test("release-version checker and just recipe exist", () => {
  assert.ok(existsSync(checker), "scripts/check-release-version.mjs is missing");
  assert.ok(existsSync(justfile), "justfile is missing");
  const justText = readFileSync(justfile, "utf8");
  assert.match(justText, /^release-version:/m, "justfile must define release-version");
  assert.match(
    justText,
    /^ci:.*\brelease-version\b/m,
    "just ci must depend on release-version",
  );
  assert.match(
    justText,
    /^ci:.*\brelease-package\b/m,
    "just ci must preserve release-package",
  );
});

test("package.json is the sole authored version and lock agrees", () => {
  assert.match(expectedVersion, /^\d+\.\d+\.\d+/);
  const lock = JSON.parse(readFileSync(join(repoRoot, "package-lock.json"), "utf8"));
  const lockVersion = lock.version ?? lock.packages?.[""]?.version;
  assert.equal(lockVersion, expectedVersion);
});

test("Node API exports package.json version without a second authority", async () => {
  assert.ok(existsSync(versionModulePath), "node/src/version.js is missing");
  const source = readFileSync(versionModulePath, "utf8");
  assert.match(source, /package\.json/);
  assert.doesNotMatch(source, /["'`]\d+\.\d+\.\d+/);

  const { version } = await import(versionModulePath);
  assert.equal(version, expectedVersion);

  // Public surface re-export (source index).
  const indexSource = readFileSync(join(repoRoot, "node", "src", "index.js"), "utf8");
  assert.match(indexSource, /version\.js/);
  const dts = readFileSync(join(repoRoot, "node", "src", "index.d.ts"), "utf8");
  assert.match(dts, /export\s+declare\s+const\s+version\s*:\s*string/);
});

test("packaged-source csk --version and -V print the package version", () => {
  assert.ok(existsSync(cliPath), "cli/csk.mjs is missing");
  const longForm = run(process.execPath, [cliPath, "--version"]);
  assert.equal(longForm.status, 0, `csk --version failed:\n${longForm.output}`);
  assert.equal(longForm.stdout.trim(), expectedVersion);

  const shortForm = run(process.execPath, [cliPath, "-V"]);
  assert.equal(shortForm.status, 0, `csk -V failed:\n${shortForm.output}`);
  assert.equal(shortForm.stdout.trim(), expectedVersion);
});

test("checker passes on the real tree with built artifacts", async () => {
  const nodePackage = buildAttr("node-package");
  assert.equal(nodePackage.status, 0, `node-package build failed:\n${nodePackage.output}`);
  const csk = buildAttr("csk");
  assert.equal(csk.status, 0, `packages.csk build failed:\n${csk.output}`);
  const bundle = buildAttr("release-bundle");
  assert.equal(bundle.status, 0, `release-bundle build failed:\n${bundle.output}`);
  const webUi = buildAttr("tx-inspector-ui");
  assert.equal(webUi.status, 0, `tx-inspector-ui build failed:\n${webUi.output}`);

  let extractScratch;
  try {
    const tarballs = readdirSync(nodePackage.outLink).filter((name) => name.endsWith(".tgz"));
    assert.equal(tarballs.length, 1);
    assert.equal(tarballs[0], expectedTarball, "npm tarball name must embed package version");

    // Extract the produced tarball and import its public Node entrypoint.
    const extracted = extractTarball(join(nodePackage.outLink, tarballs[0]));
    extractScratch = extracted.scratch;
    const entry = publicEntrypoint(extracted.packageRoot);
    assert.ok(existsSync(entry), `packaged public entrypoint missing: ${entry}`);
    const packagedApi = await import(pathToFileURL(entry).href);
    assert.ok(
      "version" in packagedApi,
      "packaged Node public entrypoint must export version",
    );
    assert.equal(
      packagedApi.version,
      expectedVersion,
      "packaged Node version must match package.json",
    );

    const bundleFiles = readdirSync(bundle.outLink);
    assert.ok(
      bundleFiles.includes(expectedTarball),
      `release-bundle must include ${expectedTarball}; have: ${bundleFiles.join(", ")}`,
    );

    const check = runChecker([
      "--repo-root",
      repoRoot,
      "--tag",
      expectedTag,
      "--node-package",
      nodePackage.outLink,
      "--csk",
      csk.outLink,
      "--release-bundle",
      bundle.outLink,
      "--web-ui",
      webUi.outLink,
    ]);
    assert.equal(check.status, 0, `checker failed on real artifacts:\n${check.output}`);
    assert.match(check.output, /ok: release-version check passed/);

    // Cross-host agreement: CLI, Node, WebUI stamp, Nix metadata, artifacts.
    const packagedVersion = run(join(csk.outLink, "bin", "csk"), ["--version"]);
    assert.equal(packagedVersion.status, 0, packagedVersion.output);
    assert.equal(packagedVersion.stdout.trim(), expectedVersion);

    const uiBundle = readFileSync(join(webUi.outLink, "index.js"), "utf8");
    assert.ok(
      uiBundle.includes(expectedVersion),
      "WebUI stamp must embed package.json version",
    );
    assert.ok(
      !uiBundle.includes("__CSK_VERSION__"),
      "WebUI must not leave the version placeholder unsubstituted",
    );

    const storeBase = realpathSync(webUi.outLink).replace(/\/+$/, "").split("/").pop();
    assert.match(
      storeBase,
      new RegExp(`-${expectedVersion.replace(/\./g, "\\.")}$`),
      `Nix UI derivation version must be ${expectedVersion}; store base=${storeBase}`,
    );
  } finally {
    if (extractScratch) rmSync(extractScratch, { recursive: true, force: true });
    rmSync(nodePackage.outLink, { recursive: true, force: true });
    rmSync(csk.outLink, { recursive: true, force: true });
    rmSync(bundle.outLink, { recursive: true, force: true });
    rmSync(webUi.outLink, { recursive: true, force: true });
  }
});

test("checker rejects a tag that is not exactly v${package.json version}", () => {
  const cases = [
    expectedVersion, // missing leading v
    `V${expectedVersion}`,
    `${expectedTag}-rc.1`,
    "v0.0.0",
    `v${expectedVersion}.0`,
    "release-1",
  ];
  for (const badTag of cases) {
    const check = runChecker(["--repo-root", repoRoot, "--tag", badTag]);
    assert.notEqual(
      check.status,
      0,
      `checker accepted non-exact tag ${JSON.stringify(badTag)}:\n${check.output}`,
    );
    assert.match(check.output, /tag/i);
  }
});

test("checker rejects mutated CLI, Node, WebUI, Nix, and artifact version evidence", () => {
  const nodePackage = buildAttr("node-package");
  assert.equal(nodePackage.status, 0, `node-package build failed:\n${nodePackage.output}`);
  const webUi = buildAttr("tx-inspector-ui");
  assert.equal(webUi.status, 0, `tx-inspector-ui build failed:\n${webUi.output}`);

  const temps = [];
  const track = (dir) => {
    temps.push(dir);
    return dir;
  };

  try {
    // --- CLI: real packaged-layout binary that prints a wrong version ---
    const cliScratch = track(mkdtempSync(join(tmpdir(), "csk-version-cli-")));
    const cliBinDir = join(cliScratch, "bin");
    mkdirSync(cliBinDir, { recursive: true });
    const fakeCsk = join(cliBinDir, "csk");
    writeFileSync(
      fakeCsk,
      `#!/usr/bin/env bash\nprintf '%s\\n' '${mutatedVersion}'\n`,
    );
    chmodSync(fakeCsk, 0o755);
    const cliMismatch = runChecker([
      "--repo-root",
      repoRoot,
      "--csk",
      cliScratch,
    ]);
    assert.notEqual(
      cliMismatch.status,
      0,
      `checker accepted mutated CLI version evidence:\n${cliMismatch.output}`,
    );
    assert.match(cliMismatch.output, /packaged csk|version/i);

    // --- Node: extract real tarball, inject wrong public version export ---
    const tarball = readdirSync(nodePackage.outLink).find((name) => name.endsWith(".tgz"));
    assert.ok(tarball, "node-package missing tarball");
    const extracted = extractTarball(join(nodePackage.outLink, tarball));
    track(extracted.scratch);
    const chmod = run("chmod", ["-R", "u+rwX", extracted.packageRoot]);
    assert.equal(chmod.status, 0, chmod.output);
    const entry = publicEntrypoint(extracted.packageRoot);
    const originalEntry = readFileSync(entry, "utf8");
    writeFileSync(entry, `${originalEntry}\nexport const version = "${mutatedVersion}";\n`);
    // Repack mutated package under a correctly named tarball so only the API is wrong.
    const nodeScratch = track(mkdtempSync(join(tmpdir(), "csk-version-node-")));
    const destPkg = join(nodeScratch, "node-package");
    mkdirSync(destPkg, { recursive: true });
    const repack = run("tar", [
      "-czf",
      join(destPkg, expectedTarball),
      "-C",
      extracted.scratch,
      "package",
    ]);
    assert.equal(repack.status, 0, repack.output);
    const nodeMismatch = runChecker([
      "--repo-root",
      repoRoot,
      "--node-package",
      destPkg,
    ]);
    assert.notEqual(
      nodeMismatch.status,
      0,
      `checker accepted mutated packaged Node version evidence:\n${nodeMismatch.output}`,
    );
    assert.match(nodeMismatch.output, /packaged Node|version/i);

    // --- WebUI: real bundle with stamped version rewritten ---
    const webScratch = track(mkdtempSync(join(tmpdir(), "csk-version-web-")));
    // Place under a store-shaped basename carrying the *expected* version so only
    // the WebUI stamp is wrong (Nix metadata still parseable/correct-shaped).
    const webUiCopy = join(
      webScratch,
      `tx-inspector-ui-${expectedVersion}`,
    );
    copyWritableTree(webUi.outLink, webUiCopy);
    const uiIndex = join(webUiCopy, "index.js");
    const uiText = readFileSync(uiIndex, "utf8");
    writeFileSync(
      uiIndex,
      uiText
        .replaceAll(expectedVersion, mutatedVersion)
        .replace(/versionTag\s*=\s*["'`][^"'`]+["'`]/, `versionTag = "${mutatedVersion}"`),
    );
    const webuiMismatch = runChecker([
      "--repo-root",
      repoRoot,
      "--web-ui",
      webUiCopy,
    ]);
    assert.notEqual(
      webuiMismatch.status,
      0,
      `checker accepted mutated WebUI version evidence:\n${webuiMismatch.output}`,
    );
    assert.match(webuiMismatch.output, /WebUI|version/i);

    // --- Nix: real UI tree under a store basename with a wrong derivation version ---
    const nixScratch = track(mkdtempSync(join(tmpdir(), "csk-version-nix-")));
    const nixUiCopy = join(nixScratch, `tx-inspector-ui-${mutatedVersion}`);
    copyWritableTree(webUi.outLink, nixUiCopy);
    // Keep the stamped package version intact so the only failure is Nix metadata.
    const nixMismatch = runChecker([
      "--repo-root",
      repoRoot,
      "--web-ui",
      nixUiCopy,
    ]);
    assert.notEqual(
      nixMismatch.status,
      0,
      `checker accepted mutated Nix version evidence:\n${nixMismatch.output}`,
    );
    assert.match(nixMismatch.output, /Nix package metadata|version/i);

    // --- Artifact: real node-package directory with a wrong-version tarball name ---
    const artScratch = track(mkdtempSync(join(tmpdir(), "csk-version-art-")));
    const artPkg = join(artScratch, "node-package");
    mkdirSync(artPkg, { recursive: true });
    const badName = `lambdasistemi-cardano-swiss-knife-${mutatedVersion}.tgz`;
    copyWritable(join(nodePackage.outLink, tarball), join(artPkg, badName));
    const artifactMismatch = runChecker([
      "--repo-root",
      repoRoot,
      "--node-package",
      artPkg,
    ]);
    assert.notEqual(
      artifactMismatch.status,
      0,
      `checker accepted mutated artifact version name:\n${artifactMismatch.output}`,
    );
    assert.match(artifactMismatch.output, /tarball|artifact|version/i);
  } finally {
    for (const dir of temps) rmSync(dir, { recursive: true, force: true });
    rmSync(nodePackage.outLink, { recursive: true, force: true });
    rmSync(webUi.outLink, { recursive: true, force: true });
  }
});

test("checker rejects source trees that hard-code a second version authority", () => {
  if (!existsSync(versionModulePath)) {
    // RED baseline: module absent is already a failure path covered elsewhere.
    const check = runChecker(["--repo-root", repoRoot]);
    assert.notEqual(check.status, 0);
    return;
  }

  const root = withSourceTree((tree) => {
    writeFileSync(
      join(tree, "node", "src", "version.js"),
      `export const version = "${expectedVersion}";\n`,
    );
  });
  try {
    const check = runChecker(["--repo-root", root]);
    assert.notEqual(
      check.status,
      0,
      "checker accepted a hard-coded version module",
    );
    assert.match(check.output, /hard-code|package\.json|authority/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("just release-version is the focused proof command", () => {
  const justText = readFileSync(justfile, "utf8");
  assert.match(
    justText,
    /release-version:[\s\S]*?node --test node\/test\/version\.test\.mjs/,
  );
});

// Bundled node/dist/version.js resolves ../../package.json. The sandboxed
// node-api check unpacks dist under work/node/dist, so root package.json must
// be staged as work/package.json (see CI ENOENT on /build/work/package.json).
test("sandbox stages package.json for bundled version.js", () => {
  const nixCheck = readFileSync(
    join(repoRoot, "nix", "checks", "node-api.nix"),
    "utf8",
  );
  assert.match(
    nixCheck,
    /cp\s+\$\{repoRoot\}\/package\.json\s+work\/package\.json/,
    "node-api.nix must stage root package.json as work/package.json for bundled version.js",
  );
});
