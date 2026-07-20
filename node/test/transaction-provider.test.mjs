import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

const run = promisify(execFile);
const packageName = "@lambdasistemi/cardano-swiss-knife";
const packedTarball = process.env.CSK_PACKAGE_TARBALL;
const transactionCbor = (await readFile(new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url), "utf8")).trim();
const failures = JSON.parse(await readFile(new URL("./fixtures/provider-failures.json", import.meta.url), "utf8"));
const providerCodes = {
  authentication: "PROVIDER_AUTHENTICATION",
  "rate-limit": "PROVIDER_RATE_LIMIT",
  server: "PROVIDER_SERVER",
  transport: "PROVIDER_TRANSPORT",
  decode: "PROVIDER_DECODE",
};

assert.ok(packedTarball, "CSK_PACKAGE_TARBALL must name the prebuilt npm pack artifact");

let foreignProject;

const npmEnvironment = () => ({
  ...process.env,
  HOME: foreignProject,
  npm_config_cache: join(foreignProject, ".npm-cache"),
});

const runForeignProgram = async (program) => {
  const script = join(foreignProject, "transaction-provider-import.mjs");
  await writeFile(script, program);
  const { stdout } = await run(process.execPath, [script], { cwd: foreignProject });
  return JSON.parse(stdout);
};

before(async () => {
  foreignProject = await mkdtemp(join(tmpdir(), "csk-transaction-provider-"));
  await writeFile(join(foreignProject, "package.json"), '{"private":true,"type":"module"}\n');
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", packedTarball], {
    cwd: foreignProject,
    env: npmEnvironment(),
  });
});

after(async () => {
  if (foreignProject) await rm(foreignProject, { recursive: true, force: true });
});

const source = (provider, network, credential = "provider-secret") => ({
  txHash: "a".repeat(64), provider, network, credential,
});

test("routes hash loading for all transaction operations through the selected shared provider network", async () => {
  const results = await runForeignProgram(`
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method: options.method, headers: options.headers, body: options.body ?? null });
      return { status: 200, text: async () => ${JSON.stringify(JSON.stringify({ cbor: transactionCbor }))} };
    };
    const api = await import(${JSON.stringify(packageName)});
    const sources = ${JSON.stringify([
      source("blockfrost", "mainnet"),
      source("blockfrost", "preprod"),
      source("blockfrost", "preview"),
      source("koios", "mainnet"),
      source("koios", "preprod"),
      source("koios", "preview"),
    ])};
    const operations = ["inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent"];
    const results = [];
    for (const input of sources) for (const operation of operations) {
      results.push(await api[operation](input, operation === "browseTransaction" ? { path: ["body"] } : undefined));
    }
    console.log(JSON.stringify({ calls, results }));
  `);

  assert.equal(results.results.length, 24);
  for (const result of results.results) assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(results.calls.some(({ url }) => url === "https://cardano-mainnet.blockfrost.io/api/v0/txs/" + "a".repeat(64) + "/cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://cardano-preprod.blockfrost.io/api/v0/txs/" + "a".repeat(64) + "/cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://cardano-preview.blockfrost.io/api/v0/txs/" + "a".repeat(64) + "/cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://api.koios.rest/api/v1/tx_cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://preprod.koios.rest/api/v1/tx_cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://preview.koios.rest/api/v1/tx_cbor"));
});

for (const [category, failure] of Object.entries(failures)) {
  test(`renders ${category} provider failures without credentials`, async () => {
    const result = await runForeignProgram(`
      globalThis.fetch = async () => {
        ${failure.error ? `throw new Error(${JSON.stringify(failure.error)});` : `return { status: ${failure.status}, text: async () => ${JSON.stringify(failure.body.replace("{{credential}}", "never-render-this-secret"))} };`}
      };
      const api = await import(${JSON.stringify(packageName)});
      console.log(JSON.stringify(await api.inspectTransaction(${JSON.stringify(source("blockfrost", "mainnet", "never-render-this-secret"))})));
    `);

    assert.equal(result.ok, false);
    assert.equal(result.error.code, providerCodes[category]);
    assert.doesNotMatch(result.error.message, /never-render-this-secret/);
  });
}
