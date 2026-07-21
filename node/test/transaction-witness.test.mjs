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
const fixture = JSON.parse(await readFile(new URL("./fixtures/transaction-witnesses.json", import.meta.url), "utf8"));
const baseTransaction = (await readFile(new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url), "utf8")).trim();

assert.ok(packedTarball, "CSK_PACKAGE_TARBALL must name the prebuilt npm pack artifact");

let foreignProject;

const npmEnvironment = () => ({
  ...process.env,
  HOME: foreignProject,
  npm_config_cache: join(foreignProject, ".npm-cache"),
});

const runForeignProgram = async (program) => {
  const script = join(foreignProject, "transaction-witness-import.mjs");
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

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((chunk) => Number.parseInt(chunk, 16)));
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const readCborLength = (bytes, start, additional) => {
  if (additional < 24) return { length: additional, offset: start };
  if (additional === 24) return { length: bytes[start], offset: start + 1 };
  if (additional === 25) return { length: (bytes[start] << 8) | bytes[start + 1], offset: start + 2 };
  if (additional === 26) return { length: bytes[start] * 0x1000000 + (bytes[start + 1] << 16) + (bytes[start + 2] << 8) + bytes[start + 3], offset: start + 4 };
  if (additional === 27) return { length: Number(bytes.slice(start, start + 8).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n)), offset: start + 8 };
  if (additional === 31) return { length: null, offset: start };
  throw new Error("Unsupported CBOR length.");
};

const skipCborItem = (bytes, start) => {
  const { length, offset: body } = readCborLength(bytes, start + 1, bytes[start] & 0x1f);
  const major = bytes[start] >> 5;
  if (major === 0 || major === 1 || major === 7) return body;
  if (major === 2 || major === 3) {
    if (length !== null) return body + length;
    let offset = body; while (bytes[offset] !== 0xff) offset = skipCborItem(bytes, offset); return offset + 1;
  }
  let offset = body;
  const items = major === 5 && length !== null ? length * 2 : length;
  if (major === 4 || major === 5) {
    if (items === null) { while (bytes[offset] !== 0xff) offset = skipCborItem(bytes, offset); return offset + 1; }
    for (let index = 0; index < items; index += 1) offset = skipCborItem(bytes, offset);
    return offset;
  }
  if (major === 6) return skipCborItem(bytes, body);
  throw new Error("Unsupported CBOR item.");
};

const addRequiredSigners = (transactionCbor, signerHashes) => {
  const bytes = hexToBytes(removeRequiredSigners(transactionCbor));
  assert.equal(bytes[0], 0x84, "fixture must use a four-item transaction array");
  const mapHeader = bytes[1];
  assert.equal(mapHeader >> 5, 5, "fixture body must be a CBOR map");
  const entries = mapHeader & 0x1f;
  assert.ok(entries < 23, "fixture body must use a short map");
  let offset = 2;
  let insertion = null;
  for (let index = 0; index < entries; index += 1) {
    const keyOffset = offset;
    const key = bytes[keyOffset];
    assert.ok(key <= 0x17, "fixture body must use small integer keys");
    if (insertion === null && key > 14) insertion = keyOffset;
    offset = skipCborItem(bytes, keyOffset);
    offset = skipCborItem(bytes, offset);
  }
  const target = insertion ?? offset;
  assert.ok(signerHashes.length > 0 && signerHashes.length < 24, "fixture must declare between one and 23 required signers");
  const requiredSigners = Uint8Array.from([0x0e, 0x80 + signerHashes.length, ...signerHashes.flatMap((hash) => [0x58, 0x1c, ...hexToBytes(hash)])]);
  const patched = new Uint8Array(bytes.length + requiredSigners.length);
  patched.set(bytes.slice(0, target));
  patched[1] = mapHeader + 1;
  patched.set(requiredSigners, target);
  patched.set(bytes.slice(target), target + requiredSigners.length);
  return hex(patched);
};

const removeRequiredSigners = (transactionCbor) => {
  const bytes = hexToBytes(transactionCbor);
  assert.equal(bytes[0], 0x84, "fixture must use a four-item transaction array");
  const mapHeader = bytes[1];
  assert.equal(mapHeader >> 5, 5, "fixture body must be a CBOR map");
  const entries = mapHeader & 0x1f;
  assert.ok(entries < 23, "fixture body must use a short map");
  let offset = 2;
  for (let index = 0; index < entries; index += 1) {
    const keyOffset = offset;
    const key = bytes[keyOffset];
    offset = skipCborItem(bytes, keyOffset);
    const valueEnd = skipCborItem(bytes, offset);
    if (key === 14) {
      const patched = new Uint8Array(bytes.length - (valueEnd - keyOffset));
      patched.set(bytes.slice(0, keyOffset));
      patched[1] = mapHeader - 1;
      patched.set(bytes.slice(valueEnd), keyOffset);
      return hex(patched);
    }
    offset = valueEnd;
  }
  return transactionCbor;
};

before(async () => {
  foreignProject = await mkdtemp(join(tmpdir(), "csk-transaction-witness-"));
  await writeFile(join(foreignProject, "package.json"), '{"private":true,"type":"module"}\n');
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", packedTarball], {
    cwd: foreignProject,
    env: npmEnvironment(),
  });
});

after(async () => {
  if (foreignProject) await rm(foreignProject, { recursive: true, force: true });
});

test("publishes detached witness attachment as a stable result-envelope operation", async () => {
  const exports = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(Object.keys(api)));
  `);

  for (const operation of ["prepareTransactionWitness", "attachTransactionWitness"]) {
    assert.ok(exports.includes(operation), `missing ${operation}`);
  }
});

test("attaches raw and TxWitness ConwayEra witnesses through the real engine with exact safety transitions", async () => {
  const transactionCbor = addRequiredSigners(baseTransaction, [fixture.requiredSignerHash, fixture.nonTargetSignerHash]);
  const result = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const transaction = ${JSON.stringify({ cborHex: transactionCbor })};
    const identify = await api.identifyTransaction(transaction);
    const prepared = await api.prepareTransactionWitness({ bodyHashHex: identify.value.result.identification.body_hash, signingKeyBech32: ${JSON.stringify(fixture.signingKey)} });
    const nonTarget = await api.prepareTransactionWitness({ bodyHashHex: identify.value.result.identification.body_hash, signingKeyBech32: ${JSON.stringify(fixture.nonTargetSigningKey)} });
    const unrelated = await api.prepareTransactionWitness({ bodyHashHex: identify.value.result.identification.body_hash, signingKeyBech32: ${JSON.stringify(fixture.unrelatedSigningKey)} });
    const preexisting = await api.attachTransactionWitness(transaction, { cborHex: nonTarget.value.vkeyWitnessCborHex });
    const beforePlan = await api.planTransactionWitnesses({ cborHex: preexisting.value.signedTxCborHex });
    const inserted = await api.attachTransactionWitness({ cborHex: preexisting.value.signedTxCborHex }, { cborHex: prepared.value.vkeyWitnessCborHex });
    const replacementRefused = await api.attachTransactionWitness({ cborHex: inserted.value.signedTxCborHex }, { cborHex: prepared.value.vkeyWitnessCborHex });
    const replaced = await api.attachTransactionWitness({ cborHex: inserted.value.signedTxCborHex }, { textEnvelope: prepared.value.textEnvelope }, { replaceExisting: true });
    const unrelatedResult = await api.attachTransactionWitness(transaction, { cborHex: unrelated.value.vkeyWitnessCborHex });
    const afterPlan = await api.planTransactionWitnesses({ cborHex: inserted.value.signedTxCborHex });
    const malformed = await api.attachTransactionWitness(transaction, { cborHex: "not-cbor" });
    const wrongType = await api.attachTransactionWitness(transaction, { textEnvelope: { type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: prepared.value.vkeyWitnessCborHex } });
    console.log(JSON.stringify({ identify, prepared, nonTarget, preexisting, beforePlan, inserted, replacementRefused, replaced, unrelatedResult, afterPlan, malformed, wrongType }));
  `);

  for (const operation of [result.identify, result.prepared, result.nonTarget, result.preexisting, result.beforePlan, result.inserted, result.replaced, result.afterPlan]) {
    assert.equal(operation.ok, true, JSON.stringify(operation));
  }
  assert.equal(result.inserted.value.witnessPatchAction, "inserted");
  assert.equal(result.replaced.value.witnessPatchAction, "replaced");
  assert.equal(result.inserted.value.textEnvelope.type, "Tx ConwayEra");
  assert.equal(result.inserted.value.textEnvelope.cborHex, result.inserted.value.signedTxCborHex);
  assert.equal(result.prepared.value.textEnvelope.type, "TxWitness ConwayEra");
  assert.equal(result.replacementRefused.ok, false, JSON.stringify(result.replacementRefused));
  assert.equal(result.replacementRefused.error.code, "WITNESS_REPLACEMENT_FORBIDDEN");
  assert.equal(Object.hasOwn(result.replacementRefused, "value"), false);
  assert.equal(result.unrelatedResult.ok, false, JSON.stringify(result.unrelatedResult));
  assert.equal(result.unrelatedResult.error.code, "WITNESS_UNRELATED_SIGNER");
  for (const typedFailure of [result.malformed, result.wrongType]) {
    assert.equal(typedFailure.ok, false, JSON.stringify(typedFailure));
    assert.equal(Object.hasOwn(typedFailure, "value"), false, JSON.stringify(typedFailure));
  }
  const before = result.beforePlan.value.result.witness_plan;
  const after = result.afterPlan.value.result.witness_plan;
  assert.equal(after.body_hash, before.body_hash, "attachment must preserve transaction body identity");
  assert.deepEqual(
    after.present_vkey_witnesses.filter((entry) => entry.hash !== result.prepared.value.signerHashHex),
    before.present_vkey_witnesses,
    "attachment changed the pre-existing non-target vkey witness"
  );
  for (const field of ["scripts", "datums", "redeemers"]) assert.deepEqual(after[field], before[field], `attachment changed non-target ${field}`);
});

test("engine failures and synthetic secret sentinels remain typed and secret-free", async () => {
  const transactionCbor = addRequiredSigners(baseTransaction, [fixture.requiredSignerHash]);
  const prepared = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    const transaction = ${JSON.stringify({ cborHex: transactionCbor })};
    const identify = await api.identifyTransaction(transaction);
    const result = await api.prepareTransactionWitness({ bodyHashHex: identify.value.result.identification.body_hash, signingKeyBech32: ${JSON.stringify(fixture.signingKey)} });
    console.log(JSON.stringify(result));
  `);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const serializedPreparation = JSON.stringify(prepared);
  assert.equal(serializedPreparation.includes(fixture.signingKey), false, "signing key leaked from structured preparation result");
  const invalidPreparation = await runForeignProgram(`
    import * as api from ${JSON.stringify(packageName)};
    console.log(JSON.stringify(await api.prepareTransactionWitness({ bodyHashHex: "00".repeat(32), signingKeyBech32: ${JSON.stringify(fixture.secretSentinel)} })));
  `);
  assert.equal(invalidPreparation.ok, false, JSON.stringify(invalidPreparation));
  assert.equal(JSON.stringify(invalidPreparation).includes(fixture.secretSentinel), false, "synthetic secret sentinel leaked from preparation diagnostic");

  const engine = transactionEngine();
  const original = `${engine}.original`;
  await rename(engine, original);
  try {
    const result = await runForeignProgram(`
      import * as api from ${JSON.stringify(packageName)};
      console.log(JSON.stringify(await api.attachTransactionWitness(${JSON.stringify({ cborHex: transactionCbor })}, { cborHex: ${JSON.stringify(prepared.value.vkeyWitnessCborHex)} } )));
    `);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.error.code, "ENGINE_NOT_FOUND");
    assert.equal(JSON.stringify(result).includes(fixture.signingKey), false, "engine diagnostic leaked signing key");
  } finally {
    await rename(original, engine);
  }
});
