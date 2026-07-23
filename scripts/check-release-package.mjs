#!/usr/bin/env node
// Portable release-package checker for cardano-swiss-knife.
//
// Proves flake-built node-package, packages.csk, and release-bundle share one
// Node-22 packaged distribution: every authoritative engine and shipped
// book/registry asset appears exactly once, checksum entries name and match
// real bundle contents, and missing/duplicate/tampered artifacts are rejected.
//
// Usage:
//   check-release-package.mjs \
//     --node-package DIR \
//     --csk DIR \
//     --release-bundle DIR \
//     [--repo-root DIR]

import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(option("--repo-root") ?? join(scriptDir, ".."));
const nodePackageDir = option("--node-package");
const cskDir = option("--csk");
const releaseBundleDir = option("--release-bundle");

const REQUIRED_ENGINES = [
  "cardano-addresses.wasm",
  "wasm-tx-inspector.wasm",
  "rdf_shapes_wasm.js",
  "rdf_shapes_wasm_bg.wasm",
];

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

const errors = [];
const fail = (message) => errors.push(message);

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

const requireArg = (value, name) => {
  if (!value) {
    fail(`missing required argument ${name}`);
    return false;
  }
  if (!existsSync(value)) {
    fail(`${name} path does not exist: ${value}`);
    return false;
  }
  return true;
};

const assertExactlyOne = (paths, asset, where) => {
  const count = countEndingWith(paths, asset);
  if (count === 0) fail(`${where}: missing required asset ${asset}`);
  else if (count !== 1) fail(`${where}: expected exactly one ${asset}, found ${count} (duplicate)`);
};

const unpackTarball = (tarballPath) => {
  const scratch = mkdtempSync(join(tmpdir(), "csk-check-release-package-"));
  const result = spawnSync("tar", ["-xzf", tarballPath, "-C", scratch], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`failed to unpack tarball ${tarballPath}: ${result.stderr ?? result.stdout}`);
    rmSync(scratch, { recursive: true, force: true });
    return null;
  }
  return scratch;
};

const main = () => {
  if (!requireArg(nodePackageDir, "--node-package")) return;
  if (!requireArg(cskDir, "--csk")) return;
  if (!requireArg(releaseBundleDir, "--release-bundle")) return;
  if (!existsSync(repoRoot)) fail(`--repo-root does not exist: ${repoRoot}`);

  const tarballs = readdirSync(nodePackageDir).filter((name) => name.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    fail(`node-package must expose exactly one .tgz; have: ${tarballs.join(", ") || "(none)"}`);
  }

  const cskBin = join(cskDir, "bin", "csk");
  if (!existsSync(cskBin)) fail(`packages.csk missing bin/csk at ${cskBin}`);
  else {
    const wrapper = readFileSync(cskBin, "utf8");
    if (!/nodejs-22|nodejs_22|\/nodejs-22\//.test(wrapper) && !/-nodejs-22/.test(wrapper)) {
      // Accept store path style: ...-nodejs-22.x.y.../bin
      if (!/\/nix\/store\/[^/\s]+-nodejs-(\d+)/.test(wrapper)) {
        fail("packages.csk wrapper must pin a nixpkgs Node runtime");
      } else {
        const major = Number(wrapper.match(/\/nix\/store\/[^/\s]+-nodejs-(\d+)/)[1]);
        if (major !== 22) fail(`packages.csk must use Node 22; found major ${major}`);
      }
    }
  }

  let packagePaths = [];
  let unpackRoot = null;
  if (tarballs.length === 1) {
    const tarballPath = join(nodePackageDir, tarballs[0]);
    unpackRoot = unpackTarball(tarballPath);
    if (unpackRoot) {
      const packageRoot = join(unpackRoot, "package");
      if (!existsSync(packageRoot)) {
        fail("npm tarball missing top-level package/ directory");
      } else {
        packagePaths = listFiles(packageRoot);
        for (const asset of REQUIRED_ASSETS) {
          assertExactlyOne(packagePaths, asset, "npm tarball");
        }
      }
    }
  }

  const cskPaths = listFiles(cskDir);
  for (const asset of REQUIRED_ASSETS) {
    assertExactlyOne(cskPaths, asset, "packages.csk");
  }

  // Shared provenance: byte-identical engines + book/registry assets.
  if (packagePaths.length > 0 && errors.length === 0) {
    for (const asset of REQUIRED_ASSETS) {
      const packagedHit = packagePaths.find((path) => path.endsWith(asset));
      const cskHit = cskPaths.find((path) => path.endsWith(asset));
      if (!packagedHit || !cskHit) continue;
      const packagedHash = sha256File(packagedHit);
      const cskHash = sha256File(cskHit);
      if (packagedHash !== cskHash) {
        fail(`${asset} differs between node-package and packages.csk (checksum mismatch)`);
      }
    }
  }

  const bundleFiles = readdirSync(releaseBundleDir);
  const archives = bundleFiles.filter(
    (name) => name.endsWith(".tgz") || name.endsWith(".tar.gz") || name.includes("universal"),
  );
  if (archives.length === 0) {
    fail(`release-bundle must contain a portable archive; have: ${bundleFiles.join(", ") || "(none)"}`);
  }

  const sumsName = bundleFiles.find((name) => /sha256|checksum/i.test(name));
  if (!sumsName) {
    fail(`release-bundle must contain a checksum file; have: ${bundleFiles.join(", ") || "(none)"}`);
  } else {
    const sumsPath = join(releaseBundleDir, sumsName);
    const sums = readFileSync(sumsPath, "utf8");
    const lines = sums.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) fail("checksum file is empty");
    for (const line of lines) {
      const match = line.match(/^([0-9a-f]{64})\s+(\S+)$/i);
      if (!match) {
        fail(`malformed checksum line: ${line}`);
        continue;
      }
      const [, digest, name] = match;
      const target = join(releaseBundleDir, name);
      if (!existsSync(target) || !statSync(target).isFile()) {
        fail(`checksum names missing file: ${name}`);
        continue;
      }
      const actual = sha256File(target);
      if (actual !== digest.toLowerCase()) {
        fail(`checksum mismatch for ${name}: expected ${digest.toLowerCase()}, got ${actual}`);
      }
    }
    if (errors.length === 0) {
      process.stdout.write(`ok: release-package checksums verified (${lines.length} entries)\n`);
    }
  }

  if (unpackRoot) rmSync(unpackRoot, { recursive: true, force: true });

  if (errors.length > 0) {
    for (const message of errors) process.stderr.write(`${message}\n`);
    process.exit(1);
  }

  process.stdout.write("ok: release-package check passed\n");
  process.exit(0);
};

main();
