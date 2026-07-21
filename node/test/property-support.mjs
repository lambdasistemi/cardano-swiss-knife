import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packageName = "@lambdasistemi/cardano-swiss-knife";

export const vectors = JSON.parse(await readFile(new URL("../../test-vectors/vectors.json", import.meta.url), "utf8"));

// Reproduction is deliberately delegated to fast-check: when an assertion fails,
// its seed/path reporter remains intact. CSK_FC_SEED and CSK_FC_PATH replay it.
export const propertyParameters = (numRuns) => {
  const seed = Number(process.env.CSK_FC_SEED);
  return {
    numRuns: Number(process.env.CSK_FC_RUNS ?? numRuns),
    ...(Number.isSafeInteger(seed) ? { seed } : {}),
    ...(process.env.CSK_FC_PATH ? { path: process.env.CSK_FC_PATH } : {}),
  };
};

export const assertEnvelope = (result) => {
  assert.equal(typeof result?.ok, "boolean", `result must have a boolean ok: ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.ok(Object.hasOwn(result, "value"), `success must contain value: ${JSON.stringify(result)}`);
    assert.equal(Object.hasOwn(result, "error"), false, `success must not contain error: ${JSON.stringify(result)}`);
  } else {
    assert.equal(typeof result.error?.code, "string", `failure must contain error.code: ${JSON.stringify(result)}`);
    assert.equal(typeof result.error?.message, "string", `failure must contain error.message: ${JSON.stringify(result)}`);
    assert.equal(Object.hasOwn(result, "value"), false, `failure must not contain value: ${JSON.stringify(result)}`);
  }
  return result;
};

export const assertError = (result, code) => {
  assertEnvelope(result);
  assert.deepEqual(result.ok, false, `expected ${code}, received ${JSON.stringify(result)}`);
  assert.equal(result.error.code, code, JSON.stringify(result));
};

export const legacyNetwork = (vector) => vector.network === "custom" ? vector.protocolMagic : vector.network;

export const installForeignPackage = async () => {
  const tarball = process.env.CSK_PACKAGE_TARBALL;
  assert.ok(tarball, "CSK_PACKAGE_TARBALL must name the Nix-built npm tarball");
  const root = await mkdtemp(join(tmpdir(), "csk-property-"));
  const npmEnvironment = { ...process.env, HOME: root, npm_config_cache: join(root, ".npm-cache") };
  await writeFile(join(root, "package.json"), '{"private":true,"type":"module"}\n');
  await exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", tarball], { cwd: root, env: npmEnvironment });
  let serial = 0;
  return {
    root,
    packageRoot: join(root, "node_modules", "@lambdasistemi", "cardano-swiss-knife"),
    async invoke(calls) {
      const program = join(root, `foreign-property-${serial += 1}.mjs`);
      await writeFile(program, `
        import * as api from ${JSON.stringify(packageName)};
        const calls = ${JSON.stringify(calls)};
        const results = [];
        for (const { name, args = [] } of calls) results.push(await api[name](...args));
        console.log(JSON.stringify(results));
      `);
      const { stdout } = await exec(process.execPath, [program], { cwd: root });
      return JSON.parse(stdout);
    },
    async inspectError() {
      const program = join(root, `foreign-error-${serial += 1}.mjs`);
      await writeFile(program, `
        import { CskError } from ${JSON.stringify(packageName)};
        const error = new CskError("DOMAIN_ERROR", "synthetic sentinel");
        console.log(JSON.stringify({ name: error.name, code: error.code, message: error.message, isError: error instanceof Error }));
      `);
      const { stdout } = await exec(process.execPath, [program], { cwd: root });
      return JSON.parse(stdout);
    },
    async withEngineReplacement(bytes, action) {
      const engine = join(root, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "cardano-addresses.wasm");
      const original = `${engine}.property-original`;
      await rename(engine, original);
      await writeFile(engine, bytes);
      try { return await action(); }
      finally {
        await rm(engine, { force: true });
        await rename(original, engine);
      }
    },
    async hideEngine(action) {
      const engine = join(root, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "cardano-addresses.wasm");
      const hidden = `${engine}.property-hidden`;
      await rename(engine, hidden);
      try { return await action(); }
      finally { await rename(hidden, engine); }
    },
    async cleanup() { await rm(root, { recursive: true, force: true }); },
  };
};
