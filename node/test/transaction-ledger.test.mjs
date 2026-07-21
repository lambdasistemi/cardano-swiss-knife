import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

const run = promisify(execFile);
const packageName = "@lambdasistemi/cardano-swiss-knife";
const packedTarball = process.env.CSK_PACKAGE_TARBALL;
const transactionCbor = (await readFile(new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url), "utf8")).trim();
const fixture = JSON.parse(await readFile(new URL("./fixtures/transaction-ledger.json", import.meta.url), "utf8"));
const textEnvelope = JSON.stringify({ type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: transactionCbor });
const witnessEnvelope = JSON.stringify({ type: "TxWitness ConwayEra", description: "Ledger Cddl Format", cborHex: transactionCbor });

assert.ok(packedTarball, "CSK_PACKAGE_TARBALL must name the prebuilt npm pack artifact");

let foreignProject;

const npmEnvironment = () => ({
  ...process.env,
  HOME: foreignProject,
  npm_config_cache: join(foreignProject, ".npm-cache"),
});

const runForeignProgram = async (program) => {
  const script = join(foreignProject, "transaction-ledger-import.mjs");
  await writeFile(script, program);
  const { stdout } = await run(process.execPath, [script], { cwd: foreignProject });
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
  foreignProject = await mkdtemp(join(tmpdir(), "csk-transaction-ledger-"));
  await writeFile(join(foreignProject, "package.json"), '{"private":true,"type":"module"}\n');
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", packedTarball], {
    cwd: foreignProject,
    env: npmEnvironment(),
  });
});

after(async () => {
  if (foreignProject) await rm(foreignProject, { recursive: true, force: true });
});

test("publishes shared witness planning, validation, and script-evaluation operations", async () => {
  const exports = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(Object.keys(api)));
  `);

  for (const operation of ["planTransactionWitnesses", "validateTransaction", "evaluateTransactionScripts"]) {
    assert.ok(exports.includes(operation), `missing ${operation}`);
  }
});

test("preserves every real engine validation and script-evaluation truth state", async () => {
  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const incompleteInput = ${JSON.stringify({ cborHex: transactionCbor })};
    const completeInput = ${JSON.stringify({ cborHex: fixture.complete.transactionCbor })};
    const completeOptions = ${JSON.stringify(fixture.complete.options)};
    const invalidOptions = { ...completeOptions, context: { ...completeOptions.context, network: ${JSON.stringify(fixture.mutations.invalidNetwork)} } };
    const rejectedOptions = { ...completeOptions, context: ${JSON.stringify(fixture.mutations.rejectedContext)} };
    const failedInput = { cborHex: completeInput.cborHex.replace(${JSON.stringify(fixture.mutations.failedMint.from)}, ${JSON.stringify(fixture.mutations.failedMint.to)}) };
    const noScriptInput = ${JSON.stringify({ cborHex: fixture.noScriptTransactionCbor })};
    console.log(JSON.stringify({
      plan: await api.planTransactionWitnesses(${JSON.stringify({ textEnvelope })}),
      validation: {
        valid: await api.validateTransaction(completeInput, completeOptions),
        invalid: await api.validateTransaction(completeInput, invalidOptions),
        incomplete: await api.validateTransaction(incompleteInput),
        rejected: await api.validateTransaction(completeInput, rejectedOptions),
      },
      evaluation: {
        succeeded: await api.evaluateTransactionScripts(completeInput, completeOptions),
        failed: await api.evaluateTransactionScripts(failedInput, completeOptions),
        incomplete: await api.evaluateTransactionScripts(incompleteInput),
        rejected: await api.evaluateTransactionScripts(completeInput, rejectedOptions),
        notApplicable: await api.evaluateTransactionScripts(noScriptInput),
      },
    }));
  `);

  assert.equal(result.plan.ok, true, JSON.stringify(result.plan));
  assert.equal(result.plan.value.op, "tx.witness.plan");
  for (const operation of Object.values(result.validation)) assert.equal(operation.ok, true, JSON.stringify(operation));
  for (const operation of Object.values(result.evaluation)) assert.equal(operation.ok, true, JSON.stringify(operation));
  assert.equal(result.validation.valid.value.result.validation.status, fixture.expected.validationStatuses.valid);
  assert.equal(result.validation.invalid.value.result.validation.status, fixture.expected.validationStatuses.invalid);
  assert.equal(result.validation.incomplete.value.result.validation.status, fixture.expected.validationStatuses.incomplete);
  assert.equal(result.validation.rejected.value.result.validation.status, fixture.expected.validationStatuses.rejected);
  assert.equal(result.evaluation.succeeded.value.result.script_evaluation.status, fixture.expected.evaluationStatuses.succeeded);
  assert.equal(result.evaluation.failed.value.result.script_evaluation.status, fixture.expected.evaluationStatuses.failed);
  assert.equal(result.evaluation.incomplete.value.result.script_evaluation.status, fixture.expected.evaluationStatuses.incomplete);
  assert.equal(result.evaluation.rejected.value.result.script_evaluation.status, fixture.expected.evaluationStatuses.rejected);
  assert.equal(result.evaluation.notApplicable.value.result.script_evaluation.status, fixture.expected.evaluationStatuses.notApplicable);

  const succeeded = result.evaluation.succeeded.value.result.script_evaluation.redeemers[0];
  assert.equal(succeeded.purpose, fixture.expected.succeededRedeemer.purpose);
  assert.equal(succeeded.index, fixture.expected.succeededRedeemer.index);
  assert.equal(succeeded.status, fixture.expected.succeededRedeemer.status);
  assert.deepEqual(succeeded.evaluated_ex_units, fixture.expected.succeededRedeemer.evaluatedExUnits);

  const failed = result.evaluation.failed.value.result.script_evaluation.redeemers[0];
  assert.equal(failed.purpose, fixture.expected.failedRedeemer.purpose);
  assert.equal(failed.index, fixture.expected.failedRedeemer.index);
  assert.equal(failed.status, fixture.expected.failedRedeemer.status);
  assert.equal(failed.failure.code, fixture.expected.failedRedeemer.failureCode);
});

test("rejects a TxWitness ConwayEra envelope in every transaction slot", async () => {
  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const input = ${JSON.stringify({ textEnvelope: witnessEnvelope })};
    console.log(JSON.stringify(await Promise.all([
      api.planTransactionWitnesses(input),
      api.validateTransaction(input),
      api.evaluateTransactionScripts(input),
    ])));
  `);

  for (const operation of result) {
    assert.equal(operation.ok, false, JSON.stringify(operation));
    assert.equal(operation.error.code, "DOMAIN_ERROR");
    assert.match(operation.error.message, /TxWitness ConwayEra/);
  }
});

test("propagates packaged engine failures without a fallback ledger result", async () => {
  const engine = transactionEngine();
  const original = `${engine}.original`;
  await rename(engine, original);
  try {
    const result = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      const input = ${JSON.stringify({ cborHex: transactionCbor })};
      console.log(JSON.stringify(await Promise.all([
        api.planTransactionWitnesses(input),
        api.validateTransaction(input),
        api.evaluateTransactionScripts(input),
      ])));
    `);
    for (const operation of result) {
      assert.equal(operation.ok, false, JSON.stringify(operation));
      assert.equal(operation.error.code, "ENGINE_NOT_FOUND");
      assert.equal(Object.hasOwn(operation, "value"), false);
    }
  } finally {
    await rename(original, engine);
  }
});
