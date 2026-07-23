import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

const run = promisify(execFile);
const packageName = "@lambdasistemi/cardano-swiss-knife";
const packedTarball = process.env.CSK_PACKAGE_TARBALL;
const transactionCbor = (await readFile(new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url), "utf8")).trim();
const transactionTextEnvelope = JSON.stringify({ type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: transactionCbor });
const failures = JSON.parse(await readFile(new URL("./fixtures/provider-failures.json", import.meta.url), "utf8"));
const withdrawalCredentialHash = "a64d1b9e1aeffe54056034d84977061b45a92691efc282fbee3fc094";
const withdrawalStakeAddress = "stake17xny6xu7rthlu4q9vq6dsjthqcd5t2fxj8hu9qhmaclup9q5msta3";
const blockfrostAccountUrl = `https://cardano-mainnet.blockfrost.io/api/v0/accounts/${withdrawalStakeAddress}`;
const koiosAccountUrl = "https://api.koios.rest/api/v1/account_info";
const koiosAccountBody = `{"_stake_addresses":["${withdrawalStakeAddress}"]}`;
const blockfrostAccountResponse = (registered, balance) => JSON.stringify({ stake_address: withdrawalStakeAddress, registered, withdrawable_amount: balance });
const koiosAccountResponse = (status, balance) => JSON.stringify([{ stake_address: withdrawalStakeAddress, status, rewards_available: balance }]);
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
const completedEntry = {
  entryId: "entry-1",
  unsignedTxCborHex: "00",
  requiredSigners: [],
  collectedWitnesses: [],
  invalidAfterSlot: 100,
  status: "open",
};

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
    const operations = ["inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent", "planTransactionWitnesses", "validateTransaction", "evaluateTransactionScripts"];
    const results = [];
    for (const input of sources) for (const operation of operations) {
      results.push((await api[operation](input, operation === "browseTransaction" ? { path: ["body"] } : undefined)).ok);
    }
    console.log(JSON.stringify({ calls, results }));
  `);

  assert.equal(results.results.length, 42);
  for (const result of results.results) assert.equal(result, true);
  assert.ok(results.calls.some(({ url }) => url === "https://cardano-mainnet.blockfrost.io/api/v0/txs/" + "a".repeat(64) + "/cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://cardano-preprod.blockfrost.io/api/v0/txs/" + "a".repeat(64) + "/cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://cardano-preview.blockfrost.io/api/v0/txs/" + "a".repeat(64) + "/cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://api.koios.rest/api/v1/tx_cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://preprod.koios.rest/api/v1/tx_cbor"));
  assert.ok(results.calls.some(({ url }) => url === "https://preview.koios.rest/api/v1/tx_cbor"));
});

test("submits completed JSON entries through the packed shared provider using binary bodies and normalised receipts", async () => {
  const result = await runForeignProgram(`
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method: options.method, body: options.body, bytes: Array.from(options.body ?? []) });
      return { status: 200, text: async () => JSON.stringify("${"b".repeat(64)}") };
    };
    const api = await import(${JSON.stringify(packageName)});
    const base = ${JSON.stringify(completedEntry)};
    const inputs = [
      { entry: base, signedTxCborHex: "deadbeef", currentSlot: 10, provider: "blockfrost", network: "mainnet", credential: "provider-secret" },
      { entry: base, signedTxCborHex: "deadbeef", currentSlot: 10, provider: "koios", network: "preview" },
    ];
    const receipts = [];
    for (const input of inputs) receipts.push(await api.submitTransactionEntry(input));
    const rejected = await api.submitTransactionEntry({ ...inputs[1], entry: { ...base, requiredSigners: ["missing"] } });
    const expired = await api.submitTransactionEntry({ ...inputs[1], currentSlot: 100, entry: { ...base, invalidAfterSlot: 100 } });
    const submitted = await api.submitTransactionEntry({ ...inputs[1], entry: { ...base, status: "submitted" } });
    const malformed = await api.submitTransactionEntry({ entry: base, signedTxCborHex: "deadbeef", currentSlot: "10", provider: "other", network: "other" });
    console.log(JSON.stringify({ hasExport: typeof api.submitTransactionEntry === "function", calls, receipts, rejected, expired, submitted, malformed }));
  `);

  assert.equal(result.hasExport, true);
  assert.equal(result.receipts.length, 2);
  for (const [index, receipt] of result.receipts.entries()) {
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
    assert.equal(receipt.value.txId, "b".repeat(64));
    assert.equal(receipt.value.provider, index === 0 ? "blockfrost" : "koios");
    assert.equal(receipt.value.network, index === 0 ? "mainnet" : "preview");
    assert.equal(receipt.value.entry.status, "submitted");
  }
  assert.equal(result.calls.length, 2, "an incomplete entry must be rejected before fetch");
  assert.equal(result.calls[0].url.endsWith("/tx/submit"), true);
  assert.equal(result.calls[1].url.endsWith("/submittx"), true);
  for (const call of result.calls) {
    assert.equal(call.method, "POST");
    assert.deepEqual(call.bytes, [0xde, 0xad, 0xbe, 0xef]);
  }
  assert.equal(result.rejected.ok, false);
  assert.equal(result.rejected.error.code, "DOMAIN_ERROR");
  for (const resultValue of [result.expired, result.submitted, result.malformed]) {
    assert.equal(resultValue.ok, false, JSON.stringify(resultValue));
    assert.equal(resultValue.error.code, "DOMAIN_ERROR");
  }
});

test("returns coded redacted provider submission failures from the packed API", async () => {
  const secret = "never-render-this-submission-secret";
  const result = await runForeignProgram(`
    globalThis.fetch = async () => ({ status: 401, text: async () => ${JSON.stringify(secret)} });
    const api = await import(${JSON.stringify(packageName)});
    console.log(JSON.stringify(await api.submitTransactionEntry(${JSON.stringify({ entry: completedEntry, signedTxCborHex: "deadbeef", currentSlot: 10, provider: "blockfrost", network: "mainnet", credential: secret })})));
  `);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PROVIDER_AUTHENTICATION");
  assert.doesNotMatch(result.error.message, new RegExp(secret));
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

const completeAccountFetchProgram = `
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const call = { url, method: options.method, headers: { ...options.headers }, body: options.body ?? null };
    calls.push(call);
    if (url === ${JSON.stringify(blockfrostAccountUrl)} && options.method === "GET") {
      return { status: 200, text: async () => ${JSON.stringify(blockfrostAccountResponse(true, "5000000"))} };
    }
    if (url === ${JSON.stringify(koiosAccountUrl)} && options.method === "POST" && options.body === ${JSON.stringify(koiosAccountBody)}) {
      return { status: 200, text: async () => ${JSON.stringify(koiosAccountResponse("registered", "5000000"))} };
    }
    return { status: 404, text: async () => "{}" };
  };
  const api = await import(${JSON.stringify(packageName)});
  const blockfrostRaw = { cborHex: ${JSON.stringify(transactionCbor)}, provider: "blockfrost", network: "mainnet", credential: "blockfrost-key" };
  const blockfrostEnvelope = { textEnvelope: ${JSON.stringify(transactionTextEnvelope)}, provider: "blockfrost", network: "mainnet", credential: "blockfrost-key" };
  const koiosRaw = { cborHex: ${JSON.stringify(transactionCbor)}, provider: "koios", network: "mainnet" };
  const raw = await api.validateTransaction(blockfrostRaw);
  const envelope = await api.validateTransaction(blockfrostEnvelope);
  const koios = await api.validateTransaction(koiosRaw);
  const evaluated = await api.evaluateTransactionScripts(blockfrostRaw);
  const accountCallCountAfterConsumers = calls.filter((call) => call.url === ${JSON.stringify(blockfrostAccountUrl)} || call.url === ${JSON.stringify(koiosAccountUrl)}).length;
  const nonConsumingOperations = ["inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent", "planTransactionWitnesses"];
  const nonConsumingResults = {};
  for (const operationName of nonConsumingOperations) {
    nonConsumingResults[operationName] = await api[operationName](blockfrostRaw, operationName === "browseTransaction" ? { path: ["body"] } : undefined);
  }
  const accountCallCountAfterNonConsumers = calls.filter((call) => call.url === ${JSON.stringify(blockfrostAccountUrl)} || call.url === ${JSON.stringify(koiosAccountUrl)}).length;
  console.log(JSON.stringify({ calls, raw, envelope, koios, evaluated, accountCallCountAfterConsumers, accountCallCountAfterNonConsumers, nonConsumingResults }));
`;

test("resolves complete withdrawal certificate state for provider-selected validation and script evaluation, using the exact Koios and Blockfrost account requests, and does not run discovery for operations that cannot consume certificate state", async () => {
  const result = await runForeignProgram(completeAccountFetchProgram);

  for (const outcome of [result.raw, result.envelope, result.koios, result.evaluated]) {
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
  }

  const expectedRewards = [{ credential: { kind: "script", hash: withdrawalCredentialHash }, balance_lovelace: "5000000" }];
  assert.deepEqual(result.raw.value.context.cert_state.rewards, expectedRewards);
  assert.deepEqual(result.envelope.value.context.cert_state.rewards, expectedRewards);
  assert.deepEqual(result.koios.value.context.cert_state.rewards, expectedRewards);
  assert.deepEqual(result.evaluated.value.context.cert_state.rewards, expectedRewards);
  assert.deepEqual(result.raw.value.context.cert_state, result.envelope.value.context.cert_state, "raw CBOR and TextEnvelope validation must agree on normalized certificate state");
  assert.deepEqual(result.raw.value.result.validation, result.envelope.value.result.validation, "raw CBOR and TextEnvelope validation must produce equal normalized ledger verdicts");

  const missingCertState = (validation) => (validation.missing_context ?? []).some((entry) => entry.kind === "cert_state");
  assert.equal(missingCertState(result.raw.value.result.validation), false, "cert_state must no longer be reported as missing context once every withdrawal account resolves");
  assert.equal(missingCertState(result.envelope.value.result.validation), false);
  assert.equal(missingCertState(result.koios.value.result.validation), false);

  const blockfrostCalls = result.calls.filter((call) => call.url === blockfrostAccountUrl);
  assert.equal(blockfrostCalls.length, 3, "blockfrost account endpoint must be requested once per consuming operation (raw validate, TextEnvelope validate, evaluate-scripts)");
  for (const call of blockfrostCalls) {
    assert.equal(call.method, "GET");
    assert.equal(call.headers.project_id, "blockfrost-key");
  }
  const koiosCalls = result.calls.filter((call) => call.url === koiosAccountUrl);
  assert.equal(koiosCalls.length, 1);
  assert.equal(koiosCalls[0].method, "POST");
  assert.equal(koiosCalls[0].body, koiosAccountBody);
  assert.equal(koiosCalls[0].headers["Content-Type"], "application/json");
  assert.equal(koiosCalls[0].headers.Authorization, undefined);

  assert.equal(result.accountCallCountAfterConsumers, 4, "raw validate, envelope validate, koios validate, and evaluate-scripts must each request the account exactly once");
  assert.equal(result.accountCallCountAfterNonConsumers, result.accountCallCountAfterConsumers, "tx.inspect/tx.browse/tx.identify/tx.intent/tx.witness.plan must not run the added withdrawal discovery");
  for (const outcome of Object.values(result.nonConsumingResults)) assert.equal(outcome.ok, true, JSON.stringify(outcome));
});

const blockfrostSecret = "never-render-this-blockfrost-secret";
const koiosSecret = "never-render-this-koios-secret";
const failureScenarios = ["missing", "unregistered", "malformed", "failure"];
const failureAccountFetchProgram = `
  const calls = [];
  let blockfrostScenario = "missing";
  let koiosScenario = "missing";
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method, headers: { ...options.headers }, body: options.body ?? null });
    if (url === ${JSON.stringify(blockfrostAccountUrl)}) {
      if (blockfrostScenario === "missing") return { status: 404, text: async () => "not found" };
      if (blockfrostScenario === "unregistered") return { status: 200, text: async () => ${JSON.stringify(blockfrostAccountResponse(false, "0"))} };
      if (blockfrostScenario === "malformed") return { status: 200, text: async () => JSON.stringify({ stake_address: ${JSON.stringify(withdrawalStakeAddress)}, registered: true, withdrawable_amount: "-5" }) };
      if (blockfrostScenario === "failure") return { status: 503, text: async () => "unavailable " + ${JSON.stringify(blockfrostSecret)} };
    }
    if (url === ${JSON.stringify(koiosAccountUrl)}) {
      if (koiosScenario === "missing") return { status: 200, text: async () => "[]" };
      if (koiosScenario === "unregistered") return { status: 200, text: async () => ${JSON.stringify(koiosAccountResponse("not_registered", "0"))} };
      if (koiosScenario === "malformed") return { status: 200, text: async () => JSON.stringify([{ stake_address: ${JSON.stringify(withdrawalStakeAddress)}, status: "registered", rewards_available: "not-a-number" }]) };
      if (koiosScenario === "failure") return { status: 503, text: async () => "unavailable " + ${JSON.stringify(koiosSecret)} };
    }
    return { status: 404, text: async () => "{}" };
  };
  const api = await import(${JSON.stringify(packageName)});
  const blockfrostInput = { cborHex: ${JSON.stringify(transactionCbor)}, provider: "blockfrost", network: "mainnet", credential: ${JSON.stringify(blockfrostSecret)} };
  const koiosInput = { cborHex: ${JSON.stringify(transactionCbor)}, provider: "koios", network: "mainnet", credential: ${JSON.stringify(koiosSecret)} };
  const outcomes = { blockfrost: {}, koios: {} };
  for (const nextScenario of ${JSON.stringify(failureScenarios)}) {
    blockfrostScenario = nextScenario;
    outcomes.blockfrost[nextScenario] = await api.validateTransaction(blockfrostInput);
    koiosScenario = nextScenario;
    outcomes.koios[nextScenario] = await api.validateTransaction(koiosInput);
  }
  console.log(JSON.stringify({ outcomes, calls }));
`;

test("omits certificate state and leaves the ledger verdict incomplete (never valid or invalid) when a withdrawal account is missing, unregistered, malformed, or the provider request fails, for both Blockfrost and Koios, redacting the credential", async () => {
  const result = await runForeignProgram(failureAccountFetchProgram);

  const expectedCodes = {
    blockfrost: { missing: "PROVIDER_DECODE", unregistered: "WITHDRAWAL_UNREGISTERED", malformed: "WITHDRAWAL_MALFORMED", failure: "PROVIDER_SERVER" },
    koios: { missing: "WITHDRAWAL_MISSING", unregistered: "WITHDRAWAL_UNREGISTERED", malformed: "WITHDRAWAL_MALFORMED", failure: "PROVIDER_SERVER" },
  };
  for (const provider of ["blockfrost", "koios"]) {
    for (const scenario of failureScenarios) {
      const outcome = result.outcomes[provider][scenario];
      assert.equal(outcome.ok, true, `${provider} ${scenario}: ${JSON.stringify(outcome)}`);
      assert.equal(Object.hasOwn(outcome.value.context, "cert_state"), false, `${provider} ${scenario} must omit cert_state wholly`);
      const evidence = outcome.value.context.resolution.withdrawal_accounts;
      assert.equal(evidence.requested_count, 1);
      assert.equal(evidence.resolved_count, 0);
      assert.deepEqual(evidence.missing, [`f1${withdrawalCredentialHash}`], `${provider} ${scenario} evidence must identify the unresolved reward account`);
      assert.equal(evidence.error_codes[0].code, expectedCodes[provider][scenario], `${provider} ${scenario} evidence carried the wrong stable code`);

      const validation = outcome.value.result.validation;
      assert.equal(validation.status, "incomplete", `${provider} ${scenario} must leave the ledger verdict incomplete rather than valid or invalid`);
      assert.notEqual(validation.status, "valid");
      assert.notEqual(validation.status, "invalid");
      const certStateMissing = validation.missing_context.find((entry) => entry.kind === "cert_state");
      assert.ok(certStateMissing, `${provider} ${scenario} must keep reporting cert_state as missing context`);
      assert.deepEqual(certStateMissing.details.withdrawal_credentials, [{ kind: "script", hash: withdrawalCredentialHash }]);
    }
  }

  const blockfrostCalls = result.calls.filter((call) => call.url === blockfrostAccountUrl);
  assert.equal(blockfrostCalls.length, failureScenarios.length);
  for (const call of blockfrostCalls) {
    assert.equal(call.method, "GET");
    assert.equal(call.headers.project_id, blockfrostSecret);
  }
  const koiosCalls = result.calls.filter((call) => call.url === koiosAccountUrl);
  assert.equal(koiosCalls.length, failureScenarios.length);
  for (const call of koiosCalls) {
    assert.equal(call.method, "POST");
    assert.equal(call.body, koiosAccountBody);
    assert.equal(call.headers["Content-Type"], "application/json");
    assert.equal(call.headers.Authorization, `Bearer ${koiosSecret}`);
  }

  const serializedOutcomes = JSON.stringify(result.outcomes);
  assert.doesNotMatch(serializedOutcomes, new RegExp(blockfrostSecret), "returned evidence must never leak the Blockfrost credential");
  assert.doesNotMatch(serializedOutcomes, new RegExp(koiosSecret), "returned evidence must never leak the Koios credential");
});

test("keeps the provider-absent validation path fully offline and unchanged when the transaction contains a withdrawal", async () => {
  const result = await runForeignProgram(`
    let fetchCallCount = 0;
    globalThis.fetch = async () => { fetchCallCount += 1; throw new Error("network denied"); };
    const api = await import(${JSON.stringify(packageName)});
    const offline = await api.validateTransaction({ cborHex: ${JSON.stringify(transactionCbor)} });
    console.log(JSON.stringify({ offline, fetchCallCount }));
  `);

  assert.equal(result.fetchCallCount, 0, "offline validation must make zero HTTP requests");
  assert.equal(result.offline.ok, true, JSON.stringify(result.offline));
  assert.equal(Object.hasOwn(result.offline.value, "context"), false, "offline validation must not add provider context");
});

test("proves the packaged csk CLI validates the committed script-withdrawal fixture with complete Koios certificate state", async () => {
  const cskEntry = join(foreignProject, "node_modules", "@lambdasistemi", "cardano-swiss-knife", "node", "dist", "csk.mjs");
  const txFile = join(foreignProject, "cli-withdrawal-tx.hex");
  await writeFile(txFile, `${transactionCbor}\n`);
  const fetchLog = join(foreignProject, "cli-fetch-log.jsonl");
  await writeFile(fetchLog, "");
  const preload = join(foreignProject, "cli-fetch-preload.mjs");
  await writeFile(preload, `
import { appendFile } from "node:fs/promises";
const logPath = process.env.CSK_TEST_FETCH_LOG;
const accountUrl = process.env.CSK_TEST_ACCOUNT_URL;
const accountBody = process.env.CSK_TEST_ACCOUNT_BODY;
globalThis.fetch = async (url, options = {}) => {
  await appendFile(logPath, JSON.stringify({ url, method: options.method, body: options.body ?? null }) + "\\n");
  if (url === accountUrl) return { status: 200, text: async () => accountBody };
  return { status: 404, text: async () => "{}" };
};
`);

  const cliEnv = {
    ...process.env,
    CSK_TEST_FETCH_LOG: fetchLog,
    CSK_TEST_ACCOUNT_URL: koiosAccountUrl,
    CSK_TEST_ACCOUNT_BODY: koiosAccountResponse("registered", "5000000"),
  };
  const cliArgs = ["--import", pathToFileURL(preload).href, cskEntry, "tx", "validate", "--tx-file", txFile, "--provider", "koios", "--network", "mainnet", "--output", "json"];
  const { code, cliStdout } = await run(process.execPath, cliArgs, { cwd: foreignProject, env: cliEnv })
    .then(({ stdout }) => ({ code: 0, cliStdout: stdout }))
    .catch((error) => ({ code: error.code, cliStdout: error.stdout }));

  assert.equal(code, 0, `csk tx validate exited ${code}: ${cliStdout}`);
  const parsed = JSON.parse(cliStdout);
  assert.equal(parsed.ok, true, cliStdout);
  assert.deepEqual(parsed.value.context.cert_state.rewards, [{ credential: { kind: "script", hash: withdrawalCredentialHash }, balance_lovelace: "5000000" }]);
  assert.equal(Object.hasOwn(parsed.value.context.resolution.withdrawal_accounts, "missing"), true);
  assert.deepEqual(parsed.value.context.resolution.withdrawal_accounts.missing, []);

  const logged = (await readFile(fetchLog, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const accountRequests = logged.filter((entry) => entry.url === koiosAccountUrl);
  assert.equal(accountRequests.length, 1);
  assert.equal(accountRequests[0].method, "POST");
  assert.equal(accountRequests[0].body, koiosAccountBody);
});
