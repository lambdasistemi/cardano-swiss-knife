import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { encryptVault } from "../../lib/src/Cardano/Vault.js";

const cli = new URL("../dist/csk.mjs", import.meta.url);
const vectors = JSON.parse(await readFile(new URL("../../test-vectors/vectors.json", import.meta.url), "utf8"));
const mnemonic = vectors.derivationVectors[0].mnemonic.join(" ");
const derivation = vectors.derivationVectors[0];
const bootstrap = vectors.bootstrapVectors[0];
const byron = vectors.bootstrapVectors.find((vector) => vector.style === "Byron" && vector.rootXPubBech32 && vector.derivationPath);
const signing = vectors.signingVectors[0];
const transactionCbor = (await readFile(new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url), "utf8")).trim();
const textEnvelope = JSON.stringify({ type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: transactionCbor });
const witnessFixture = JSON.parse(await readFile(new URL("./fixtures/transaction-witnesses.json", import.meta.url), "utf8"));
const runRaw = (args, input = "", inheritedFd, env) => new Promise((resolve) => {
  const child = spawn(process.execPath, [cli.pathname, ...args], { env: { ...process.env, ...env }, stdio: inheritedFd === undefined ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(input);
  if (inheritedFd !== undefined) {
    child.stdio[3].on("error", () => {});
    child.stdio[3].end(inheritedFd);
  }
});
let commandQueue = Promise.resolve();
const exclusive = (operation) => {
  const queued = commandQueue.then(operation);
  commandQueue = queued.catch(() => {});
  return queued;
};
const run = (args, input = "", inheritedFd, env) => exclusive(() => runRaw(args, input, inheritedFd, env));
const json = (args, input = "", inheritedFd, env) => run([...args, "--output", "json"], input, inheritedFd, env);
const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((chunk) => Number.parseInt(chunk, 16)));
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const skipCbor = (bytes, start) => {
  const additional = bytes[start] & 0x1f; const major = bytes[start] >> 5;
  const length = additional < 24 ? additional : additional === 24 ? bytes[start + 1] : additional === 25 ? (bytes[start + 1] << 8) | bytes[start + 2] : additional === 26 ? bytes[start + 1] * 0x1000000 + (bytes[start + 2] << 16) + (bytes[start + 3] << 8) + bytes[start + 4] : additional === 27 ? Number(bytes.slice(start + 1, start + 9).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n)) : additional === 31 ? null : (() => { throw Error("fixture CBOR is unsupported"); })();
  const body = start + (additional < 24 ? 1 : additional === 24 ? 2 : additional === 25 ? 3 : additional === 26 ? 5 : additional === 27 ? 9 : 1);
  if (major === 0 || major === 1 || major === 7) return body;
  if (major === 2 || major === 3) { if (length !== null) return body + length; let offset = body; while (bytes[offset] !== 0xff) offset = skipCbor(bytes, offset); return offset + 1; }
  if (major === 6) return skipCbor(bytes, body);
  let offset = body; const items = major === 5 && length !== null ? length * 2 : length;
  if (items === null) { while (bytes[offset] !== 0xff) offset = skipCbor(bytes, offset); return offset + 1; }
  for (let index = 0; index < items; index += 1) offset = skipCbor(bytes, offset); return offset;
};
const withoutRequiredSigner = (transaction) => {
  const bytes = hexToBytes(transaction); const entries = bytes[1] & 0x1f; let offset = 2;
  for (let index = 0; index < entries; index += 1) { const keyOffset = offset; const key = bytes[keyOffset]; offset = skipCbor(bytes, keyOffset); const valueEnd = skipCbor(bytes, offset); if (key === 14) { const patched = new Uint8Array(bytes.length - (valueEnd - keyOffset)); patched.set(bytes.slice(0, keyOffset)); patched[1] -= 1; patched.set(bytes.slice(valueEnd), keyOffset); return hex(patched); } offset = valueEnd; }
  return transaction;
};
const withRequiredSigner = (transaction, signerHash) => {
  const bytes = hexToBytes(withoutRequiredSigner(transaction)); const entries = bytes[1] & 0x1f; let offset = 2;
  for (let index = 0; index < entries; index += 1) { offset = skipCbor(bytes, skipCbor(bytes, offset)); }
  const required = Uint8Array.from([0x0e, 0x81, 0x58, 0x1c, ...hexToBytes(signerHash)]);
  const patched = new Uint8Array(bytes.length + required.length); patched.set(bytes.slice(0, offset)); patched[1] += 1; patched.set(required, offset); patched.set(bytes.slice(offset), offset + required.length); return hex(patched);
};

test("routes all fourteen offline inventory mappings and renders stable human and JSON results", async () => {
  const commands = [
    [["address", "inspect", "--address", vectors.inspectionVectors[0].address]],
    [["mnemonic", "generate", "--word-count", "12"]],
    [["mnemonic", "validate", "--secret-stdin"], `${mnemonic}\n`],
    [["key", "derive", "--secret-stdin", "--account-index", String(derivation.accountIndex), "--role", derivation.role, "--address-index", String(derivation.addressIndex)], `${mnemonic}\n`],
    [["key", "address", "shelley", "--network", "mainnet", "--payment-xpub", derivation.expected.addressPublicKeyBech32, "--stake-xpub", derivation.expected.stakePublicKeyBech32]],
    [["key", "address", "icarus", "--network", bootstrap.network, "--address-xpub", bootstrap.addressXPubBech32]],
    [["key", "address", "byron", "--network", byron.network, "--address-xpub", byron.addressXPubBech32, "--root-xpub", byron.rootXPubBech32, "--derivation-path", JSON.stringify(byron.derivationPath)]],
    [["key", "restore", "icarus", "--secret-stdin", "--network", "mainnet", "--account-index", "0", "--role", "external", "--address-index", "0"], `${mnemonic}\n`],
    [["key", "restore", "byron", "--secret-stdin", "--network", "mainnet", "--account-index", "0", "--address-index", "0"], `${mnemonic}\n`],
    [["script", "inspect", "--cbor-hex", vectors.scriptHashVectors[0].scriptCborHex]],
    [["script", "author", "--json", vectors.scriptHashVectors[0].scriptJson]],
    [["script", "template", "--json", vectors.scriptTemplateVectors[0].expected.canonicalTemplateJson]],
    [["payload", "sign", "--secret-stdin", "--payload-mode", signing.payloadMode, "--payload-input", signing.payloadInput], `${signing.signingKeyBech32}\n`],
    [["payload", "verify", "--payload-mode", signing.payloadMode, "--payload-input", signing.payloadInput, "--verification-key", signing.verificationKeyBech32, "--signature", signing.signatureHex]],
  ];
  for (const [args, input = ""] of commands) {
    const human = await run(args, input);
    assert.equal(human.code, 0, `${args.join(" ")}: ${human.stderr}`);
    assert.match(human.stdout, /\S/);
    const machine = await json(args, input);
    assert.equal(machine.code, 0, `${args.join(" ")} --json: ${machine.stderr}`);
    assert.deepEqual(Object.keys(JSON.parse(machine.stdout)).sort(), ["ok", "value", "version"]);
  }
});

test("rejects argv secrets, maps usage/domain/secret/engine failures, and redacts the rejected mnemonic", async () => {
  const argvSecret = await run(["mnemonic", "validate", "--mnemonic", mnemonic]);
  assert.equal(argvSecret.code, 2);
  assert.doesNotMatch(`${argvSecret.stdout}${argvSecret.stderr}`, new RegExp(mnemonic));
  const domain = await json(["address", "inspect", "--address", "not-an-address"]);
  assert.equal(domain.code, 3); assert.equal(JSON.parse(domain.stdout).error.code, "DOMAIN_ERROR");
  const secret = await json(["key", "derive", "--secret-fd", "99", "--account-index", "0", "--role", "external", "--address-index", "0"]);
  assert.equal(secret.code, 4); assert.equal(JSON.parse(secret.stdout).error.code, "SECRET_SOURCE");
  for (const result of [argvSecret, domain, secret]) assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(signing.signingKeyBech32));
});

test("maps a missing package-relative engine to the typed engine exit", { concurrency: false }, async () => {
  await exclusive(async () => {
    const engine = new URL("../dist/cardano-addresses.wasm", import.meta.url);
    const hidden = new URL("../dist/cardano-addresses.wasm.hidden", import.meta.url);
    await rename(engine, hidden);
    try {
      const result = await runRaw(["address", "inspect", "--address", vectors.inspectionVectors[0].address, "--output", "json"]);
      assert.equal(result.code, 5); assert.match(JSON.parse(result.stdout).error.code, /^ENGINE_/);
      const invalid = await runRaw(["address", "inspect", "--address", "not-an-address", "--output", "json"]);
      assert.equal(invalid.code, 5);
      assert.match(JSON.parse(invalid.stdout).error.code, /^ENGINE_/);
    } finally {
      await rename(hidden, engine);
    }

    const emptySecret = await runRaw(["mnemonic", "validate", "--secret-stdin", "--output", "json"]);
    assert.equal(emptySecret.code, 4);
    assert.equal(JSON.parse(emptySecret.stdout).error.code, "SECRET_SOURCE");

    const conversion = await runRaw(["key", "address", "byron", "--network", "mainnet", "--address-xpub", byron.addressXPubBech32, "--root-xpub", byron.rootXPubBech32, "--derivation-path", "not-json", "--output", "json"]);
    assert.equal(conversion.code, 3);
    assert.equal(JSON.parse(conversion.stdout).error.code, "DOMAIN_ERROR");
  });
});

test("reads a mnemonic from a genuinely inherited secret FD", async () => {
  const result = await run(["key", "derive", "--secret-fd", "3", "--account-index", "0", "--role", "external", "--address-index", "0"], "", `${mnemonic}\n`);
  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(mnemonic));
});

test("selects a canonical #69 vault entry using an inherited passphrase FD", async () => {
  const dir = await mkdtemp(join(tmpdir(), "csk-cli-vault-source-"));
  const vault = join(dir, "canonical.age");
  const passphrase = "cli test vault passphrase";
  try {
    await writeFile(vault, await encryptVault(passphrase, { cardanoSwissKnifeVault: { version: 1, entries: [{ id: "test-mnemonic", kind: "mnemonic", label: "test", value: mnemonic, createdAt: "2026-07-20T00:00:00.000Z" }] } }));
    const result = await run(["key", "derive", "--vault", vault, "--vault-entry", "test-mnemonic", "--passphrase-fd", "3", "--account-index", "0", "--role", "external", "--address-index", "0"], "", `${passphrase}\n`);
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${mnemonic}|${passphrase}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("preserves the #69 vault command family", async () => {
  for (const flag of ["--help", "-h"]) {
    const help = await run([flag]);
    assert.equal(help.code, 0); assert.match(help.stdout, /address inspect/); assert.match(help.stdout, /vault create/);
  }
  const result = await run(["vault", "--help"]);
  assert.equal(result.code, 0); assert.match(result.stdout, /vault create/);
});

test("routes all transaction commands from raw CBOR and TextEnvelope files with stable human and JSON envelopes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "csk-cli-tx-"));
  const raw = join(dir, "transaction.cbor");
  const envelope = join(dir, "transaction.json");
  const firstBook = join(dir, "first-book.ttl");
  const secondBook = join(dir, "second-book.ttl");
  try {
    await Promise.all([
      writeFile(raw, `${transactionCbor}\n`),
      writeFile(envelope, textEnvelope),
      writeFile(firstBook, "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<urn:csk:first> rdfs:label \"First CLI book\" .\n"),
      writeFile(secondBook, "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<urn:csk:second> rdfs:label \"Second CLI book\" .\n"),
    ]);
    for (const [command, extra = []] of [["inspect"], ["browse", ["--path", '["body","fee"]']], ["identify"], ["intent"]]) {
      const args = ["tx", command, "--tx-file", raw, "--book", firstBook, "--book", secondBook, ...extra];
      const human = await run(args);
      assert.equal(human.code, 0, `${args.join(" ")}: ${human.stderr}`);
      assert.match(human.stdout, /\S/);
      const machine = await json(args);
      assert.equal(machine.code, 0, `${args.join(" ")} --output json: ${machine.stderr}`);
      const value = JSON.parse(machine.stdout).value;
      assert.equal(value.books[0].source, "turtle");
      assert.equal(value.books[1].source, "turtle");
      assert.equal(value.books[0].turtle.includes("First CLI book"), true);
      assert.equal(value.books[1].turtle.includes("Second CLI book"), true);
    }
    const rawResult = await json(["tx", "inspect", "--cbor-hex", transactionCbor]);
    const envelopeResult = await json(["tx", "inspect", "--tx-file", envelope]);
    assert.equal(rawResult.code, 0, rawResult.stderr);
    assert.equal(envelopeResult.code, 0, envelopeResult.stderr);
    assert.deepEqual(JSON.parse(envelopeResult.stdout), JSON.parse(rawResult.stdout));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("enforces transaction source, browse path, and typed usage, domain, secret, provider, engine, and book exits", async () => {
  const missingSource = await json(["tx", "inspect"]);
  assert.equal(missingSource.code, 2); assert.equal(JSON.parse(missingSource.stdout).error.code, "USAGE");
  const multipleSources = await json(["tx", "inspect", "--cbor-hex", transactionCbor, "--tx-file", "ignored"]);
  assert.equal(multipleSources.code, 2); assert.equal(JSON.parse(multipleSources.stdout).error.code, "USAGE");
  const missingPath = await json(["tx", "browse", "--cbor-hex", transactionCbor]);
  assert.equal(missingPath.code, 2); assert.equal(JSON.parse(missingPath.stdout).error.code, "USAGE");
  const strayPath = await json(["tx", "inspect", "--cbor-hex", transactionCbor, "--path", "body"]);
  assert.equal(strayPath.code, 2); assert.equal(JSON.parse(strayPath.stdout).error.code, "USAGE");
  const badCbor = await json(["tx", "inspect", "--cbor-hex", "not-cbor"]);
  assert.equal(badCbor.code, 3); assert.equal(JSON.parse(badCbor.stdout).error.code, "DOMAIN_ERROR");
  const missingVault = await json(["tx", "inspect", "--tx-hash", "a".repeat(64), "--provider", "blockfrost", "--network", "mainnet"]);
  assert.equal(missingVault.code, 4); assert.equal(JSON.parse(missingVault.stdout).error.code, "SECRET_SOURCE");
  const badBook = await json(["tx", "inspect", "--cbor-hex", transactionCbor, "--book", "/missing/book.ttl"]);
  assert.equal(badBook.code, 7); assert.equal(JSON.parse(badBook.stdout).error.code, "BOOK_IMPORT");
  const engine = new URL("../dist/wasm-tx-inspector.wasm", import.meta.url);
  const hidden = new URL("../dist/wasm-tx-inspector.wasm.hidden", import.meta.url);
  await rename(engine, hidden);
  try {
    const missingEngine = await json(["tx", "inspect", "--cbor-hex", transactionCbor]);
    assert.equal(missingEngine.code, 5); assert.match(JSON.parse(missingEngine.stdout).error.code, /^ENGINE_/);
  } finally { await rename(hidden, engine); }
});

test("selects only matching transaction vault entry kinds and never exposes provider credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "csk-cli-tx-vault-"));
  const vault = join(dir, "credentials.age");
  const passphrase = "tx vault passphrase";
  const blockfrostSecret = "blockfrost-project-id-secret";
  const koiosSecret = "koios-bearer-token-secret";
  const capture = join(dir, "child-process.json");
  const guard = join(dir, "network-denied.mjs");
  try {
    await writeFile(guard, `import { writeFile } from "node:fs/promises"; await writeFile(process.env.CSK_TEST_CAPTURE, JSON.stringify({ argv: process.argv, env: process.env })); globalThis.fetch = async () => ({ status: 401, text: async () => "denied" });`);
    const guarded = { NODE_OPTIONS: `--import ${new URL(`file://${guard}`).href}`, CSK_TEST_CAPTURE: capture };
    await writeFile(vault, await encryptVault(passphrase, { cardanoSwissKnifeVault: { version: 1, entries: [
      { id: "wrong", kind: "mnemonic", label: "wrong", value: blockfrostSecret, createdAt: "2026-07-20T00:00:00.000Z" },
      { id: "blockfrost", kind: "blockfrost-project-id", label: "blockfrost", value: blockfrostSecret, createdAt: "2026-07-20T00:00:00.000Z" },
      { id: "koios", kind: "koios-bearer-token", label: "koios", value: koiosSecret, createdAt: "2026-07-20T00:00:00.000Z" },
    ] } }));
    const wrong = await json(["tx", "inspect", "--tx-hash", "a".repeat(64), "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "wrong", "--passphrase-fd", "3"], "", `${passphrase}\n`, guarded);
    assert.equal(wrong.code, 4); assert.equal(JSON.parse(wrong.stdout).error.code, "SECRET_SOURCE");
    const blockfrost = await json(["tx", "inspect", "--tx-hash", "a".repeat(64), "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "blockfrost", "--passphrase-fd", "3"], "", `${passphrase}\n`, guarded);
    const koios = await json(["tx", "inspect", "--tx-hash", "a".repeat(64), "--provider", "koios", "--network", "mainnet", "--vault", vault, "--vault-entry", "koios", "--passphrase-fd", "3"], "", `${passphrase}\n`, guarded);
    const anonymous = await json(["tx", "inspect", "--tx-hash", "a".repeat(64), "--provider", "koios", "--network", "mainnet"], "", undefined, guarded);
    for (const result of [blockfrost, koios, anonymous]) { assert.equal(result.code, 6); assert.equal(JSON.parse(result.stdout).error.code, "PROVIDER_AUTHENTICATION"); }
    const child = await readFile(capture, "utf8");
    for (const result of [wrong, blockfrost, koios, anonymous, { stdout: child, stderr: "" }]) assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${blockfrostSecret}|${koiosSecret}|${passphrase}`));
    const leaked = (await Promise.all((await readdir(dir)).map((entry) => readFile(join(dir, entry), "utf8").catch(() => "")))).join("");
    assert.doesNotMatch(leaked, new RegExp(`${blockfrostSecret}|${koiosSecret}|${passphrase}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("routes witness planning, attachment, validation, and script evaluation through the shared transaction API", async () => {
  const dir = await mkdtemp(join(tmpdir(), "csk-cli-ledger-"));
  const txFile = join(dir, "transaction.cbor");
  const envelopeFile = join(dir, "transaction.json");
  const vault = join(dir, "signing.age");
  const txOut = join(dir, "signed.json");
  const witnessOut = join(dir, "witness.json");
  const rawWitness = join(dir, "witness.cbor");
  const rawWitnessOut = join(dir, "witness-from-raw.json");
  const passphrase = "S4_PASSPHRASE_SENTINEL_MUST_NOT_ESCAPE";
  const secret = witnessFixture.secretSentinel;
  try {
    const requiredTransaction = withRequiredSigner(transactionCbor, witnessFixture.requiredSignerHash);
    const api = await import(new URL("../dist/index.js", import.meta.url));
    const identified = await api.identifyTransaction({ cborHex: requiredTransaction });
    const prepared = await api.prepareTransactionWitness({ bodyHashHex: identified.value.result.identification.body_hash, signingKeyBech32: witnessFixture.signingKey });
    const detached = join(dir, "detached.json");
    await Promise.all([
      writeFile(txFile, `${requiredTransaction}\n`),
      writeFile(envelopeFile, textEnvelope),
      writeFile(detached, JSON.stringify(prepared.value.textEnvelope)),
      writeFile(rawWitness, `${prepared.value.vkeyWitnessCborHex}\n`),
      writeFile(vault, await encryptVault(passphrase, { cardanoSwissKnifeVault: { version: 1, entries: [
        { id: "signing", kind: "signing-key", label: "signing", value: witnessFixture.signingKey, createdAt: "2026-07-21T00:00:00.000Z" },
        { id: "wrong", kind: "mnemonic", label: "wrong", value: secret, createdAt: "2026-07-21T00:00:00.000Z" },
        { id: "blockfrost", kind: "blockfrost-project-id", label: "blockfrost", value: "S4_BLOCKFROST_SENTINEL", createdAt: "2026-07-21T00:00:00.000Z" },
      ] } })),
    ]);

    for (const [command, field] of [["witness", "witness_plan"], ["validate", "validation"], ["evaluate-scripts", "script_evaluation"]]) {
      const args = command === "witness" ? ["tx", "witness", "plan", "--tx-file", txFile] : ["tx", command, "--tx-file", txFile];
      const human = await run(args);
      const machine = await json(args);
      assert.equal(human.code, 0, `${args.join(" ")}: ${human.stderr}`);
      assert.equal(machine.code, 0, `${args.join(" ")} --output json: ${machine.stderr}`);
      assert.match(human.stdout, /\S/);
      assert.deepEqual(JSON.parse(human.stdout), JSON.parse(machine.stdout).value);
      assert.equal(JSON.parse(machine.stdout).value.result[field] !== undefined, true);
    }

    const fromEnvelope = await json(["tx", "witness", "plan", "--tx-file", envelopeFile]);
    const fromRaw = await json(["tx", "witness", "plan", "--cbor-hex", transactionCbor]);
    assert.equal(fromEnvelope.code, 0, fromEnvelope.stderr);
    assert.deepEqual(JSON.parse(fromEnvelope.stdout), JSON.parse(fromRaw.stdout));

    const attached = await json(["tx", "witness", "attach", "--tx-file", txFile, "--witness-file", detached, "--tx-out", txOut, "--witness-out", witnessOut]);
    assert.equal(attached.code, 0, `${attached.stderr}${attached.stdout}`);
    assert.equal(JSON.parse(attached.stdout).value.textEnvelope.type, "Tx ConwayEra");
    assert.equal(JSON.parse(await readFile(txOut, "utf8")).type, "Tx ConwayEra");
    assert.equal(JSON.parse(await readFile(witnessOut, "utf8")).type, "TxWitness ConwayEra");

    const attachedRaw = await json(["tx", "witness", "attach", "--tx-file", txFile, "--witness-file", rawWitness, "--witness-out", rawWitnessOut]);
    assert.equal(attachedRaw.code, 0, `${attachedRaw.stderr}${attachedRaw.stdout}`);
    assert.equal(JSON.parse(await readFile(rawWitnessOut, "utf8")).type, "TxWitness ConwayEra");

    const replacementRefused = await json(["tx", "witness", "attach", "--tx-file", txOut, "--vault", vault, "--vault-entry", "signing", "--passphrase-fd", "3"], "", `${passphrase}\n`);
    assert.notEqual(replacementRefused.code, 0);
    assert.equal(JSON.parse(replacementRefused.stdout).error.code, "WITNESS_REPLACEMENT_FORBIDDEN", replacementRefused.stdout);
    const replaced = await json(["tx", "witness", "attach", "--tx-file", txOut, "--vault", vault, "--vault-entry", "signing", "--passphrase-fd", "3", "--replace-existing"], "", `${passphrase}\n`);
    assert.equal(replaced.code, 0, replaced.stderr);
    assert.equal(JSON.parse(replaced.stdout).value.witnessPatchAction, "replaced");

    const incompatible = await json(["tx", "witness", "attach", "--tx-file", txFile, "--vault", vault, "--vault-entry", "wrong", "--passphrase-fd", "3"], "", `${passphrase}\n`);
    assert.equal(incompatible.code, 4);
    assert.equal(JSON.parse(incompatible.stdout).error.code, "SECRET_SOURCE");
    for (const result of [attached, replacementRefused, replaced, incompatible]) assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${secret}|${passphrase}|${witnessFixture.signingKey}`));

    const capture = join(dir, "child-process.json");
    const guard = join(dir, "capture.mjs");
    await writeFile(guard, `import { writeFile } from "node:fs/promises"; await writeFile(process.env.CSK_TEST_CAPTURE, JSON.stringify({ argv: process.argv, env: process.env })); globalThis.fetch = async () => ({ status: 401, text: async () => "denied" });`);
    const guarded = { NODE_OPTIONS: `--import ${new URL(`file://${guard}`).href}`, CSK_TEST_CAPTURE: capture };
    const guardedAttach = await json(["tx", "witness", "attach", "--tx-file", txFile, "--vault", vault, "--vault-entry", "signing", "--passphrase-fd", "3"], "", `${passphrase}\n`, guarded);
    assert.equal(guardedAttach.code, 0, guardedAttach.stderr);
    const captured = await readFile(capture, "utf8");
    const temporaryContents = (await Promise.all((await readdir(dir)).map((entry) => readFile(join(dir, entry), "utf8").catch(() => "")))).join("");
    for (const value of [secret, passphrase, witnessFixture.signingKey]) assert.doesNotMatch(`${captured}${temporaryContents}`, new RegExp(value));

    const hashWithWitness = await json(["tx", "witness", "attach", "--tx-hash", "a".repeat(64), "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "blockfrost", "--passphrase-fd", "3", "--witness-file", detached], "", `${passphrase}\n`, guarded);
    assert.equal(hashWithWitness.code, 6, `${hashWithWitness.stderr}${hashWithWitness.stdout}`);
    assert.equal(JSON.parse(hashWithWitness.stdout).error.code, "PROVIDER_AUTHENTICATION");

    for (const args of [
      ...["witness", "validate", "evaluate-scripts"].map((command) => command === "witness"
        ? ["tx", "witness", "plan", "--cbor-hex", transactionCbor, "--tx-hash", "a".repeat(64), "--provider", "koios", "--network", "mainnet"]
        : ["tx", command, "--cbor-hex", transactionCbor, "--tx-hash", "a".repeat(64), "--provider", "koios", "--network", "mainnet"]),
      ["tx", "witness", "attach", "--tx-file", txFile, "--witness-file", witnessOut, "--vault", vault, "--vault-entry", "signing"],
      ["tx", "witness", "attach", "--tx-file", txFile],
      ["tx", "witness", "attach", "--tx-file", txFile, "--witness-file", detached, "--passphrase-fd", "3"],
      ["tx", "witness", "attach", "--tx-hash", "a".repeat(64), "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "signing"],
    ]) {
      const result = await json(args);
      assert.equal(result.code, 2, `${args.join(" ")}: ${result.stderr}`);
      assert.equal(JSON.parse(result.stdout).error.code, "USAGE");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
