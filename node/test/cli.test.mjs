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
const transactionFixture = new URL("../../docs/inspector/tests/fixtures/treasury-reorganize-unsigned-tx.hex", import.meta.url);
const stagedTransactionFixture = new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url);
const transactionCbor = (await readFile(transactionFixture, "utf8").catch((error) => {
  if (error?.code !== "ENOENT") throw error;
  return readFile(stagedTransactionFixture, "utf8");
})).trim();
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

test("enriches every local CLI transaction source through the shared provider context without leaking vault secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "csk-cli-local-provider-"));
  const raw = join(dir, "transaction.cbor");
  const envelope = join(dir, "transaction.json");
  const vault = join(dir, "credentials.age");
  const capture = join(dir, "provider-capture.json");
  const guard = join(dir, "provider-guard.mjs");
  const passphrase = "local provider vault passphrase";
  const blockfrostSecret = "CSK_LOCAL_BLOCKFROST_SECRET";
  const koiosSecret = "CSK_LOCAL_KOIOS_SECRET";
  try {
    await Promise.all([
      writeFile(raw, `${transactionCbor}\n`),
      writeFile(envelope, textEnvelope),
      writeFile(vault, await encryptVault(passphrase, { cardanoSwissKnifeVault: { version: 1, entries: [
        { id: "blockfrost", kind: "blockfrost-project-id", label: "blockfrost", value: blockfrostSecret, createdAt: "2026-07-22T00:00:00.000Z" },
        { id: "koios", kind: "koios-bearer-token", label: "koios", value: koiosSecret, createdAt: "2026-07-22T00:00:00.000Z" },
      ] } })),
      writeFile(guard, `import { writeFileSync } from "node:fs"; const calls = []; let producerCalls = 0; const respond = (status, body) => ({ status, text: async () => typeof body === "string" ? body : JSON.stringify(body) }); globalThis.fetch = async (url) => { calls.push({ url }); const mode = process.env.CSK_PROVIDER_MODE ?? "authentication"; if (mode === "transport") throw Error("provider transport failed"); if (mode === "authentication") return respond(401, "provider denied"); if (mode === "rate-limit") return respond(429, "provider throttled"); if (mode === "server") return respond(503, "provider unavailable"); if (mode === "decode") return respond(200, { not_cbor: "provider response invalid" }); if (url.includes("blocks/latest") || url.includes("epochs/latest/parameters")) return respond(200, {}); producerCalls += 1; if (mode === "partial" && producerCalls > 1) return respond(429, "producer throttled"); if (mode === "incomplete") return respond(401, "producer denied"); return respond(200, { cbor: "00" }); }; process.on("exit", () => writeFileSync(process.env.CSK_PROVIDER_CAPTURE, JSON.stringify({ calls, argv: process.argv, env: process.env })));`),
    ]);
    const guarded = { NODE_OPTIONS: `--import ${new URL(`file://${guard}`).href}`, CSK_PROVIDER_CAPTURE: capture };
    const calls = async () => JSON.parse(await readFile(capture, "utf8")).calls;
    const commands = [
      ["inspect"], ["identify"], ["intent"], ["witness", "plan"], ["validate"], ["evaluate-scripts"],
    ];
    const sources = [["--cbor-hex", transactionCbor], ["--tx-file", raw], ["--tx-file", envelope]];
    let offlineBaseline;
    for (const source of sources) {
      const offline = await json(["tx", "inspect", ...source], "", undefined, guarded);
      assert.equal(offline.code, 0, offline.stderr);
      assert.equal(Object.hasOwn(JSON.parse(offline.stdout).value, "context"), false);
      if (offlineBaseline === undefined) offlineBaseline = JSON.parse(offline.stdout);
      else assert.deepEqual(JSON.parse(offline.stdout), offlineBaseline, `offline ${source[0]} changed the exact CLI result`);
      assert.deepEqual(await calls(), [], `offline ${source[0]} must make no provider request`);
    }
    for (const source of sources) for (const command of commands) {
      const result = await json(["tx", ...command, ...source, "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "blockfrost", "--passphrase-fd", "3"], "", `${passphrase}\n`, guarded);
      assert.equal(result.code, 0, `${command.join(" ")} ${source[0]}: ${result.stderr}${result.stdout}`);
      const context = JSON.parse(result.stdout).value.context;
      assert.equal(context.resolution.provider, "blockfrost");
      assert.ok(context.resolution.error_codes.some(({ code }) => code === "PROVIDER_AUTHENTICATION"));
      for (const secret of [blockfrostSecret, koiosSecret, passphrase]) assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
    }
    for (const extra of [[], ["--vault", vault, "--vault-entry", "koios", "--passphrase-fd", "3"]]) {
      const result = await json(["tx", "inspect", "--tx-file", raw, "--provider", "koios", "--network", "mainnet", ...extra], "", extra.length ? `${passphrase}\n` : undefined, guarded);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).value.context.resolution.provider, "koios");
    }
    for (const args of [
      ["tx", "inspect", "--cbor-hex", transactionCbor, "--provider", "blockfrost"],
      ["tx", "inspect", "--cbor-hex", transactionCbor, "--network", "mainnet"],
      ["tx", "inspect", "--cbor-hex", transactionCbor, "--vault", vault, "--vault-entry", "blockfrost"],
      ["tx", "inspect", "--cbor-hex", transactionCbor, "--tx-hash", "a".repeat(64), "--provider", "koios", "--network", "mainnet"],
    ]) {
      await writeFile(capture, JSON.stringify({ calls: [] }));
      const before = await calls();
      const result = await json(args, "", undefined, guarded);
      assert.equal(result.code, 2, `${args.join(" ")}: ${result.stderr}`);
      assert.equal(JSON.parse(result.stdout).error.code, "USAGE");
      assert.deepEqual(await calls(), before, `${args.join(" ")} reached provider or engine I/O`);
    }
    for (const [mode, code] of [["authentication", "PROVIDER_AUTHENTICATION"], ["rate-limit", "PROVIDER_RATE_LIMIT"], ["server", "PROVIDER_SERVER"], ["transport", "PROVIDER_TRANSPORT"], ["decode", "PROVIDER_DECODE"]]) {
      const result = await json(["tx", "inspect", "--tx-file", raw, "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "blockfrost", "--passphrase-fd", "3"], "", `${passphrase}\n`, { ...guarded, CSK_PROVIDER_MODE: mode });
      assert.equal(result.code, 0, `${mode}: ${result.stderr}`);
      assert.ok(JSON.parse(result.stdout).value.context.resolution.error_codes.some((error) => error.code === code), `${mode} was not typed`);
      for (const secret of [blockfrostSecret, koiosSecret, passphrase]) assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
    }
    for (const [mode, predicate] of [["complete", (resolution) => resolution.resolved_count === resolution.requested_tx_count && resolution.missing.length === 0], ["partial", (resolution) => resolution.resolved_count > 0 && resolution.missing.length > 0], ["incomplete", (resolution) => resolution.resolved_count === 0 && resolution.missing.length > 0]]) {
      const result = await json(["tx", "inspect", "--tx-file", raw, "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "blockfrost", "--passphrase-fd", "3"], "", `${passphrase}\n`, { ...guarded, CSK_PROVIDER_MODE: mode });
      assert.equal(result.code, 0, `${mode}: ${result.stderr}`);
      assert.equal(predicate(JSON.parse(result.stdout).value.context.resolution), true, `${mode} resolver evidence was not truthful`);
    }
    const recorded = JSON.parse(await readFile(capture, "utf8"));
    assert.ok(recorded.calls.length > 0, "local provider selections must reach the shared provider boundary");
    for (const secret of [blockfrostSecret, koiosSecret, passphrase]) {
      assert.doesNotMatch(JSON.stringify({ argv: recorded.argv, env: recorded.env }), new RegExp(secret));
      const temporaryContents = (await Promise.all((await readdir(dir)).map((entry) => readFile(join(dir, entry), "utf8").catch(() => "")))).join("");
      assert.doesNotMatch(temporaryContents, new RegExp(secret));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("submits only after explicit confirmation and rejects incomplete entries before provider IO", async () => {
  const dir = await mkdtemp(join(tmpdir(), "csk-cli-submit-"));
  const entryFile = join(dir, "entry.json");
  const incompleteEntryFile = join(dir, "incomplete-entry.json");
  const txFile = join(dir, "signed-tx.cbor");
  const envelopeFile = join(dir, "signed-tx.json");
  const vault = join(dir, "credentials.age");
  const capture = join(dir, "fetch-calls.json");
  const guard = join(dir, "fetch-guard.mjs");
  const entry = { entryId: "entry-1", unsignedTxCborHex: "00", requiredSigners: [], collectedWitnesses: [], invalidAfterSlot: 100, status: "open" };
  try {
    await Promise.all([
      writeFile(entryFile, JSON.stringify(entry)),
      writeFile(incompleteEntryFile, JSON.stringify({ ...entry, requiredSigners: ["missing"] })),
      writeFile(txFile, "deadbeef\n"),
      writeFile(envelopeFile, JSON.stringify({ type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: "deadbeef" })),
      writeFile(vault, await encryptVault("submit vault passphrase", { cardanoSwissKnifeVault: { version: 1, entries: [
        { id: "blockfrost", kind: "blockfrost-project-id", label: "blockfrost", value: "blockfrost-submit-secret", createdAt: "2026-07-21T00:00:00.000Z" },
        { id: "koios", kind: "koios-bearer-token", label: "koios", value: "koios-submit-secret", createdAt: "2026-07-21T00:00:00.000Z" },
      ] } })),
      writeFile(guard, `import { writeFileSync } from "node:fs"; const calls = []; globalThis.fetch = async (url, options) => { calls.push({ url, method: options.method, headers: options.headers, binary: options.body instanceof Uint8Array, bytes: Array.from(options.body ?? []) }); return { status: 200, text: async () => JSON.stringify("${"c".repeat(64)}") }; }; process.on("exit", () => writeFileSync(process.env.CSK_FETCH_CAPTURE, JSON.stringify({ calls, argv: process.argv, env: process.env })));`),
    ]);
    const guarded = { NODE_OPTIONS: `--import ${new URL(`file://${guard}`).href}`, CSK_FETCH_CAPTURE: capture };
    const args = ["tx", "submit", "--entry-file", entryFile, "--tx-file", txFile, "--current-slot", "10", "--provider", "koios", "--network", "preview"];
    const cancelled = await json(args, "", undefined, guarded);
    assert.equal(cancelled.code, 3);
    assert.equal(JSON.parse(cancelled.stdout).error.code, "DOMAIN_ERROR");
    assert.deepEqual(JSON.parse(await readFile(capture, "utf8")).calls, []);
    const incomplete = await json(["tx", "submit", "--entry-file", incompleteEntryFile, ...args.slice(4), "--confirm"], "", undefined, guarded);
    assert.equal(incomplete.code, 3);
    assert.equal(JSON.parse(incomplete.stdout).error.code, "DOMAIN_ERROR");
    assert.deepEqual(JSON.parse(await readFile(capture, "utf8")).calls, []);
    const submitted = await json([...args, "--confirm"], "", undefined, guarded);
    assert.equal(submitted.code, 0, submitted.stderr);
    assert.equal(JSON.parse(submitted.stdout).value.entry.status, "submitted");
    assert.deepEqual(JSON.parse(await readFile(capture, "utf8")).calls.map(({ method, binary, bytes }) => ({ method, binary, bytes })), [{ method: "POST", binary: true, bytes: [0xde, 0xad, 0xbe, 0xef] }]);
    const fromEnvelope = await json(["tx", "submit", "--entry-file", entryFile, "--tx-file", envelopeFile, "--current-slot", "10", "--provider", "koios", "--network", "preview", "--confirm"], "", undefined, guarded);
    assert.equal(fromEnvelope.code, 0, fromEnvelope.stderr);
    const blockfrost = await json(["tx", "submit", "--entry-file", entryFile, "--tx-file", txFile, "--current-slot", "10", "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "blockfrost", "--passphrase-fd", "3", "--confirm"], "", "submit vault passphrase\n", guarded);
    const blockfrostCapture = JSON.parse(await readFile(capture, "utf8"));
    const koios = await json(["tx", "submit", "--entry-file", entryFile, "--tx-file", txFile, "--current-slot", "10", "--provider", "koios", "--network", "mainnet", "--vault", vault, "--vault-entry", "koios", "--passphrase-fd", "3", "--confirm"], "", "submit vault passphrase\n", guarded);
    for (const result of [blockfrost, koios]) assert.equal(result.code, 0, result.stderr);
    for (const value of ["blockfrost-submit-secret", "koios-submit-secret", "submit vault passphrase"]) assert.doesNotMatch(`${blockfrost.stdout}${blockfrost.stderr}${koios.stdout}${koios.stderr}`, new RegExp(value));
    const captured = JSON.parse(await readFile(capture, "utf8"));
    assert.equal(captured.calls[0].url.endsWith("/submittx"), true);
    assert.equal(captured.calls[0].headers.Authorization, "Bearer koios-submit-secret");
    const blockfrostCall = blockfrostCapture.calls[0];
    assert.equal(blockfrostCall.url.endsWith("/tx/submit"), true);
    assert.equal(blockfrostCall.headers.project_id, "blockfrost-submit-secret");
    for (const value of ["blockfrost-submit-secret", "koios-submit-secret", "submit vault passphrase"]) {
      assert.doesNotMatch(JSON.stringify({ argv: captured.argv, env: captured.env, blockfrostArgv: blockfrostCapture.argv, blockfrostEnv: blockfrostCapture.env }), new RegExp(value));
    }
    for (const malformed of [
      { index: 7, value: "not-an-integer" },
      { index: 9, value: "other" },
      { index: 11, value: "other" },
    ]) {
      const invalidArgs = [...args];
      invalidArgs[malformed.index] = malformed.value;
      const invalid = await json([...invalidArgs, "--confirm"], "", undefined, guarded);
      assert.equal(invalid.code, 2);
      assert.equal(JSON.parse(invalid.stdout).error.code, "USAGE");
    }
    await writeFile(guard, `import { writeFileSync } from "node:fs"; const calls = []; globalThis.fetch = async (url, options) => { calls.push({ url, headers: options.headers }); return { status: 401, text: async () => "blockfrost-submit-secret" }; }; process.on("exit", () => writeFileSync(process.env.CSK_FETCH_CAPTURE, JSON.stringify({ calls, argv: process.argv, env: process.env })));`);
    const rejected = await json(["tx", "submit", "--entry-file", entryFile, "--tx-file", txFile, "--current-slot", "10", "--provider", "blockfrost", "--network", "mainnet", "--vault", vault, "--vault-entry", "blockfrost", "--passphrase-fd", "3", "--confirm"], "", "submit vault passphrase\n", guarded);
    assert.equal(rejected.code, 6);
    assert.equal(JSON.parse(rejected.stdout).error.code, "PROVIDER_AUTHENTICATION");
    assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, /blockfrost-submit-secret|submit vault passphrase/);
    const rejectedCapture = JSON.parse(await readFile(capture, "utf8"));
    assert.equal(rejectedCapture.calls[0].headers.project_id, "blockfrost-submit-secret");
    for (const value of ["blockfrost-submit-secret", "submit vault passphrase"]) assert.doesNotMatch(JSON.stringify({ argv: rejectedCapture.argv, env: rejectedCapture.env }), new RegExp(value));
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
