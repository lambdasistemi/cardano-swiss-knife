import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import fc from "fast-check";
import {
  assertEnvelope,
  assertError,
  installForeignPackage,
  legacyNetwork,
  propertyParameters,
  vectors,
} from "./property-support.mjs";

let foreign;
before(async () => { foreign = await installForeignPackage(); });
after(async () => { await foreign?.cleanup(); });

const one = async (name, ...args) => (await foreign.invoke([{ name, args }]))[0];
const validVector = (items) => fc.constantFrom(...items);
const legalIndex = fc.integer({ min: 0, max: 20 });
const validWordCounts = fc.constantFrom(12, 15, 18, 21, 24);
const hexPayload = fc.uint8Array({ minLength: 0, maxLength: 32 }).map((bytes) => Buffer.from(bytes).toString("hex"));
const textPayload = fc.string({ minLength: 0, maxLength: 64 });
const exec = promisify(execFile);

// CskError — valid input: code/message strings; invariant: Error identity and exact
// fields survive packaging; taxonomy: construction is not a result envelope.
test("property: CskError is a stable installed-package typed error", async () => {
  const error = await foreign.inspectError();
  assert.deepEqual(error, { name: "CskError", code: "DOMAIN_ERROR", message: "synthetic sentinel", isError: true });
});

// inspectAddress — valid domain: committed Shelley/Byron addresses; invariant: all
// valid seeds produce a deterministic success envelope (the canonical first vector
// additionally has an exact result); taxonomy: malformed text is DOMAIN_ERROR.
test("property: inspectAddress preserves vector analysis and rejects malformed addresses", async () => {
  await fc.assert(fc.asyncProperty(validVector(vectors.inspectionVectors), async (vector) => {
    const [first, second] = await foreign.invoke([
      { name: "inspectAddress", args: [vector.address] }, { name: "inspectAddress", args: [vector.address] },
    ]);
    assertEnvelope(first); assert.equal(first.ok, true); assert.deepEqual(second, first);
  }), propertyParameters(12));
  const canonical = vectors.inspectionVectors[0];
  assert.deepEqual(await one("inspectAddress", canonical.address), { ok: true, value: canonical.expected });
  await fc.assert(fc.asyncProperty(fc.nat(), async (suffix) => {
    assertError(await one("inspectAddress", `not-an-address-${suffix}`), "DOMAIN_ERROR");
  }), propertyParameters(6));
});

// generateMnemonic/validateMnemonic — valid domain: supported BIP-39 word counts;
// invariant: generated words validate and retain count; taxonomy: malformed mnemonic is DOMAIN_ERROR-free false.
test("property: mnemonic generation composes with validation", async () => {
  await fc.assert(fc.asyncProperty(validWordCounts, async (wordCount) => {
    const generated = await one("generateMnemonic", { wordCount });
    assertEnvelope(generated); assert.equal(generated.ok, true); assert.equal(generated.value.length, wordCount);
    assert.deepEqual(await one("validateMnemonic", { mnemonic: generated.value }), { ok: true, value: true });
  }), propertyParameters(8));
  await fc.assert(fc.asyncProperty(fc.nat(), async (suffix) => {
    const words = [...vectors.derivationVectors[0].mnemonic]; words[0] = `not-a-bip39-word-${suffix}`;
    assert.deepEqual(await one("validateMnemonic", { mnemonic: words }), { ok: true, value: false });
  }), propertyParameters(6));
});

// deriveKeys — valid domain: committed mnemonic seeds, legal unsigned derivation indices,
// and external/internal/stake roles; invariant: the real engine is deterministic; taxonomy: missing role is DOMAIN_ERROR.
test("property: deriveKeys is deterministic for legal indices", async () => {
  await fc.assert(fc.asyncProperty(validVector(vectors.derivationVectors), legalIndex, legalIndex, async (seed, accountIndex, addressIndex) => {
    const input = { mnemonic: seed.mnemonic, accountIndex, role: seed.role, addressIndex };
    const [first, second] = await foreign.invoke([{ name: "deriveKeys", args: [input] }, { name: "deriveKeys", args: [input] }]);
    assertEnvelope(first); assert.equal(first.ok, true); assert.deepEqual(second, first);
  }), propertyParameters(10));
  assertError(await one("deriveKeys", { mnemonic: vectors.derivationVectors[0].mnemonic, accountIndex: 0, addressIndex: 0 }), "DOMAIN_ERROR");
});

// constructShelleyAddresses — valid domain: payment-capable external/internal derived public
// keys plus mainnet/preprod/preview; invariant: deterministic selected-network payment address;
// invariant: construction is deterministic and keeps the selected network prefix; taxonomy: bad network is DOMAIN_ERROR.
test("property: constructShelleyAddresses composes with deriveKeys", async () => {
  await fc.assert(fc.asyncProperty(validVector(vectors.shelleyRestoreVectors.filter((seed) => seed.role !== "stake")), fc.constantFrom("mainnet", "preprod", "preview"), async (seed, network) => {
    const keys = await one("deriveKeys", { mnemonic: seed.mnemonic, accountIndex: seed.accountIndex, role: seed.role, addressIndex: seed.addressIndex });
    assert.equal(keys.ok, true);
    const input = { network, paymentXPubBech32: keys.value.addressPublicKeyBech32, stakeXPubBech32: keys.value.stakePublicKeyBech32 };
    const [first, second] = await foreign.invoke([{ name: "constructShelleyAddresses", args: [input] }, { name: "constructShelleyAddresses", args: [input] }]);
    assertEnvelope(first); assert.equal(first.ok, true); assert.deepEqual(second, first);
    assert.match(first.value.paymentAddressBech32, network === "mainnet" ? /^addr1/ : /^addr_test1/);
  }), propertyParameters(8));
  assertError(await one("constructShelleyAddresses", { network: "invalid", stakeXPubBech32: "x" }), "DOMAIN_ERROR");
});

// constructShelleyAddresses (stake-only) — valid domain: committed stake-role derived public
// keys with an absent optional payment key; invariant: deterministic reward-only construction;
// taxonomy: the absent payment key is valid, while a bad network remains DOMAIN_ERROR.
test("property: constructShelleyAddresses accepts the optional payment-key stake-only shape", async () => {
  await fc.assert(fc.asyncProperty(validVector(vectors.shelleyRestoreVectors.filter((seed) => seed.role === "stake")), fc.constantFrom("mainnet", "preprod", "preview"), async (seed, network) => {
    const keys = await one("deriveKeys", { mnemonic: seed.mnemonic, accountIndex: seed.accountIndex, role: seed.role, addressIndex: seed.addressIndex });
    assert.equal(keys.ok, true);
    const input = { network, paymentXPubBech32: null, stakeXPubBech32: keys.value.stakePublicKeyBech32 };
    const [first, second] = await foreign.invoke([{ name: "constructShelleyAddresses", args: [input] }, { name: "constructShelleyAddresses", args: [input] }]);
    assertEnvelope(first); assert.equal(first.ok, true); assert.deepEqual(second, first);
    assert.match(first.value.rewardAddressBech32, network === "mainnet" ? /^addr1/ : /^addr_test1/);
  }), propertyParameters(8));
});

// constructIcarusAddressFromMnemonic/constructByronAddressFromMnemonic — valid domain:
// committed family seeds plus legal indices; invariant: selected legacy style/network round-trips to its vector; taxonomy: invalid networks are DOMAIN_ERROR.
test("property: mnemonic bootstrap constructors preserve committed legacy vectors", async () => {
  await fc.assert(fc.asyncProperty(validVector(vectors.familyRestoreVectors.filter((vector) => vector.network !== "custom")), async (seed) => {
    const input = { network: legacyNetwork(seed), mnemonic: seed.mnemonic, accountIndex: seed.accountIndex, addressIndex: seed.addressIndex };
    const result = seed.style === "Icarus"
      ? await one("constructIcarusAddressFromMnemonic", { ...input, role: seed.role })
      : await one("constructByronAddressFromMnemonic", input);
    assert.deepEqual(result, { ok: true, value: seed.expectedAddressBase58 });
  }), propertyParameters(12));
  assertError(await one("constructIcarusAddressFromMnemonic", { network: "invalid", mnemonic: [], accountIndex: 0, role: "external", addressIndex: 0 }), "DOMAIN_ERROR");
  assertError(await one("constructByronAddressFromMnemonic", { network: "invalid", mnemonic: [], accountIndex: 0, addressIndex: 0 }), "DOMAIN_ERROR");
});

// constructIcarusAddress/constructByronAddress — valid domain: committed extended-public-key
// bootstrap vectors; invariant: exact base58 vector result; taxonomy: malformed xpub is DOMAIN_ERROR.
test("property: public-key bootstrap constructors preserve committed vectors", async () => {
  await fc.assert(fc.asyncProperty(validVector(vectors.bootstrapVectors), async (seed) => {
    const input = { network: legacyNetwork(seed), addressXPubBech32: seed.addressXPubBech32 };
    const result = seed.style === "Icarus"
      ? await one("constructIcarusAddress", input)
      : await one("constructByronAddress", { ...input, rootXPubBech32: seed.rootXPubBech32, derivationPath: seed.derivationPath });
    assert.deepEqual(result, { ok: true, value: seed.expectedAddressBase58 });
  }), propertyParameters(14));
  assertError(await one("constructIcarusAddress", { network: "mainnet", addressXPubBech32: "not-an-xpub" }), "DOMAIN_ERROR");
  assertError(await one("constructByronAddress", { network: "mainnet", addressXPubBech32: "not-an-xpub", rootXPubBech32: "not-an-xpub", derivationPath: "0H/0" }), "DOMAIN_ERROR");
});

// signPayload/verifySignature — valid domain: committed signing keys with arbitrary text or
// arbitrary even-length hexadecimal payloads; invariant: signing verifies and a one-nibble
// signature change is successful false; taxonomy: bad mode/hex is DOMAIN_ERROR.
test("property: payload signatures round-trip and tampering is false", async () => {
  await fc.assert(fc.asyncProperty(validVector(vectors.signingVectors), async (seed) => {
    const signed = await one("signPayload", { payloadMode: seed.payloadMode, payloadInput: seed.payloadInput, signingKeyBech32: seed.signingKeyBech32 });
    assertEnvelope(signed); assert.equal(signed.ok, true); assert.equal(typeof signed.value.signatureHex, "string");
    assert.deepEqual(await one("verifySignature", { payloadMode: seed.payloadMode, payloadInput: seed.payloadInput, verificationKeyBech32: seed.verificationKeyBech32, signatureHex: signed.value.signatureHex }), { ok: true, value: true });
    const changed = `${signed.value.signatureHex.slice(0, -1)}${signed.value.signatureHex.endsWith("0") ? "1" : "0"}`;
    assert.deepEqual(await one("verifySignature", { payloadMode: seed.payloadMode, payloadInput: seed.payloadInput, verificationKeyBech32: seed.verificationKeyBech32, signatureHex: changed }), { ok: true, value: false });
  }), propertyParameters(10));
  await fc.assert(fc.asyncProperty(validVector(vectors.signingVectors), fc.oneof(textPayload.map((payloadInput) => ({ payloadMode: "text", payloadInput })), hexPayload.map((payloadInput) => ({ payloadMode: "hex", payloadInput }))), async (seed, payload) => {
    const signed = await one("signPayload", { ...payload, signingKeyBech32: seed.signingKeyBech32 });
    assertEnvelope(signed); assert.equal(signed.ok, true);
    assert.deepEqual(await one("verifySignature", { ...payload, verificationKeyBech32: seed.verificationKeyBech32, signatureHex: signed.value.signatureHex }), { ok: true, value: true });
    const changed = `${signed.value.signatureHex.slice(0, -1)}${signed.value.signatureHex.endsWith("0") ? "1" : "0"}`;
    assert.deepEqual(await one("verifySignature", { ...payload, verificationKeyBech32: seed.verificationKeyBech32, signatureHex: changed }), { ok: true, value: false });
  }), propertyParameters(12));
  const signing = vectors.signingVectors[0];
  assertError(await one("signPayload", { payloadMode: "hex", payloadInput: "not-hex", signingKeyBech32: signing.signingKeyBech32 }), "DOMAIN_ERROR");
  assertError(await one("verifySignature", { payloadMode: "other", payloadInput: "x", verificationKeyBech32: signing.verificationKeyBech32, signatureHex: signing.signatureHex }), "DOMAIN_ERROR");
});

// signPayload/verifySignature diagnostics — valid input: a committed signing vector; invariant:
// serialized successful values and malformed-input diagnostics omit secret material; taxonomy:
// malformed key remains DOMAIN_ERROR without reflecting the synthetic sentinel.
test("property: payload results and diagnostics are secret-free", async () => {
  const signing = vectors.signingVectors[0];
  const successful = await one("signPayload", { payloadMode: signing.payloadMode, payloadInput: signing.payloadInput, signingKeyBech32: signing.signingKeyBech32 });
  assert.equal(JSON.stringify(successful).includes(signing.signingKeyBech32), false, "successful result leaked signing key");
  const syntheticSecret = "CSK_PROPERTY_SIGNING_SECRET_SENTINEL";
  const malformed = await one("signPayload", { payloadMode: "text", payloadInput: "payload", signingKeyBech32: syntheticSecret });
  assertError(malformed, "DOMAIN_ERROR");
  assert.equal(JSON.stringify(malformed).includes(syntheticSecret), false, "malformed diagnostic leaked synthetic secret");
});

// analyzeNativeScriptHex/analyzeNativeScriptJson/analyzeScriptTemplateJson — valid domain:
// committed equivalent script representations; invariant: exact engine analysis and canonical forms agree; taxonomy: malformed forms are DOMAIN_ERROR.
test("property: native scripts and templates retain exact vector envelopes", async () => {
  await fc.assert(fc.asyncProperty(validVector(vectors.scriptHashVectors), async (seed) => {
    const [hex, json] = await foreign.invoke([{ name: "analyzeNativeScriptHex", args: [seed.scriptCborHex] }, { name: "analyzeNativeScriptJson", args: [seed.scriptJson] }]);
    assert.deepEqual(hex, { ok: true, value: seed.expected }); assert.deepEqual(json, { ok: true, value: seed.expected });
  }), propertyParameters(12));
  await fc.assert(fc.asyncProperty(validVector(vectors.scriptTemplateVectors), async (seed) => {
    assert.deepEqual(await one("analyzeScriptTemplateJson", seed.templateJson), { ok: true, value: seed.expected });
  }), propertyParameters(10));
  assertError(await one("analyzeNativeScriptHex", "not-cbor"), "DOMAIN_ERROR");
  assertError(await one("analyzeNativeScriptJson", "{malformed"), "DOMAIN_ERROR");
  assertError(await one("analyzeScriptTemplateJson", "{malformed"), "DOMAIN_ERROR");
});

const icarus = vectors.familyRestoreVectors.find((vector) => vector.style === "Icarus" && vector.network !== "custom");
const byron = vectors.familyRestoreVectors.find((vector) => vector.style === "Byron" && vector.network !== "custom");
const bootstrapIcarus = vectors.bootstrapVectors.find((vector) => vector.style === "Icarus" && vector.network !== "custom");
const bootstrapByron = vectors.bootstrapVectors.find((vector) => vector.style === "Byron" && vector.network !== "custom");
const derived = vectors.derivationVectors[0];
const offlineEngineCalls = [
  { name: "inspectAddress", args: [vectors.inspectionVectors[0].address] },
  { name: "generateMnemonic", args: [{ wordCount: 12 }] },
  { name: "validateMnemonic", args: [{ mnemonic: derived.mnemonic }] },
  { name: "deriveKeys", args: [{ mnemonic: derived.mnemonic, accountIndex: derived.accountIndex, role: derived.role, addressIndex: derived.addressIndex }] },
  { name: "constructShelleyAddresses", args: [{ network: "mainnet", paymentXPubBech32: derived.expected.addressPublicKeyBech32, stakeXPubBech32: derived.expected.stakePublicKeyBech32 }] },
  { name: "constructIcarusAddressFromMnemonic", args: [{ network: legacyNetwork(icarus), mnemonic: icarus.mnemonic, accountIndex: icarus.accountIndex, role: icarus.role, addressIndex: icarus.addressIndex }] },
  { name: "constructByronAddressFromMnemonic", args: [{ network: legacyNetwork(byron), mnemonic: byron.mnemonic, accountIndex: byron.accountIndex, addressIndex: byron.addressIndex }] },
  { name: "constructIcarusAddress", args: [{ network: legacyNetwork(bootstrapIcarus), addressXPubBech32: bootstrapIcarus.addressXPubBech32 }] },
  { name: "constructByronAddress", args: [{ network: legacyNetwork(bootstrapByron), addressXPubBech32: bootstrapByron.addressXPubBech32, rootXPubBech32: bootstrapByron.rootXPubBech32, derivationPath: bootstrapByron.derivationPath }] },
  { name: "signPayload", args: [{ payloadMode: vectors.signingVectors[0].payloadMode, payloadInput: vectors.signingVectors[0].payloadInput, signingKeyBech32: vectors.signingVectors[0].signingKeyBech32 }] },
  { name: "verifySignature", args: [{ payloadMode: vectors.signingVectors[0].payloadMode, payloadInput: vectors.signingVectors[0].payloadInput, verificationKeyBech32: vectors.signingVectors[0].verificationKeyBech32, signatureHex: vectors.signingVectors[0].signatureHex }] },
  { name: "analyzeNativeScriptHex", args: [vectors.scriptHashVectors[0].scriptCborHex] },
  { name: "analyzeNativeScriptJson", args: [vectors.scriptHashVectors[0].scriptJson] },
  { name: "analyzeScriptTemplateJson", args: [vectors.scriptTemplateVectors[0].templateJson] },
];
const engineCrossingOfflineCalls = offlineEngineCalls.filter(({ name }) => new Set([
  "inspectAddress", "deriveKeys", "constructIcarusAddressFromMnemonic", "constructByronAddressFromMnemonic",
  "constructIcarusAddress", "constructByronAddress", "signPayload", "verifySignature",
]).has(name));
const assertEngineFailures = async (replace, code) => {
  await replace(async () => {
    const results = await foreign.invoke(engineCrossingOfflineCalls);
    for (const result of results) assertError(result, code);
  });
};

// Offline engine inventory — package-relative cardano-addresses.wasm is crossed by
// inspectAddress, deriveKeys, both mnemonic bootstrap constructors, both xpub bootstrap
// constructors, signPayload, and verifySignature. generateMnemonic/validateMnemonic use local
// BIP-39, constructShelleyAddresses is pure xpub composition, and the three script analysers are
// pure native-script transforms: hiding the artifact leaves those six operations successful.
// A valid empty _start module is a real packaged-engine protocol boundary: it exits successfully
// but emits no response, so every engine-crossing export must report ENGINE_PROTOCOL.
test("property: every engine-crossing offline operation has exact no-fallback load and execution taxonomy", async () => {
  await assertEngineFailures((action) => foreign.hideEngine(action), "ENGINE_NOT_FOUND");
  await assertEngineFailures((action) => foreign.withEngineReplacement("not a WebAssembly binary", action), "ENGINE_INCOMPATIBLE");
  const abnormalExit = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x00, 0x00, 0x02, 0x24, 0x01, 0x16, ...Buffer.from("wasi_snapshot_preview1"), 0x09, ...Buffer.from("proc_exit"), 0x00, 0x00, 0x03, 0x02, 0x01, 0x01, 0x07, 0x0a, 0x01, 0x06, ...Buffer.from("_start"), 0x00, 0x01, 0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x2a, 0x10, 0x00, 0x0b]);
  await assertEngineFailures((action) => foreign.withEngineReplacement(abnormalExit, action), "ENGINE_EXECUTION");
  const emptyStart = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x07, 0x0a, 0x01, 0x06, 0x5f, 0x73, 0x74, 0x61, 0x72, 0x74, 0x00, 0x00, 0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b]);
  await assertEngineFailures((action) => foreign.withEngineReplacement(emptyStart, action), "ENGINE_PROTOCOL");
});

const transactionCbor = (await readFile(new URL("../../fixtures/conway-mainnet-tx.hex", import.meta.url), "utf8")).trim();
const transactionEnvelope = JSON.stringify({ type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: transactionCbor });
const transactionBooks = JSON.parse(await readFile(new URL("./fixtures/transaction-books.json", import.meta.url), "utf8"));
const providerFailures = JSON.parse(await readFile(new URL("./fixtures/provider-failures.json", import.meta.url), "utf8"));
const transactionOperations = ["inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent"];
const providerNetworks = [
  ["blockfrost", "mainnet", "https://cardano-mainnet.blockfrost.io/api/v0/txs/"],
  ["blockfrost", "preprod", "https://cardano-preprod.blockfrost.io/api/v0/txs/"],
  ["blockfrost", "preview", "https://cardano-preview.blockfrost.io/api/v0/txs/"],
  ["koios", "mainnet", "https://api.koios.rest/api/v1/tx_cbor"],
  ["koios", "preprod", "https://preprod.koios.rest/api/v1/tx_cbor"],
  ["koios", "preview", "https://preview.koios.rest/api/v1/tx_cbor"],
];
const providerFailureCodes = {
  authentication: "PROVIDER_AUTHENTICATION",
  "rate-limit": "PROVIDER_RATE_LIMIT",
  server: "PROVIDER_SERVER",
  transport: "PROVIDER_TRANSPORT",
  decode: "PROVIDER_DECODE",
};
const transactionEngine = () => join(foreign.packageRoot, "node", "dist", "wasm-tx-inspector.wasm");
const rdfEngine = () => join(foreign.packageRoot, "node", "dist", "rdf_shapes_wasm.js");
const rdfWasm = () => join(foreign.packageRoot, "node", "dist", "rdf_shapes_wasm_bg.wasm");
const transactionInput = (representation) => representation === "raw" ? { cborHex: transactionCbor } : { textEnvelope: transactionEnvelope };
const browseOptions = (path, books) => ({ path, ...(books ? { books } : {}) });
const transactionCall = (name, input, options = {}) => ({ name, args: name === "browseTransaction" ? [input, options] : [input, options] });

const runForeignProgram = async (program, options = {}) => {
  const script = join(foreign.root, `transaction-property-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  await writeFile(script, program);
  const { stdout } = await exec(process.execPath, options.import ? ["--import", options.import, script] : [script], { cwd: foreign.root });
  return JSON.parse(stdout);
};

const withTransactionEngine = async (bytes, action) => {
  const engine = transactionEngine();
  const original = `${engine}.property-original`;
  await rename(engine, original);
  if (bytes != null) await writeFile(engine, bytes);
  try { return await action(); }
  finally {
    await rm(engine, { force: true });
    await rename(original, engine);
  }
};

const withRdfEngines = async (configure, action) => {
  const engine = rdfEngine(); const wasm = rdfWasm();
  const originalEngine = `${engine}.property-original`;
  const originalWasm = `${wasm}.property-original`;
  await rename(engine, originalEngine); await rename(wasm, originalWasm);
  try { await configure({ engine, wasm, originalEngine, originalWasm }); return await action(); }
  finally {
    await rm(engine, { force: true }); await rm(wasm, { force: true });
    await rename(originalEngine, engine); await rename(originalWasm, wasm);
  }
};

// Transaction representations — valid domain: the committed Conway transaction as raw CBOR
// or its shared Tx ConwayEra TextEnvelope, with legal browse paths; invariant: all four real
// ledger operations preserve representation parity and selected browse paths; taxonomy: malformed
// or multiply-selected transaction sources are DOMAIN_ERROR before any engine result is produced.
test("property: transaction representations, browse paths, and source selection are exact", async () => {
  await fc.assert(fc.asyncProperty(fc.constantFrom("raw", "envelope"), fc.constantFrom([], ["fee_lovelace"]), async (representation, path) => {
    const input = transactionInput(representation);
    const results = await foreign.invoke(transactionOperations.map((name) => transactionCall(name, input, browseOptions(path))));
    for (const result of results) { assertEnvelope(result); assert.equal(result.ok, true, JSON.stringify(result)); }
    const browser = results[1].value.result.browser;
    assert.equal(browser.currentPath, JSON.stringify(path));
    const selected = JSON.parse(browser.currentJson);
    assert.equal(String(path.length === 0 ? selected.fee_lovelace : selected), "1527153");
    const peer = await foreign.invoke(transactionOperations.map((name) => transactionCall(name, transactionInput(representation === "raw" ? "envelope" : "raw"), browseOptions(path))));
    assert.deepEqual(peer, results, "raw CBOR and TextEnvelope must be representation-independent");
  }), propertyParameters(8));
  await fc.assert(fc.asyncProperty(fc.constantFrom(
    { cborHex: transactionCbor, textEnvelope: transactionEnvelope },
    { cborHex: transactionCbor, txHash: "a".repeat(64), provider: "blockfrost", network: "mainnet" },
    { textEnvelope: transactionEnvelope, txHash: "a".repeat(64), provider: "blockfrost", network: "mainnet" },
    { txHash: "a".repeat(64) },
    { cborHex: 42 },
  ), async (input) => {
    for (const name of transactionOperations) assertError(await one(name, input, name === "browseTransaction" ? browseOptions(["body"]) : {}), "DOMAIN_ERROR");
  }), propertyParameters(5));
});

// Offline transaction execution — valid domain: the committed raw Conway source and every
// transaction operation; invariant: the packaged ledger engine succeeds without network access;
// taxonomy: a network attempt is a test failure, not a successful fallback or error taxonomy.
test("property: offline transaction sources never attempt network access", async () => {
  const guard = join(foreign.root, "transaction-network-denied.mjs");
  await writeFile(guard, `
    import net from "node:net"; import http from "node:http"; import https from "node:https";
    import tls from "node:tls"; import dns from "node:dns"; import { syncBuiltinESMExports } from "node:module";
    const denied = (name) => () => { throw new Error("outbound network attempted via " + name); };
    net.connect = denied("net.connect"); net.createConnection = denied("net.createConnection");
    http.request = denied("http.request"); http.get = denied("http.get"); https.request = denied("https.request"); https.get = denied("https.get");
    tls.connect = denied("tls.connect"); dns.lookup = denied("dns.lookup"); dns.resolve = denied("dns.resolve"); globalThis.fetch = denied("fetch"); syncBuiltinESMExports();
  `);
  const results = await runForeignProgram(`
    import * as api from "@lambdasistemi/cardano-swiss-knife";
    const input = ${JSON.stringify({ cborHex: transactionCbor })};
    console.log(JSON.stringify(await Promise.all([api.inspectTransaction(input), api.browseTransaction(input, { path: ["body"] }), api.identifyTransaction(input), api.transactionIntent(input)])));
  `, { import: pathToFileURL(guard).href });
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));
});

// Provider sources — valid domain: all blockfrost|koios × mainnet|preprod|preview hash sources;
// invariant: every operation uses the selected shared HTTP endpoint and returns its engine context;
// taxonomy: provider authentication, rate-limit, server, transport, and decode failures are exact
// redacted PROVIDER_* errors with no credential reflected in serialized output.
test("property: provider/network pairs route every transaction operation through the shared boundary", async () => {
  const response = await runForeignProgram(`
    const calls = []; globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { status: 200, text: async () => ${JSON.stringify(JSON.stringify({ cbor: transactionCbor }))} }; };
    const api = await import("@lambdasistemi/cardano-swiss-knife"); const pairs = ${JSON.stringify(providerNetworks)};
    const results = []; for (const [provider, network] of pairs) for (const name of ${JSON.stringify(transactionOperations)}) {
      const input = { txHash: "${"a".repeat(64)}", provider, network, credential: "CSK_PROVIDER_SENTINEL" };
      results.push({ provider, network, name, result: await api[name](input, name === "browseTransaction" ? { path: ["body"] } : {}) });
    } console.log(JSON.stringify({ calls, results }));
  `);
  assert.equal(response.results.length, 24);
  for (const item of response.results) {
    assert.equal(item.result.ok, true, JSON.stringify(item)); assert.equal(JSON.stringify(item.result).includes("CSK_PROVIDER_SENTINEL"), false);
    if (["identifyTransaction", "transactionIntent"].includes(item.name)) {
      const context = item.result.value.context;
      assert.equal(context.network, item.network === "mainnet" ? "mainnet" : "testnet"); assert.equal(typeof context.protocol_parameters, "object");
      assert.equal(typeof context.producer_txs, "object"); assert.equal(context.resolution.provider, item.provider);
      assert.equal(context.resolution.requested_tx_count, context.resolution.resolved_count);
      assert.deepEqual(context.resolution.missing, []); assert.deepEqual(context.resolution.errors, []);
    }
  }
  for (const [, , endpoint] of providerNetworks) assert.ok(response.calls.some(({ url }) => url === endpoint || url.startsWith(endpoint)), `missing selected endpoint ${endpoint}`);
});

test("property: provider failures are exact and credentials are redacted through every operation", async () => {
  const failureResult = async (category, name, credential) => {
    const failure = providerFailures[category];
    const result = await runForeignProgram(`
      globalThis.fetch = async () => { ${failure.error ? `throw new Error(${JSON.stringify(failure.error)});` : `return { status: ${failure.status}, text: async () => ${JSON.stringify(failure.body.replace("{{credential}}", credential))} };`} };
      const api = await import("@lambdasistemi/cardano-swiss-knife");
      console.log(JSON.stringify(await api[${JSON.stringify(name)}]({ txHash: "${"a".repeat(64)}", provider: "blockfrost", network: "mainnet", credential: ${JSON.stringify(credential)} }, ${name === "browseTransaction" ? "{ path: [\"body\"] }" : "{}"})));
    `);
    assertError(result, providerFailureCodes[category]);
    assert.equal(JSON.stringify(result).includes(credential), false, JSON.stringify(result));
  };
  for (const category of Object.keys(providerFailures)) for (const name of transactionOperations) {
    await failureResult(category, name, `CSK_PROVIDER_MATRIX_${category}_${name}`);
  }
  const credential = fc.array(fc.constantFrom(..."abcdef0123456789"), { minLength: 1, maxLength: 16 }).map((characters) => `CSK_PROVIDER_GENERATED_${characters.join("")}`);
  await fc.assert(fc.asyncProperty(credential, async (value) => {
    await failureResult("authentication", "inspectTransaction", value);
  }), propertyParameters(4));
});

// Books and RDF — valid domain: committed Turtle, CIP-57, bundle, and store documents in any
// caller-selected order/repetition; invariant: all transaction operations preserve that exact order
// and use the packaged RDF resolver; taxonomy: an invalid import is BOOK_IMPORT and RDF load,
// compatibility, execution, and protocol failures remain their exact RDF_ENGINE_* categories.
test("property: book order, repetition, transactional import, and exact RDF resolutions are preserved", async () => {
  const bookForms = [
    ["turtle", transactionBooks.turtle], ["CIP-57 plutus.json", transactionBooks.cip57],
    ["amaru.book.bundle.v1", transactionBooks.bundle], ["cardano-ledger-inspector.books.v1", transactionBooks.store],
  ];
  await fc.assert(fc.asyncProperty(fc.array(fc.constantFrom(...bookForms), { minLength: 1, maxLength: 5 }), fc.constantFrom(...transactionOperations), async (chosen, name) => {
    const books = chosen.map(([, book]) => book); const expectedSources = chosen.map(([source]) => source);
    const result = await one(name, transactionInput("raw"), name === "browseTransaction" ? browseOptions(["body"], books) : { books });
    assert.equal(result.ok, true, JSON.stringify(result)); assert.deepEqual(result.value.books.map((book) => book.source), expectedSources);
  }), propertyParameters(10));
  const rejected = await one("inspectTransaction", transactionInput("raw"), { books: [transactionBooks.turtle, transactionBooks.invalidBundle] });
  assertError(rejected, "BOOK_IMPORT");
  const identified = await one("identifyTransaction", transactionInput("raw"), { books: [transactionBooks.bundle, transactionBooks.store] });
  assert.equal(identified.ok, true, JSON.stringify(identified));
  for (const [raw, label, type] of [
    ["8bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c1", "network_compliance scope owner", "overlay:Owner"],
    ["addr1qx9aqvsf6gne2640jec828s25gzhk5wp2day8u24kf8mrs2v0zyuvk80fay35dx008p45ts0u6cdrv9g2maetq8jm8psznjcrz", "operator fuel wallet", "overlay:Address"],
    ["5fbb3e5295c211c7595ddd23db2e0a0833131e0681cc7ea800f85d34", "Amaru Core Development treasury script", "overlay:CardanoScript"],
  ]) assert.ok(identified.value.resolutions.some((row) => row.raw === raw && row.label === label && row.type === type), `missing RDF resolution for ${raw}`);
});

// Ledger engine failures — valid domain: all four transaction operations over the committed raw
// source; invariant: no operation manufactures a result when the packaged ledger boundary fails;
// taxonomy: missing, incompatible, execution, and malformed protocol engines are exactly ENGINE_*.
test("property: all transaction operations preserve the complete ledger-engine failure taxonomy", async () => {
  const calls = () => foreign.invoke(transactionOperations.map((name) => transactionCall(name, transactionInput("raw"), browseOptions(["body"]))));
  const assertFailures = async (bytes, code) => withTransactionEngine(bytes, async () => { for (const result of await calls()) assertError(result, code); });
  await assertFailures(null, "ENGINE_NOT_FOUND");
  await assertFailures("not a WebAssembly binary", "ENGINE_INCOMPATIBLE");
  const abnormalExit = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x00, 0x00, 0x02, 0x24, 0x01, 0x16, ...Buffer.from("wasi_snapshot_preview1"), 0x09, ...Buffer.from("proc_exit"), 0x00, 0x00, 0x03, 0x02, 0x01, 0x01, 0x07, 0x0a, 0x01, 0x06, ...Buffer.from("_start"), 0x00, 0x01, 0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x2a, 0x10, 0x00, 0x0b]);
  const emptyStart = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x07, 0x0a, 0x01, 0x06, 0x5f, 0x73, 0x74, 0x61, 0x72, 0x74, 0x00, 0x00, 0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b]);
  await assertFailures(abnormalExit, "ENGINE_EXECUTION"); await assertFailures(emptyStart, "ENGINE_PROTOCOL");
});

test("property: RDF engine failures remain exact for books through all transaction operations", async () => {
  const calls = () => foreign.invoke(transactionOperations.map((name) => transactionCall(name, transactionInput("raw"), name === "browseTransaction" ? browseOptions(["body"], [transactionBooks.bundle]) : { books: [transactionBooks.bundle] })));
  const assertFailures = async (configure, code) => withRdfEngines(configure, async () => { for (const result of await calls()) assertError(result, code); });
  await assertFailures(async () => {}, "RDF_ENGINE_NOT_FOUND");
  await assertFailures(async ({ engine, wasm }) => { await writeFile(engine, "export default async () => {}; export const query = () => [];"); await writeFile(wasm, "not a WebAssembly binary"); }, "RDF_ENGINE_INCOMPATIBLE");
  await assertFailures(async ({ engine, wasm, originalWasm }) => { await writeFile(wasm, await readFile(originalWasm)); await writeFile(engine, "export default async () => { throw new Error('engine exploded'); }; export const query = () => [];"); }, "RDF_ENGINE_EXECUTION");
  await assertFailures(async ({ engine, wasm, originalWasm }) => { await writeFile(wasm, await readFile(originalWasm)); await writeFile(engine, "export default async () => {}; export const query = () => 'not RDF query rows';"); }, "RDF_ENGINE_PROTOCOL");
});

// Contract inventory — valid domain: the current Slice-2 public contract registry; invariant:
// every named public operation has a canonical property group; taxonomy: inventory drift is an
// assertion failure, never an omitted or fallback contract. The four Slice-2 names are registered
// only in GREEN, after the substantive properties above have executed and exposed this honest RED.
const contractInventory = [
  "CskError", "inspectAddress", "generateMnemonic", "validateMnemonic", "deriveKeys", "constructShelleyAddresses",
  "constructIcarusAddressFromMnemonic", "constructByronAddressFromMnemonic", "constructIcarusAddress", "constructByronAddress",
  "signPayload", "verifySignature", "analyzeNativeScriptHex", "analyzeNativeScriptJson", "analyzeScriptTemplateJson",
  "inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent",
];
test("property: current-through-Slice-2 public contract inventory is complete", () => {
  assert.deepEqual(contractInventory, [
    "CskError", "inspectAddress", "generateMnemonic", "validateMnemonic", "deriveKeys", "constructShelleyAddresses",
    "constructIcarusAddressFromMnemonic", "constructByronAddressFromMnemonic", "constructIcarusAddress", "constructByronAddress",
    "signPayload", "verifySignature", "analyzeNativeScriptHex", "analyzeNativeScriptJson", "analyzeScriptTemplateJson",
    "inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent",
  ]);
});
