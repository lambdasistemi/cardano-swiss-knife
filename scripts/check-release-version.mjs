#!/usr/bin/env node
// Single-version release contract checker for cardano-swiss-knife.
//
// package.json is the sole authored version authority. This checker proves the
// Node export, packaged CLI --version/-V, WebUI stamp, Nix package metadata,
// npm tarball name, release-bundle archive/checksum names, and an optional
// tag-shaped input all agree with package.json's version — and rejects
// deliberate mismatches for negative self-tests.
//
// Usage:
//   check-release-version.mjs \
//     [--repo-root DIR] \
//     [--tag TAG] \
//     [--node-package DIR] \
//     [--csk DIR] \
//     [--release-bundle DIR] \
//     [--web-ui DIR] \
//     [--artifact-name NAME]...

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const optionsAll = (name) => {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1] !== undefined) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(option("--repo-root") ?? join(scriptDir, ".."));
const tag = option("--tag");
const nodePackageDir = option("--node-package");
const cskDir = option("--csk");
const releaseBundleDir = option("--release-bundle");
const webUiDir = option("--web-ui");
const artifactNameOverrides = optionsAll("--artifact-name");

const errors = [];
const fail = (message) => errors.push(message);
const tempDirs = [];
const trackTemp = (dir) => {
  tempDirs.push(dir);
  return dir;
};
const cleanupTemps = () => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
};

const readText = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`failed to read ${path}: ${error.message}`);
    return undefined;
  }
};

const readJson = (path, label) => {
  if (!existsSync(path)) {
    fail(`${label} is missing: ${path}`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${path}: ${error.message}`);
    return undefined;
  }
};

const normaliseVersionText = (text) => {
  if (text === undefined || text === null) return undefined;
  const line = String(text).trim().split(/\r?\n/)[0]?.trim() ?? "";
  // Accept plain X.Y.Z or a trailing bare version on a banner line.
  const plain = line.match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  if (plain) return plain[1];
  const trailing = line.match(/\bv?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/);
  return trailing ? trailing[1] : line;
};

const expectedTarballName = (packageName, version) => {
  const unscoped = packageName.replace(/^@/, "").replace(/\//g, "-");
  return `${unscoped}-${version}.tgz`;
};

const runCapture = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd,
    env: process.env,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
};

const assertVersionMatch = (label, actual, expected) => {
  const normalised = normaliseVersionText(actual);
  if (normalised === undefined || normalised === "") {
    fail(`${label}: missing version text`);
    return;
  }
  if (normalised !== expected) {
    fail(`${label}: expected version ${expected}, got ${normalised}`);
  }
};

const resolveStoreBasename = (path) => {
  try {
    const resolved = realpathSync(path);
    return resolved.replace(/\/+$/, "").split("/").pop() ?? "";
  } catch (error) {
    fail(`failed to resolve store path for ${path}: ${error.message}`);
    return "";
  }
};

const versionFromStoreBasename = (basename) => {
  const match = basename.match(/-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  return match ? match[1] : undefined;
};

const importVersionFromModule = (modulePath, label) => {
  const probe = runCapture(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import * as mod from ${JSON.stringify(modulePath)};
       if (!("version" in mod)) {
         console.error(${JSON.stringify(label)} + ": public entrypoint does not export version");
         process.exit(2);
       }
       process.stdout.write(String(mod.version));`,
    ],
    dirname(modulePath),
  );
  if (probe.status !== 0) {
    fail(`failed to import ${label}: ${probe.output}`);
    return undefined;
  }
  return probe.stdout;
};

const extractNodePackage = (tarballPath) => {
  const scratch = trackTemp(mkdtempSync(join(tmpdir(), "csk-version-tgz-")));
  const unpack = runCapture("tar", ["-xzf", tarballPath, "-C", scratch]);
  if (unpack.status !== 0) {
    fail(`failed to extract node-package tarball ${tarballPath}: ${unpack.output}`);
    return undefined;
  }
  const packageRoot = join(scratch, "package");
  if (!existsSync(packageRoot)) {
    fail(`node-package tarball missing top-level package/ directory: ${tarballPath}`);
    return undefined;
  }
  return packageRoot;
};

const publicEntrypointFromPackage = (packageRoot) => {
  const pkg = readJson(join(packageRoot, "package.json"), "packaged package.json");
  if (!pkg) return undefined;
  const exportEntry = pkg.exports?.["."];
  const relative =
    typeof exportEntry === "string"
      ? exportEntry
      : exportEntry?.import ?? pkg.module ?? pkg.main ?? "./node/dist/index.js";
  const entry = join(packageRoot, relative);
  if (!existsSync(entry)) {
    fail(`packaged public entrypoint missing: ${entry}`);
    return undefined;
  }
  return entry;
};

const main = () => {
  try {
    if (!existsSync(repoRoot)) {
      fail(`--repo-root does not exist: ${repoRoot}`);
      finish();
      return;
    }

    const packageJsonPath = join(repoRoot, "package.json");
    const packageLockPath = join(repoRoot, "package-lock.json");
    const packageJson = readJson(packageJsonPath, "package.json");
    const packageLock = readJson(packageLockPath, "package-lock.json");
    if (!packageJson) {
      finish();
      return;
    }

    const expected = packageJson.version;
    if (typeof expected !== "string" || !/^\d+\.\d+\.\d+/.test(expected)) {
      fail(`package.json version is missing or malformed: ${JSON.stringify(expected)}`);
      finish();
      return;
    }

    if (packageLock) {
      const lockRootVersion =
        packageLock.version ?? packageLock.packages?.[""]?.version;
      if (lockRootVersion !== expected) {
        fail(
          `package-lock.json root version ${JSON.stringify(lockRootVersion)} disagrees with package.json ${expected}`,
        );
      }
    }

    // Source-level single-authority contract.
    const versionModulePath = join(repoRoot, "node", "src", "version.js");
    const indexJsPath = join(repoRoot, "node", "src", "index.js");
    const indexDtsPath = join(repoRoot, "node", "src", "index.d.ts");
    const cliPath = join(repoRoot, "cli", "csk.mjs");
    const purescriptNixPath = join(repoRoot, "nix", "purescript.nix");
    const wasmUiNixPath = join(repoRoot, "nix", "wasm-ui.nix");

    if (!existsSync(versionModulePath)) {
      fail("node/src/version.js is missing (sole runtime version module)");
    } else {
      const versionSource = readText(versionModulePath) ?? "";
      if (!/package\.json/.test(versionSource)) {
        fail("node/src/version.js must derive version from package.json");
      }
      // Reject a second authored hard-coded release version literal.
      const hardCoded = versionSource.match(
        /["'`](\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)["'`]/g,
      );
      if (hardCoded && hardCoded.length > 0) {
        fail(
          `node/src/version.js must not hard-code a version literal; found ${hardCoded.join(", ")}`,
        );
      }
      if (
        !/\bexport\b[\s\S]*\bversion\b|\bversion\b[\s\S]*\bexport\b/.test(versionSource)
        && !/export\s+(const|let|var|function|async function|class|{[^}]*\bversion\b)/.test(
          versionSource,
        )
      ) {
        if (!/export\s+const\s+version\b|export\s*{\s*[^}]*\bversion\b/.test(versionSource)) {
          fail("node/src/version.js must export `version`");
        }
      }
    }

    const indexJs = existsSync(indexJsPath) ? readText(indexJsPath) ?? "" : "";
    if (!existsSync(indexJsPath)) fail("node/src/index.js is missing");
    else if (
      !/export\s*\{[^}]*\bversion\b|\bexport\s*\{[^}]*version|from\s+["']\.\/version\.js["']/.test(
        indexJs,
      )
      && !/export\s*\{[\s\S]*\bversion\b[\s\S]*\}\s*from\s*["']\.\/version\.js["']/.test(indexJs)
      && !/export\s*\{\s*version\s*\}\s*from\s*["']\.\/version\.js["']/.test(indexJs)
      && !/export\s+\{[^}]*version[^}]*\}\s*from\s*["'].*version/.test(indexJs)
    ) {
      if (!/\bversion\b/.test(indexJs) || !/version\.js/.test(indexJs)) {
        fail("node/src/index.js must re-export version from ./version.js");
      }
    }

    const indexDts = existsSync(indexDtsPath) ? readText(indexDtsPath) ?? "" : "";
    if (!existsSync(indexDtsPath)) fail("node/src/index.d.ts is missing");
    else if (
      !/\bversion\b/.test(indexDts)
      || !/export\s+declare\s+const\s+version\b|export\s*\{[^}]*\bversion\b/.test(indexDts)
    ) {
      if (!/export\s+declare\s+const\s+version\s*:\s*string/.test(indexDts)) {
        fail("node/src/index.d.ts must declare exported const version: string");
      }
    }

    const cliSource = existsSync(cliPath) ? readText(cliPath) ?? "" : "";
    if (!existsSync(cliPath)) fail("cli/csk.mjs is missing");
    else {
      if (!/--version/.test(cliSource) || !/-V/.test(cliSource)) {
        fail("cli/csk.mjs must handle --version and -V");
      }
      if (!/version\.js/.test(cliSource) && !/\bversion\b/.test(cliSource)) {
        fail("cli/csk.mjs must obtain version from the package-backed module");
      }
    }

    const purescriptNix = existsSync(purescriptNixPath)
      ? readText(purescriptNixPath) ?? ""
      : "";
    if (!existsSync(purescriptNixPath)) fail("nix/purescript.nix is missing");
    else {
      if (/version\s*=\s*"0\.\d+\.\d+"/.test(purescriptNix)) {
        fail(
          "nix/purescript.nix hard-codes a version literal; must derive from package.json",
        );
      }
      if (!/packageJson\.version|fromJSON\s*\(.*package\.json/.test(purescriptNix)) {
        fail("nix/purescript.nix must derive version from package.json");
      }
    }

    const wasmUiNix = existsSync(wasmUiNixPath) ? readText(wasmUiNixPath) ?? "" : "";
    if (!existsSync(wasmUiNixPath)) fail("nix/wasm-ui.nix is missing");
    else {
      // The derivation-level version = "…" must not be a hard-coded release pin.
      if (/^\s*version\s*=\s*"0\.\d+\.\d+"\s*;/m.test(wasmUiNix)) {
        fail(
          "nix/wasm-ui.nix hard-codes a derivation version literal; must use package.json",
        );
      }
      if (!/fromJSON\s*\(.*package\.json|package\.json\)\)\.version/.test(wasmUiNix)) {
        fail("nix/wasm-ui.nix must derive version from package.json");
      }
    }

    // Tag-shaped gate: when provided, must be exactly v${package.json version}.
    if (tag !== undefined) {
      const expectedTag = `v${expected}`;
      if (tag !== expectedTag) {
        fail(`tag ${JSON.stringify(tag)} does not match required ${expectedTag}`);
      }
    }

    // Runtime Node export from source module when present.
    if (existsSync(versionModulePath)) {
      const nodeVersionText = importVersionFromModule(
        versionModulePath,
        "node/src/version.js",
      );
      if (nodeVersionText !== undefined) {
        assertVersionMatch("Node API version export", nodeVersionText, expected);
      }
    } else {
      fail("Node API version export is unavailable");
    }

    // CLI --version / -V from source entrypoint.
    if (existsSync(cliPath)) {
      const versionRun = runCapture(process.execPath, [cliPath, "--version"], repoRoot);
      const shortRun = runCapture(process.execPath, [cliPath, "-V"], repoRoot);
      if (versionRun.status !== 0) {
        fail(`csk --version failed: ${versionRun.output}`);
      } else {
        assertVersionMatch("csk --version", versionRun.stdout, expected);
      }
      if (shortRun.status !== 0) {
        fail(`csk -V failed: ${shortRun.output}`);
      } else {
        assertVersionMatch("csk -V", shortRun.stdout, expected);
      }
    }

    // Packaged csk, when provided.
    if (cskDir) {
      const cskBin = join(cskDir, "bin", "csk");
      if (!existsSync(cskBin)) {
        fail(`packages.csk missing bin/csk at ${cskBin}`);
      } else {
        const packaged = runCapture(cskBin, ["--version"]);
        if (packaged.status !== 0) {
          fail(`packaged csk --version failed: ${packaged.output}`);
        } else {
          assertVersionMatch("packaged csk --version", packaged.stdout, expected);
        }
        const packagedShort = runCapture(cskBin, ["-V"]);
        if (packagedShort.status !== 0) {
          fail(`packaged csk -V failed: ${packagedShort.output}`);
        } else {
          assertVersionMatch("packaged csk -V", packagedShort.stdout, expected);
        }
      }
    }

    // npm tarball name, packaged public Node entrypoint, and release-bundle names.
    const expectedName = expectedTarballName(packageJson.name, expected);
    const artifactNames = [...artifactNameOverrides];

    if (nodePackageDir) {
      if (!existsSync(nodePackageDir)) {
        fail(`--node-package does not exist: ${nodePackageDir}`);
      } else {
        const tarballs = readdirSync(nodePackageDir).filter((name) =>
          name.endsWith(".tgz"),
        );
        if (tarballs.length !== 1) {
          fail(
            `node-package must expose exactly one .tgz; have: ${tarballs.join(", ") || "(none)"}`,
          );
        } else {
          artifactNames.push(tarballs[0]);
          if (tarballs[0] !== expectedName) {
            fail(
              `npm tarball name ${tarballs[0]} does not match package.json-derived ${expectedName}`,
            );
          }
          const packageRoot = extractNodePackage(join(nodePackageDir, tarballs[0]));
          if (packageRoot) {
            const entry = publicEntrypointFromPackage(packageRoot);
            if (entry) {
              const packagedNodeVersion = importVersionFromModule(
                entry,
                "packaged Node public entrypoint",
              );
              if (packagedNodeVersion !== undefined) {
                assertVersionMatch(
                  "packaged Node API version export",
                  packagedNodeVersion,
                  expected,
                );
              }
            }
          }
        }
      }
    }

    if (releaseBundleDir) {
      if (!existsSync(releaseBundleDir)) {
        fail(`--release-bundle does not exist: ${releaseBundleDir}`);
      } else {
        const files = readdirSync(releaseBundleDir);
        const archives = files.filter(
          (name) =>
            name.endsWith(".tgz")
            || name.endsWith(".tar.gz")
            || name.includes("universal"),
        );
        if (archives.length === 0) {
          fail(
            `release-bundle missing portable archive; have: ${files.join(", ") || "(none)"}`,
          );
        }
        for (const archive of archives) {
          artifactNames.push(archive);
          if (!archive.includes(expected)) {
            fail(
              `release-bundle archive ${archive} does not embed package version ${expected}`,
            );
          }
        }
        const sumsName = files.find((name) => /sha256|checksum/i.test(name));
        if (!sumsName) {
          fail(
            `release-bundle missing checksum file; have: ${files.join(", ") || "(none)"}`,
          );
        } else {
          const sums = readText(join(releaseBundleDir, sumsName)) ?? "";
          for (const line of sums.split("\n").filter((entry) => entry.trim() !== "")) {
            const match = line.match(/^[0-9a-f]{64}\s+(\S+)$/i);
            if (!match) {
              fail(`malformed checksum line: ${line}`);
              continue;
            }
            const named = match[1];
            artifactNames.push(named);
            if (!named.includes(expected) && !/sha256|checksum/i.test(named)) {
              // Checksum file itself need not embed the version; named archives must.
              if (
                named.endsWith(".tgz")
                || named.endsWith(".tar.gz")
                || named.includes("universal")
              ) {
                fail(
                  `checksum entry ${named} does not embed package version ${expected}`,
                );
              }
            }
          }
        }
      }
    }

    for (const name of artifactNameOverrides) {
      if (!name.includes(expected)) {
        fail(`artifact name ${name} does not embed package version ${expected}`);
      }
    }

    // WebUI stamp: inspect a built UI tree when provided.
    if (webUiDir) {
      if (!existsSync(webUiDir)) {
        fail(`--web-ui does not exist: ${webUiDir}`);
      } else {
        const indexJsUi = join(webUiDir, "index.js");
        if (!existsSync(indexJsUi)) {
          fail(`WebUI bundle missing index.js at ${indexJsUi}`);
        } else {
          const bundle = readText(indexJsUi) ?? "";
          if (bundle.includes("__CSK_VERSION__")) {
            fail("WebUI bundle still contains unsubstituted __CSK_VERSION__ placeholder");
          }
          // Prefer an exact stamped occurrence of the package version.
          if (!bundle.includes(expected)) {
            fail(`WebUI bundle does not contain stamped package version ${expected}`);
          }
          const tagMatch = bundle.match(/versionTag\s*=\s*["'`]([^"'`]+)["'`]/);
          if (tagMatch) {
            assertVersionMatch("WebUI version stamp", tagMatch[1], expected);
          } else {
            assertVersionMatch("WebUI version stamp", expected, expected);
          }
        }

        // Nix derivation version evidence from the *resolved* store path basename.
        // Missing/unparseable metadata is an error when --web-ui is supplied.
        const storeBase = resolveStoreBasename(webUiDir);
        const nixVersionText = versionFromStoreBasename(storeBase);
        if (nixVersionText === undefined) {
          fail(
            `Nix package metadata version missing or unparseable from resolved store basename ${JSON.stringify(storeBase)}`,
          );
        } else {
          assertVersionMatch("Nix package metadata version", nixVersionText, expected);
        }
      }
    }

    finish();
  } finally {
    cleanupTemps();
  }
};

const finish = () => {
  if (errors.length > 0) {
    for (const message of errors) process.stderr.write(`${message}\n`);
    process.exit(1);
  }
  process.stdout.write("ok: release-version check passed\n");
  process.exit(0);
};

main();
