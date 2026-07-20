import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

const run = promisify(execFile);
const packageName = "@lambdasistemi/cardano-swiss-knife";
const packedTarball = process.env.CSK_PACKAGE_TARBALL;
const transactionCbor = (await readFile(new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url), "utf8")).trim();
const textEnvelope = JSON.stringify({
  type: "Tx ConwayEra",
  description: "Ledger Cddl Format",
  cborHex: transactionCbor,
});

assert.ok(packedTarball, "CSK_PACKAGE_TARBALL must name the prebuilt npm pack artifact");

let foreignProject;

const npmEnvironment = () => ({
  ...process.env,
  HOME: foreignProject,
  npm_config_cache: join(foreignProject, ".npm-cache"),
});

const runForeignProgram = async (program, options = {}) => {
  const script = join(foreignProject, "transaction-import.mjs");
  await writeFile(script, program);
  const { stdout } = await run(process.execPath, options.import ? ["--import", options.import, script] : [script], {
    cwd: foreignProject,
  });
  return JSON.parse(stdout);
};

const transactionEngine = () => join(
  foreignProject,
  "node_modules",
  "@lambdasistemi",
  "cardano-swiss-knife",
  "node",
  "dist",
  "wasm-tx-inspector.wasm",
);

before(async () => {
  foreignProject = await mkdtemp(join(tmpdir(), "csk-transaction-api-"));
  await writeFile(join(foreignProject, "package.json"), '{"private":true,"type":"module"}\n');
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", packedTarball], {
    cwd: foreignProject,
    env: npmEnvironment(),
  });
});

after(async () => {
  if (foreignProject) await rm(foreignProject, { recursive: true, force: true });
});

test("publishes the four offline transaction operations", async () => {
  const exports = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(Object.keys(api)));
  `);

  for (const operation of ["inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent"]) {
    assert.ok(exports.includes(operation), `missing ${operation}`);
  }
});

test("raw Conway CBOR and shared TextEnvelope inputs produce equal offline results", async () => {
  const results = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const raw = ${JSON.stringify({ cborHex: transactionCbor })};
    const envelope = ${JSON.stringify({ textEnvelope })};
    const browseOptions = { path: ["body", "fee"] };
    const results = {
      inspect: [await api.inspectTransaction(raw), await api.inspectTransaction(envelope)],
      browse: [await api.browseTransaction(raw, browseOptions), await api.browseTransaction(envelope, browseOptions)],
      identify: [await api.identifyTransaction(raw), await api.identifyTransaction(envelope)],
      intent: [await api.transactionIntent(raw), await api.transactionIntent(envelope)],
    };
    console.log(JSON.stringify(results));
  `);

  for (const [operation, [raw, envelope]] of Object.entries(results)) {
    assert.equal(raw.ok, true, `${operation} raw CBOR failed: ${JSON.stringify(raw)}`);
    assert.deepEqual(envelope, raw, `${operation} TextEnvelope result differs from raw CBOR`);
  }
});

test("raw transaction operations do not attempt outbound network access", async () => {
  const guard = join(foreignProject, "network-denied.mjs");
  await writeFile(guard, `
    import net from "node:net";
    import http from "node:http";
    import https from "node:https";
    import tls from "node:tls";
    import dns from "node:dns";
    import { syncBuiltinESMExports } from "node:module";
    const denied = (name) => () => { throw new Error("outbound network attempted via " + name); };
    net.connect = denied("net.connect"); net.createConnection = denied("net.createConnection");
    http.request = denied("http.request"); http.get = denied("http.get");
    https.request = denied("https.request"); https.get = denied("https.get");
    tls.connect = denied("tls.connect"); dns.lookup = denied("dns.lookup"); dns.resolve = denied("dns.resolve");
    globalThis.fetch = denied("fetch"); syncBuiltinESMExports();
  `);
  const results = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const input = ${JSON.stringify({ cborHex: transactionCbor })};
    console.log(JSON.stringify([
      await api.inspectTransaction(input),
      await api.browseTransaction(input, { path: ["body"] }),
      await api.identifyTransaction(input),
      await api.transactionIntent(input),
    ]));
  `, { import: pathToFileURL(guard).href });

  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));
});

test("reports missing, incompatible, execution, and protocol transaction engines as typed hard failures", async () => {
  const engine = transactionEngine();
  const original = `${engine}.original`;
  await rename(engine, original);
  try {
    const missing = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectTransaction(${JSON.stringify({ cborHex: transactionCbor })})));
    `);
    assert.equal(missing.ok, false);
    assert.equal(missing.error.code, "ENGINE_NOT_FOUND");

    await writeFile(engine, "not a WebAssembly binary");
    const incompatible = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectTransaction(${JSON.stringify({ cborHex: transactionCbor })})));
    `);
    assert.equal(incompatible.ok, false);
    assert.equal(incompatible.error.code, "ENGINE_INCOMPATIBLE");
    await rm(engine);

    await writeFile(engine, Buffer.from([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x08, 0x02, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x00, 0x00,
      0x02, 0x24, 0x01, 0x16, ...Buffer.from("wasi_snapshot_preview1"), 0x09, ...Buffer.from("proc_exit"), 0x00, 0x00,
      0x03, 0x02, 0x01, 0x01,
      0x07, 0x0a, 0x01, 0x06, ...Buffer.from("_start"), 0x00, 0x01,
      0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x2a, 0x10, 0x00, 0x0b,
    ]));
    const execution = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectTransaction(${JSON.stringify({ cborHex: transactionCbor })})));
    `);
    assert.equal(execution.ok, false);
    assert.equal(execution.error.code, "ENGINE_EXECUTION");
    await rm(engine);

    await writeFile(engine, Buffer.from([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x08, 0x02, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x00, 0x00,
      0x02, 0x24, 0x01, 0x16, ...Buffer.from("wasi_snapshot_preview1"), 0x09, ...Buffer.from("proc_exit"), 0x00, 0x00,
      0x03, 0x02, 0x01, 0x01,
      0x07, 0x0a, 0x01, 0x06, ...Buffer.from("_start"), 0x00, 0x01,
      0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x00, 0x10, 0x00, 0x0b,
    ]));
    const protocol = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.inspectTransaction(${JSON.stringify({ cborHex: transactionCbor })})));
    `);
    assert.equal(protocol.ok, false);
    assert.equal(protocol.error.code, "ENGINE_PROTOCOL");
  } finally {
    await rm(engine, { force: true });
    await rename(original, engine);
  }
});
