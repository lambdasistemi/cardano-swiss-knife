import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

const run = promisify(execFile);
const packageName = "@lambdasistemi/cardano-swiss-knife";
const publicOperations = [
  "inspectAddress",
  "generateMnemonic",
  "validateMnemonic",
  "deriveKeys",
  "constructShelleyAddresses",
  "constructIcarusAddressFromMnemonic",
  "constructByronAddressFromMnemonic",
  "constructIcarusAddress",
  "constructByronAddress",
  "signPayload",
  "verifySignature",
  "analyzeNativeScriptHex",
  "analyzeNativeScriptJson",
  "analyzeScriptTemplateJson",
];
const repoRoot = new URL("../../", import.meta.url);
const vectors = JSON.parse(
  await readFile(new URL("../../test-vectors/vectors.json", import.meta.url), "utf8"),
);

let foreignProject;
let packedTarball;

const runForeignProgram = async (program) => {
  const script = join(foreignProject, "foreign-import.mjs");
  await writeFile(script, program);
  const { stdout } = await run(process.execPath, [script], { cwd: foreignProject });
  return JSON.parse(stdout);
};

const npmEnvironment = () => ({
  ...process.env,
  HOME: foreignProject,
  npm_config_cache: join(foreignProject, ".npm-cache"),
});

before(async () => {
  foreignProject = await mkdtemp(join(tmpdir(), "csk-node-api-"));
  await writeFile(join(foreignProject, "package.json"), '{"private":true,"type":"module"}\n');
  const { stdout } = await run("npm", ["pack", "--json"], { cwd: repoRoot.pathname, env: npmEnvironment() });
  const [{ filename }] = JSON.parse(stdout);
  packedTarball = join(repoRoot.pathname, filename);
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", packedTarball], {
    cwd: foreignProject, env: npmEnvironment(),
  });
});

after(async () => {
  if (foreignProject) await rm(foreignProject, { recursive: true, force: true });
  if (packedTarball) await rm(packedTarball, { force: true });
});

test("publishes the complete ESM surface from an installed package in a foreign current working directory", async () => {
  const exports = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(Object.keys(api)));
  `);

  for (const operation of publicOperations) {
    assert.ok(exports.includes(operation), `missing ${operation}`);
  }
  assert.ok(exports.includes("CskError"));
  await assert.rejects(access(join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node_modules")));
});

test("delegates representative committed vectors and keeps an invalid signature a valid false", async () => {
  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const vectors = ${JSON.stringify({
      inspection: vectors.inspectionVectors[0],
      derivation: vectors.derivationVectors[0],
      bootstrap: vectors.bootstrapVectors[0],
      script: vectors.scriptHashVectors[0],
      signing: vectors.signingVectors[0],
    })};
    const results = {
      inspection: await api.inspectAddress(vectors.inspection.address),
      derivation: await api.deriveKeys({
        mnemonic: vectors.derivation.mnemonic,
        accountIndex: vectors.derivation.accountIndex,
        role: vectors.derivation.role,
        addressIndex: vectors.derivation.addressIndex,
      }),
      bootstrap: await api.constructIcarusAddress({
        network: vectors.bootstrap.network,
        addressXPubBech32: vectors.bootstrap.addressXPubBech32,
      }),
      script: await api.analyzeNativeScriptHex(vectors.script.scriptCborHex),
      signed: await api.signPayload({
        payloadMode: vectors.signing.payloadMode,
        payloadInput: vectors.signing.payloadInput,
        signingKeyBech32: vectors.signing.signingKeyBech32,
      }),
      invalid: await api.verifySignature({
        payloadMode: vectors.signing.payloadMode,
        payloadInput: vectors.signing.payloadInput,
        verificationKeyBech32: vectors.signing.verificationKeyBech32,
        signatureHex: vectors.signing.signatureHex.replace(/^./, "0"),
      }),
      invalidDomain: await api.signPayload({
        payloadMode: "hex",
        payloadInput: "zz",
        signingKeyBech32: vectors.signing.signingKeyBech32,
      }),
    };
    console.log(JSON.stringify(results));
  `);

  assert.deepEqual(result.inspection, { ok: true, value: vectors.inspectionVectors[0].expected });
  assert.deepEqual(result.derivation, { ok: true, value: vectors.derivationVectors[0].expected });
  assert.deepEqual(result.bootstrap, { ok: true, value: vectors.bootstrapVectors[0].expectedAddressBase58 });
  assert.deepEqual(result.script, { ok: true, value: vectors.scriptHashVectors[0].expected });
  assert.equal(result.signed.ok, true);
  assert.equal(result.signed.value.signatureHex, vectors.signingVectors[0].signatureHex);
  assert.deepEqual(result.invalid, { ok: true, value: false });
  assert.equal(result.invalidDomain.ok, false);
  assert.equal(result.invalidDomain.error.code, "DOMAIN_ERROR");
});

test("reports a missing packaged engine as a typed hard failure without fallback", async () => {
  const engine = join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "cardano-addresses.wasm");
  const hiddenEngine = `${engine}.hidden`;
  await rename(engine, hiddenEngine);
  try {
    const result = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectAddress(${JSON.stringify(vectors.inspectionVectors[0].address)})));
    `);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "ENGINE_NOT_FOUND");
  } finally {
    await rename(hiddenEngine, engine);
  }
});

test("reports an incompatible packaged engine as a typed hard failure", async () => {
  const engine = join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "cardano-addresses.wasm");
  const originalEngine = `${engine}.original`;
  await rename(engine, originalEngine);
  await writeFile(engine, "not a WebAssembly binary");
  try {
    const result = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectAddress(${JSON.stringify(vectors.inspectionVectors[0].address)})));
    `);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "ENGINE_INCOMPATIBLE");
  } finally {
    await rm(engine, { force: true });
    await rename(originalEngine, engine);
  }
});

test("reports an abnormal WASI exit as a typed execution failure", async () => {
  const engine = join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "cardano-addresses.wasm");
  const originalEngine = `${engine}.original`;
  await rename(engine, originalEngine);
  await writeFile(engine, Buffer.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x10, 0x03, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x04, 0x7f, 0x7f, 0x7f, 0x7f, 0x01, 0x7f, 0x60, 0x00, 0x00,
    0x02, 0x46, 0x02,
    0x16, ...Buffer.from("wasi_snapshot_preview1"), 0x09, ...Buffer.from("proc_exit"), 0x00, 0x00,
    0x16, ...Buffer.from("wasi_snapshot_preview1"), 0x08, ...Buffer.from("fd_write"), 0x00, 0x01,
    0x03, 0x02, 0x01, 0x02,
    0x05, 0x03, 0x01, 0x00, 0x01,
    0x07, 0x0a, 0x01, 0x06, ...Buffer.from("_start"), 0x00, 0x02,
    0x0a, 0x13, 0x01, 0x11, 0x00, 0x41, 0x01, 0x41, 0x00, 0x41, 0x01, 0x41, 0x10, 0x10, 0x01, 0x1a, 0x41, 0x2a, 0x10, 0x00, 0x0b,
    0x0b, 0x10, 0x01, 0x00, 0x41, 0x00, 0x0b, 0x0a, 0x08, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x78, 0x0a,
  ]));
  try {
    const result = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectAddress(${JSON.stringify(vectors.inspectionVectors[0].address)})));
    `);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "ENGINE_EXECUTION");
  } finally {
    await rm(engine, { force: true });
    await rename(originalEngine, engine);
  }
});

test("reports a silent abnormal WASI exit as a typed execution failure", async () => {
  const engine = join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "cardano-addresses.wasm");
  const originalEngine = `${engine}.original`;
  await rename(engine, originalEngine);
  await writeFile(engine, Buffer.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x08, 0x02, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x00, 0x00,
    0x02, 0x24, 0x01, 0x16, ...Buffer.from("wasi_snapshot_preview1"), 0x09, ...Buffer.from("proc_exit"), 0x00, 0x00,
    0x03, 0x02, 0x01, 0x01,
    0x07, 0x0a, 0x01, 0x06, ...Buffer.from("_start"), 0x00, 0x01,
    0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x2a, 0x10, 0x00, 0x0b,
  ]));
  try {
    const result = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectAddress(${JSON.stringify(vectors.inspectionVectors[0].address)})));
    `);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "ENGINE_EXECUTION");
  } finally {
    await rm(engine, { force: true });
    await rename(originalEngine, engine);
  }
});
