import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)), "..");
const checker = join(repoRoot, "scripts", "check-release-package.mjs");
const justfile = join(repoRoot, "justfile");
const packageSmoke = join(repoRoot, "node", "test", "package-smoke.mjs");
const checkNodePackage = join(repoRoot, "scripts", "check-node-package.sh");

const REQUIRED_ENGINES = [
  "cardano-addresses.wasm",
  "wasm-tx-inspector.wasm",
  "rdf_shapes_wasm.js",
  "rdf_shapes_wasm_bg.wasm",
];

// Shipped book/blueprint/registry assets (package-relative discovery; FR-012).
const REQUIRED_BOOK_REGISTRY_ASSETS = [
  "registry.json",
  "shapes.ttl",
  "journal-2026.json",
  "sundaeswap-v3/plutus.json",
  "sundaeswap-v3/pin.json",
  "sundaeswap-treasury-v3/plutus.json",
  "sundaeswap-treasury-v3/pin.json",
];

const REQUIRED_ASSETS = [...REQUIRED_ENGINES, ...REQUIRED_BOOK_REGISTRY_ASSETS];

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

const runChecker = (args = [], env = {}) =>
  run(process.execPath, [checker, ...args], { env });

const currentSystem = () => {
  const result = run("nix", [
    "eval",
    "--impure",
    "--raw",
    "--expr",
    "builtins.currentSystem",
  ]);
  assert.equal(result.status, 0, `builtins.currentSystem failed:\n${result.output}`);
  const system = result.stdout.trim();
  assert.match(system, /^[a-z0-9_]+-[a-z0-9_]+$/, `unexpected system: ${system}`);
  return system;
};

const nixAttrNames = (flakeAttr) => {
  const result = run("nix", [
    "eval",
    "--json",
    flakeAttr,
    "--apply",
    "p: builtins.attrNames p",
  ]);
  assert.equal(result.status, 0, `nix eval ${flakeAttr} failed:\n${result.output}`);
  return JSON.parse(result.stdout);
};

const buildAttr = (attr) => {
  const outLink = mkdtempSync(join(tmpdir(), `csk-build-${attr}-`));
  rmSync(outLink, { recursive: true, force: true });
  const result = run("nix", ["build", `.#${attr}`, "-o", outLink]);
  return { status: result.status, output: result.output, outLink };
};

const listFiles = (root) => {
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...listFiles(path));
    else paths.push(path);
  }
  return paths;
};

const sha256File = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const countEndingWith = (paths, suffix) =>
  paths.filter((path) => path.endsWith(suffix)).length;

const assertExactlyOneAsset = (paths, asset, where) => {
  assert.equal(
    countEndingWith(paths, asset),
    1,
    `${where} must contain exactly one ${asset}`,
  );
};

const nodeMajorFromWrapper = (wrapperPath) => {
  const text = readFileSync(wrapperPath, "utf8");
  const pathMatch = text.match(/\/nix\/store\/[^/\s]+-nodejs-(\d+)[^/\s]*\/bin/);
  assert.ok(
    pathMatch,
    `wrapper ${wrapperPath} must pin a nixpkgs nodejs runtime; got:\n${text}`,
  );
  return Number(pathMatch[1]);
};

const extractExecNodeScript = (wrapperPath) => {
  const text = readFileSync(wrapperPath, "utf8");
  const match = text.match(/exec\s+node\s+(\S+)/);
  assert.ok(match, `wrapper ${wrapperPath} must exec node <script>`);
  return match[1].replace(/^["']|["']$/g, "");
};

test("release-package checker and just recipe exist", () => {
  assert.ok(existsSync(checker), "scripts/check-release-package.mjs is missing");
  assert.ok(existsSync(justfile), "justfile is missing");
  const justText = readFileSync(justfile, "utf8");
  assert.match(justText, /^release-package:/m, "justfile must define release-package");
  assert.match(
    justText,
    /^ci:.*\brelease-package\b/m,
    "just ci must depend on release-package",
  );
});

test("flake exposes packages.csk and packages.release-bundle at the current system", () => {
  const system = currentSystem();
  // Query system-scoped packages; bare .#packages only lists system names.
  const packages = nixAttrNames(`.#packages.${system}`);
  assert.ok(packages.includes("csk"), `packages.csk missing; have: ${packages.join(", ")}`);
  assert.ok(
    packages.includes("release-bundle"),
    `packages.release-bundle missing; have: ${packages.join(", ")}`,
  );
  assert.ok(
    packages.includes("node-package"),
    `packages.node-package missing; have: ${packages.join(", ")}`,
  );
  const apps = nixAttrNames(`.#apps.${system}`);
  assert.ok(apps.includes("csk"), `apps.csk missing; have: ${apps.join(", ")}`);
});

test("foreign-CWD installed-tarball smoke proves engines and book/registry assets", () => {
  assert.ok(existsSync(packageSmoke), "node/test/package-smoke.mjs is missing");
  assert.ok(existsSync(checkNodePackage), "scripts/check-node-package.sh is missing");

  const nodePackage = buildAttr("node-package");
  assert.equal(nodePackage.status, 0, `node-package build failed:\n${nodePackage.output}`);

  try {
    const tarballs = readdirSync(nodePackage.outLink).filter((name) => name.endsWith(".tgz"));
    assert.equal(tarballs.length, 1, "node-package must expose exactly one npm tarball");
    const tarballPath = join(nodePackage.outLink, tarballs[0]);

    // Static inventory of the tarball before install (engines + book/registry).
    const unpackDir = mkdtempSync(join(tmpdir(), "csk-tarball-inventory-"));
    try {
      const unpack = run("tar", ["-xzf", tarballPath, "-C", unpackDir]);
      assert.equal(unpack.status, 0, unpack.output);
      const packageRoot = join(unpackDir, "package");
      const packaged = listFiles(packageRoot);
      for (const asset of REQUIRED_ASSETS) {
        assertExactlyOneAsset(packaged, asset, "npm tarball");
      }
    } finally {
      rmSync(unpackDir, { recursive: true, force: true });
    }

    // Execute the authoritative foreign-CWD installed-tarball smoke.
    const smoke = run("bash", [checkNodePackage], {
      env: {
        ...process.env,
        CSK_PACKAGE_TARBALL: tarballPath,
      },
    });
    assert.equal(
      smoke.status,
      0,
      `foreign-CWD package smoke failed:\n${smoke.output}`,
    );
  } finally {
    rmSync(nodePackage.outLink, { recursive: true, force: true });
  }
});

test("packages.csk and apps.csk share one Node-22 packaged distribution", () => {
  const system = currentSystem();
  const nodePackage = buildAttr("node-package");
  assert.equal(nodePackage.status, 0, `node-package build failed:\n${nodePackage.output}`);
  const csk = buildAttr("csk");
  assert.equal(csk.status, 0, `packages.csk build failed:\n${csk.output}`);

  try {
    const tarballs = readdirSync(nodePackage.outLink).filter((name) => name.endsWith(".tgz"));
    assert.equal(tarballs.length, 1, "node-package must expose exactly one npm tarball");
    const tarballPath = join(nodePackage.outLink, tarballs[0]);

    const cskBin = join(csk.outLink, "bin", "csk");
    assert.ok(existsSync(cskBin), "packages.csk must install bin/csk");
    const help = run(cskBin, ["--help"]);
    assert.equal(help.status, 0, `packages.csk --help failed:\n${help.output}`);
    assert.match(help.output, /\bcsk\b/i, "packages.csk --help must describe the csk CLI");

    // Pinned Node 22 runtime (not a useless `csk -e` probe).
    assert.equal(
      nodeMajorFromWrapper(cskBin),
      22,
      "packages.csk must use the pinned Node 22 runtime",
    );

    // apps.csk must be executable at the app level and share the same Node 22 + distribution.
    const appProgramEval = run("nix", ["eval", "--raw", `.#apps.${system}.csk.program`]);
    assert.equal(appProgramEval.status, 0, `apps.csk program eval failed:\n${appProgramEval.output}`);
    const appProgram = appProgramEval.stdout.trim();
    assert.ok(existsSync(appProgram), `apps.csk program missing: ${appProgram}`);
    assert.equal(
      nodeMajorFromWrapper(appProgram),
      22,
      "apps.csk must use the pinned Node 22 runtime",
    );

    const appHelp = run(appProgram, ["--help"]);
    assert.equal(appHelp.status, 0, `apps.csk --help failed:\n${appHelp.output}`);
    assert.match(appHelp.output, /\bcsk\b/i, "apps.csk --help must describe the csk CLI");

    const packageScript = extractExecNodeScript(cskBin);
    const appScript = extractExecNodeScript(appProgram);
    assert.equal(
      packageScript,
      appScript,
      `apps.csk and packages.csk must exec the same packaged csk entrypoint; packages=${packageScript} apps=${appScript}`,
    );

    // Shared provenance: engines + book/registry assets byte-identical with the npm tarball.
    const unpackDir = mkdtempSync(join(tmpdir(), "csk-unpack-shared-"));
    try {
      const unpack = run("tar", ["-xzf", tarballPath, "-C", unpackDir]);
      assert.equal(unpack.status, 0, unpack.output);
      const packageRoot = join(unpackDir, "package");
      const packaged = listFiles(packageRoot);
      const cskFiles = listFiles(csk.outLink);
      for (const asset of REQUIRED_ASSETS) {
        const packagedHits = packaged.filter((path) => path.endsWith(asset));
        const cskHits = cskFiles.filter((path) => path.endsWith(asset));
        assert.equal(packagedHits.length, 1, `tarball must contain exactly one ${asset}`);
        assert.equal(cskHits.length, 1, `packages.csk must contain exactly one ${asset}`);
        assert.equal(
          sha256File(packagedHits[0]),
          sha256File(cskHits[0]),
          `${asset} must be byte-identical between node-package and packages.csk`,
        );
      }
    } finally {
      rmSync(unpackDir, { recursive: true, force: true });
    }

    const bundle = buildAttr("release-bundle");
    assert.equal(bundle.status, 0, `release-bundle build failed:\n${bundle.output}`);
    try {
      const bundleFiles = readdirSync(bundle.outLink);
      assert.ok(
        bundleFiles.some(
          (name) =>
            name.endsWith(".tgz") || name.includes("universal") || name.endsWith(".tar.gz"),
        ),
        `release-bundle must contain a portable archive; have: ${bundleFiles.join(", ")}`,
      );
      assert.ok(
        bundleFiles.some((name) => /sha256|checksum/i.test(name)),
        `release-bundle must contain checksums; have: ${bundleFiles.join(", ")}`,
      );

      const check = runChecker([
        "--node-package",
        nodePackage.outLink,
        "--csk",
        csk.outLink,
        "--release-bundle",
        bundle.outLink,
        "--repo-root",
        repoRoot,
      ]);
      assert.equal(check.status, 0, `checker failed on real builds:\n${check.output}`);
    } finally {
      rmSync(bundle.outLink, { recursive: true, force: true });
    }
  } finally {
    rmSync(nodePackage.outLink, { recursive: true, force: true });
    rmSync(csk.outLink, { recursive: true, force: true });
  }
});

test("checker verifies deterministic checksums against real bundle contents", () => {
  const bundle = buildAttr("release-bundle");
  assert.equal(bundle.status, 0, bundle.output);
  const nodePackage = buildAttr("node-package");
  assert.equal(nodePackage.status, 0, nodePackage.output);
  const csk = buildAttr("csk");
  assert.equal(csk.status, 0, csk.output);
  try {
    const check = runChecker([
      "--node-package",
      nodePackage.outLink,
      "--csk",
      csk.outLink,
      "--release-bundle",
      bundle.outLink,
      "--repo-root",
      repoRoot,
    ]);
    assert.equal(check.status, 0, check.output);
    assert.match(check.output, /checksum|SHA256|ok/i);

    const sumsPath = readdirSync(bundle.outLink)
      .map((name) => join(bundle.outLink, name))
      .find((path) => /sha256|checksum/i.test(path));
    assert.ok(sumsPath, "checksum file missing from release-bundle");
    const sums = readFileSync(sumsPath, "utf8");
    for (const line of sums.split("\n").filter(Boolean)) {
      const match = line.match(/^([0-9a-f]{64})\s+(\S+)$/i);
      assert.ok(match, `malformed checksum line: ${line}`);
      const [, digest, name] = match;
      const target = join(bundle.outLink, name);
      assert.ok(existsSync(target), `checksum names missing file: ${name}`);
      assert.equal(sha256File(target), digest.toLowerCase(), `checksum mismatch for ${name}`);
    }
  } finally {
    rmSync(bundle.outLink, { recursive: true, force: true });
    rmSync(nodePackage.outLink, { recursive: true, force: true });
    rmSync(csk.outLink, { recursive: true, force: true });
  }
});

// Copy store outputs by re-writing bytes so negative fixtures are user-writable
// (cpSync from /nix/store keeps immutable 0444 modes that block chmod/repack).
const copyStoreFile = (from, to) => {
  writeFileSync(to, readFileSync(from));
};

const copyStoreTree = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) copyStoreTree(src, dest);
    else copyStoreFile(src, dest);
  }
};

const mutateTarballAsset = (nodePackageOut, mutate) => {
  const scratch = mkdtempSync(join(tmpdir(), "csk-mutate-tarball-"));
  const destPkg = join(scratch, "node-package");
  mkdirSync(destPkg, { recursive: true });
  const tarball = readdirSync(nodePackageOut).find((n) => n.endsWith(".tgz"));
  assert.ok(tarball, "mutated fixture missing tarball");
  // Byte-copy the tarball so the archive itself is writable for repack.
  copyStoreFile(join(nodePackageOut, tarball), join(destPkg, tarball));
  const unpack = run("tar", ["-xzf", join(destPkg, tarball), "-C", scratch]);
  assert.equal(unpack.status, 0, unpack.output);
  const packageRoot = join(scratch, "package");
  // Force ownership-writable modes on the extracted tree (store modes are 0444).
  const chmod = run("chmod", ["-R", "u+rwX", packageRoot]);
  assert.equal(chmod.status, 0, chmod.output);
  mutate(packageRoot, scratch);
  const repack = run("tar", ["-czf", join(destPkg, tarball), "-C", scratch, "package"]);
  assert.equal(repack.status, 0, repack.output);
  return scratch;
};

test("checker rejects a missing authoritative engine or book/registry asset", () => {
  const nodePackage = buildAttr("node-package");
  assert.equal(nodePackage.status, 0, nodePackage.output);
  const csk = buildAttr("csk");
  assert.equal(csk.status, 0, csk.output);
  const bundle = buildAttr("release-bundle");
  assert.equal(bundle.status, 0, bundle.output);

  const cases = [
    { asset: "wasm-tx-inspector.wasm", kind: "engine" },
    { asset: "registry.json", kind: "book/registry" },
    { asset: "shapes.ttl", kind: "book/registry" },
  ];

  try {
    for (const { asset, kind } of cases) {
      const scratch = mutateTarballAsset(nodePackage.outLink, (packageRoot) => {
        const hit = listFiles(packageRoot).find((p) => p.endsWith(asset));
        assert.ok(hit, `fixture tarball missing ${kind} asset ${asset}`);
        rmSync(hit);
      });
      try {
        const check = runChecker([
          "--node-package",
          join(scratch, "node-package"),
          "--csk",
          csk.outLink,
          "--release-bundle",
          bundle.outLink,
          "--repo-root",
          repoRoot,
        ]);
        assert.notEqual(
          check.status,
          0,
          `checker accepted a tarball missing ${kind} asset ${asset}`,
        );
        assert.match(
          check.output,
          new RegExp(`missing|exactly one|${asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
        );
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(nodePackage.outLink, { recursive: true, force: true });
    rmSync(csk.outLink, { recursive: true, force: true });
    rmSync(bundle.outLink, { recursive: true, force: true });
  }
});

test("checker rejects a duplicate authoritative engine or book/registry asset", () => {
  const nodePackage = buildAttr("node-package");
  assert.equal(nodePackage.status, 0, nodePackage.output);
  const csk = buildAttr("csk");
  assert.equal(csk.status, 0, csk.output);
  const bundle = buildAttr("release-bundle");
  assert.equal(bundle.status, 0, bundle.output);

  const cases = [
    { asset: "cardano-addresses.wasm", kind: "engine", dupName: "cardano-addresses.wasm" },
    { asset: "journal-2026.json", kind: "book/registry", dupName: "journal-2026.json" },
  ];

  try {
    for (const { asset, kind, dupName } of cases) {
      const scratch = mutateTarballAsset(nodePackage.outLink, (packageRoot) => {
        const hit = listFiles(packageRoot).find((p) => p.endsWith(asset));
        assert.ok(hit, `fixture tarball missing ${kind} asset ${asset}`);
        // Second copy under the package root so basename-based discovery sees a duplicate.
        writeFileSync(join(packageRoot, dupName), readFileSync(hit));
      });
      try {
        const check = runChecker([
          "--node-package",
          join(scratch, "node-package"),
          "--csk",
          csk.outLink,
          "--release-bundle",
          bundle.outLink,
          "--repo-root",
          repoRoot,
        ]);
        assert.notEqual(
          check.status,
          0,
          `checker accepted a tarball with a duplicate ${kind} asset ${asset}`,
        );
        assert.match(
          check.output,
          new RegExp(`duplicate|exactly one|${asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
        );
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(nodePackage.outLink, { recursive: true, force: true });
    rmSync(csk.outLink, { recursive: true, force: true });
    rmSync(bundle.outLink, { recursive: true, force: true });
  }
});

test("checker rejects tampered release-bundle checksums", () => {
  const nodePackage = buildAttr("node-package");
  assert.equal(nodePackage.status, 0, nodePackage.output);
  const csk = buildAttr("csk");
  assert.equal(csk.status, 0, csk.output);
  const bundle = buildAttr("release-bundle");
  assert.equal(bundle.status, 0, bundle.output);
  const scratch = mkdtempSync(join(tmpdir(), "csk-tamper-sums-"));
  try {
    copyStoreTree(bundle.outLink, join(scratch, "bundle"));
    const sumsPath = readdirSync(join(scratch, "bundle"))
      .map((name) => join(scratch, "bundle", name))
      .find((path) => /sha256|checksum/i.test(path));
    assert.ok(sumsPath, "checksum file missing");
    const original = readFileSync(sumsPath, "utf8");
    const lines = original.split("\n").filter(Boolean);
    assert.ok(lines.length > 0, "checksum file empty");
    const [first, ...rest] = lines;
    const match = first.match(/^([0-9a-f]{64})(\s+)(\S+)$/i);
    assert.ok(match, `malformed checksum line: ${first}`);
    const fake = `${"0".repeat(64)}${match[2]}${match[3]}`;
    writeFileSync(sumsPath, [fake, ...rest].join("\n") + "\n");
    const check = runChecker([
      "--node-package",
      nodePackage.outLink,
      "--csk",
      csk.outLink,
      "--release-bundle",
      join(scratch, "bundle"),
      "--repo-root",
      repoRoot,
    ]);
    assert.notEqual(check.status, 0, "checker accepted tampered checksums");
    assert.match(check.output, /checksum|mismatch|tamper|sha256/i);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(nodePackage.outLink, { recursive: true, force: true });
    rmSync(csk.outLink, { recursive: true, force: true });
    rmSync(bundle.outLink, { recursive: true, force: true });
  }
});
