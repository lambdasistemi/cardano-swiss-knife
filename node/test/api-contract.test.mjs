import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const checker = process.env.CSK_NODE_API_CHECKER
  ?? fileURLToPath(new URL("../../scripts/check-node-api-exports.mjs", import.meta.url));
const tarball = process.env.CSK_PACKAGE_TARBALL;
const temporaryDirectories = [];

const run = (command, arguments_) => new Promise((resolve, reject) => {
  const child = spawn(command, arguments_, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("close", (code) => resolve({ code, stdout, stderr }));
});

const fixture = async (runtime, facade) => {
  const directory = await mkdtemp(join(tmpdir(), "csk-node-api-contract-"));
  temporaryDirectories.push(directory);
  const runtimePath = join(directory, "runtime.mjs");
  const facadePath = join(directory, "index.d.ts");
  await Promise.all([writeFile(runtimePath, runtime), writeFile(facadePath, facade)]);
  return { runtimePath, facadePath };
};

after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

test("the export checker reports runtime values missing from the declaration facade", async () => {
  const paths = await fixture("export const runtimeOnly = null;\n", "export {};\n");
  const result = await run(process.execPath, [checker, "--runtime", paths.runtimePath, "--facade", paths.facadePath]);

  assert.notEqual(result.code, 0, result.stderr);
  assert.match(result.stderr, /Missing declaration exports: runtimeOnly/);
  assert.doesNotMatch(result.stderr, /Stale declaration exports:/);
});

test("the export checker reports declaration values stale from the runtime", async () => {
  const paths = await fixture("export {};\n", "export declare const staleOnly: unknown;\n");
  const result = await run(process.execPath, [checker, "--runtime", paths.runtimePath, "--facade", paths.facadePath]);

  assert.notEqual(result.code, 0, result.stderr);
  assert.match(result.stderr, /Stale declaration exports: staleOnly/);
  assert.doesNotMatch(result.stderr, /Missing declaration exports:/);
});

test("the packed package advertises and contains its declaration facade", async () => {
  assert.ok(tarball, "CSK_PACKAGE_TARBALL must name the packed npm artifact");
  const directory = await mkdtemp(join(tmpdir(), "csk-node-api-package-"));
  temporaryDirectories.push(directory);
  const extracted = join(directory, "package");
  const unpack = await run("tar", ["-xzf", tarball, "-C", directory]);
  assert.equal(unpack.code, 0, unpack.stderr);

  const packageJson = JSON.parse(await readFile(join(extracted, "package.json"), "utf8"));
  assert.equal(packageJson.exports?.["."]?.types, "./node/dist/index.d.ts");
  await access(join(extracted, "node", "dist", "index.d.ts"));
});
