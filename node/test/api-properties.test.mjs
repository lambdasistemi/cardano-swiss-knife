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
const witnessFixture = JSON.parse(await readFile(new URL("./fixtures/transaction-witnesses.json", import.meta.url), "utf8"));
const ledgerFixture = JSON.parse(await readFile(new URL("./fixtures/transaction-ledger.json", import.meta.url), "utf8"));
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

// Fixed inert transaction vector derived once from the committed treasury-reorganize
// transaction by declaring witness-fixture required signers. Its provenance is
// node/test/transaction-witness.test.mjs; this property suite deliberately contains
// no CBOR parser or mutator and delegates all ledger semantics to the packaged engine.
const witnessTransactionCbor = "84ac00d901028b8258200abab118fb103b983b177fb80c247803f3b5ff7f5d98202ddd2f071b017cb23d0082582044454ed0def64621ef645958830f599b488b699b28e3797cc37c4f4dd1463a7901825820968fd01e074ca33de95087957f59803bb2ee8bacfe922eb81cdf18e8e23ad78800825820968fd01e074ca33de95087957f59803bb2ee8bacfe922eb81cdf18e8e23ad78802825820a5003a714c45d0c25d6d6463f6ac0c1fd059bc6c390388aaf1cea7249e0fe3ab01825820a80f446675b55c8f39a2efadc79d4a5643ed64b13c0750bbc0c4010d335713fa01825820affe90d1fa9a93b3e2a48009ef80634e9de8428640f5d673e85b002a8639998200825820cda0126e9ea7b336bbb338d2bfc7622a41b584e3bebc33c9c320e8895b9bc08201825820cda0126e9ea7b336bbb338d2bfc7622a41b584e3bebc33c9c320e8895b9bc08202825820e95251993c0ed08c52d4063da1aeba193e4327d4900168111fe73f61ed10d3c501825820efff271aa02e9032aba0e5e9020c5840b2aa1b219c59f9f16e1d6e51071bea1e020dd9010281825820968fd01e074ca33de95087957f59803bb2ee8bacfe922eb81cdf18e8e23ad788020e82581c3207c32d806ec2cabc78ff7ed869bd3098b7db93c43cc8aa93ab59eb581c6b067bf7f9934fe990e607a63351a06453a1b746fef116f809b62e0712d901028482582011ace24a7b0caad4a68a38ef2fff18185dc9ea604e84425dab487cae94e4cf540082582025ba96f5deb14bb5c56e7542d6a9ba8450f52cc698ebd74574e1a0525d86109502825820810bfcbde85ae72f27d7e8cd154c03c802de15d3fa0dd83a32a4b0fdba330b3c00825820e7b395a93d49a17994d66df0e4778a01dee05e7711e6612f28d97b63e4e6311c0201828258393132201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d32201dc1e82708364c6c42a53f89f675314bb9ad5da2734aa10baa0d821b0000008e46925cd7a1581cc48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ada1480014df105553444d1b000000046da5585f825839018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c31a0485e7b510825839018bd03209d227956aaf9670751e0aa2057b51c1537a43f155b24fb1c14c7889c658ef4f491a34cf79c35a2e0fe6b0d1b0a856fb9580f2d9c31a047a40fc111a0022f42a021a00174d71031a0b7e214105a1581df1a64d1b9e1aeffe54056034d84977061b45a92691efc282fbee3fc094000b5820b8a8dd58b2a5e1ace337bb601b390e22ce1e7c4d72f96c30a7ab6c2938cb3cda075820a996858c84ca5d9376ff24fe1f0677fcafe8b3cd69eee18d1011d50ced200db8a105ab82000082d87980821a001429291a1b37e07482000182d87980821a0014398b1a1b5ff03982000282d87980821a001449ed1a1b87fffe82000482d87980821a00146ab11a1bd81f8882000582d87980821a00147b131a1c002f4d82000682d87980821a00148b751a1c283f1282000782d87980821a00149bd71a1c504ed782000882d87980821a0014ac391a1c785e9c82000982d87980821a0014bc9b1a1ca06e6182000a82d87980821a0014ccfd1a1cc87e268203008280821a000844791a0fa9ec0bf5d90103a100a119069ea464626f6479a6656576656e746a72656f7267616e697a65656c6162656c6a72656f7267616e697a656a7265666572656e636573806b6465736372697074696f6e81783b54726561737572792072656f7267616e697a653a206d65726765205554784f7320696e746f206f6e6520636f6e74696e75696e67206f75747075746b64657374696e6174696f6ea1656c6162656c6874726561737572796d6a757374696669636174696f6e81781c526f7574696e65207472656173757279206d61696e74656e616e63656840636f6e7465787483783e68747470733a2f2f6769746875622e636f6d2f53756e646165537761702d66696e616e63652f74726561737572792d636f6e7472616374732f626c6f622f782861643433313664306433366364656637383066383566633265633862333037653634356464633261781e2f6f6666636861696e2f7372632f6d657461646174612f737065632e6d6468696e7374616e6365783833386336323764343538333537343461326436633732373132346632623538353265353536346165616233663630386530653834656136646d68617368416c676f726974686d6b626c616b6532622d323536";

const witnessTransaction = (representation) => representation === "raw"
  ? { cborHex: witnessTransactionCbor }
  : { textEnvelope: JSON.stringify({ type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: witnessTransactionCbor }) };
const witnessRepresentation = (witness, representation) => representation === "raw"
  ? { cborHex: witness.value.vkeyWitnessCborHex ?? witness.value.cborHex }
  : { textEnvelope: witness.value.textEnvelope };
const witnessPlan = (result) => result.value.result.witness_plan;
const witnessPreparation = async (signingKeyBech32 = witnessFixture.signingKey) => {
  const identified = await one("identifyTransaction", witnessTransaction("raw"));
  assert.equal(identified.ok, true, JSON.stringify(identified));
  return one("prepareTransactionWitness", { bodyHashHex: identified.value.result.identification.body_hash, signingKeyBech32 });
};

// prepareTransactionWitness/normaliseTransactionWitness — valid domain: the committed
// body hash and fixture signing key, with raw or TxWitness ConwayEra representations;
// invariant: signing is deterministic, bytes normalize exactly, and CBOR is preserved;
// taxonomy: malformed key material is DOMAIN_ERROR, malformed witness encodings are WITNESS_INPUT,
// and neither successful nor failed serialization may contain a signing secret.
test("property: detached witness preparation and normalization are deterministic, byte-exact, and secret-free", async () => {
  for (const representation of ["raw", "envelope"]) {
    const [first, second] = await Promise.all([witnessPreparation(), witnessPreparation()]);
    assertEnvelope(first); assert.deepEqual(second, first);
    assert.equal(first.value.textEnvelope.type, "TxWitness ConwayEra");
    assert.equal(first.value.textEnvelope.cborHex, first.value.vkeyWitnessCborHex);
    assert.equal(first.value.signerHashHex, witnessFixture.requiredSignerHash, "prepared witness must bind the committed required signer");
    const normalised = await one("normaliseTransactionWitness", witnessRepresentation(first, representation));
    assert.deepEqual(normalised, {
      ok: true,
      value: { cborHex: first.value.vkeyWitnessCborHex, textEnvelope: first.value.textEnvelope },
    });
    for (const reRepresentation of ["raw", "envelope"]) {
      const again = await one("normaliseTransactionWitness", witnessRepresentation(normalised, reRepresentation));
      assert.deepEqual(again, normalised, `normalization must be idempotent through ${representation}/${reRepresentation}`);
    }
    assert.equal(JSON.stringify(first).includes(witnessFixture.signingKey), false, "successful witness leaked signing key");
  }
  await fc.assert(fc.asyncProperty(
    fc.shuffledSubarray(["raw", "envelope"], { minLength: 2, maxLength: 2 }),
    async (representations) => {
      const prepared = await witnessPreparation();
      const normalised = [];
      for (const representation of representations) normalised.push(await one("normaliseTransactionWitness", witnessRepresentation(prepared, representation)));
      assert.deepEqual(normalised[1], normalised[0], "generated safe representation order must preserve normalized witness bytes");
    },
  ), propertyParameters(2));
  assertError(await one("prepareTransactionWitness", { bodyHashHex: "00".repeat(32), signingKeyBech32: witnessFixture.secretSentinel }), "DOMAIN_ERROR");
  assertError(await one("normaliseTransactionWitness", { cborHex: "not-cbor" }), "WITNESS_INPUT");
  const failure = await one("prepareTransactionWitness", { bodyHashHex: "00".repeat(32), signingKeyBech32: witnessFixture.secretSentinel });
  assert.equal(JSON.stringify(failure).includes(witnessFixture.secretSentinel), false, "witness diagnostic leaked secret");
});

// attachTransactionWitness/planTransactionWitnesses — valid domain: the fixed required-signer
// transaction, fixture witnesses, raw/TextEnvelope forms, and explicit replacement option;
// invariant: body identity, authorized signer transitions, and non-target witness content survive;
// taxonomy: duplicate replacement and unrelated signers are WITNESS_REPLACEMENT_FORBIDDEN and
// WITNESS_UNRELATED_SIGNER respectively, while malformed witness forms are WITNESS_INPUT.
test("property: witness attachment and planning retain exact signer and non-target safety contracts", async () => {
  const representationPairs = [
    ["raw", "raw"], ["raw", "envelope"], ["envelope", "raw"], ["envelope", "envelope"],
  ];
  await fc.assert(fc.asyncProperty(
    fc.shuffledSubarray(representationPairs, { minLength: representationPairs.length, maxLength: representationPairs.length }),
    async (pairs) => {
      for (const [transactionRepresentation, representation] of pairs) {
    const prepared = await witnessPreparation();
    const nonTarget = await witnessPreparation(witnessFixture.nonTargetSigningKey);
    const unrelated = await witnessPreparation(witnessFixture.unrelatedSigningKey);
    for (const result of [prepared, nonTarget, unrelated]) assert.equal(result.ok, true, JSON.stringify(result));
    const preexisting = await one("attachTransactionWitness", witnessTransaction(transactionRepresentation), witnessRepresentation(nonTarget, representation));
    assert.equal(preexisting.ok, true, JSON.stringify(preexisting));
    const [before, beforeEnvelope] = await foreign.invoke([
      { name: "planTransactionWitnesses", args: [{ cborHex: preexisting.value.signedTxCborHex }] },
      { name: "planTransactionWitnesses", args: [{ textEnvelope: preexisting.value.textEnvelope }] },
    ]);
    assert.deepEqual(beforeEnvelope, before, "pre-attachment witness planning must be raw/TextEnvelope parity");
    const inserted = await one("attachTransactionWitness", { textEnvelope: preexisting.value.textEnvelope }, witnessRepresentation(prepared, representation));
    const [after, afterEnvelope] = await foreign.invoke([
      { name: "planTransactionWitnesses", args: [{ cborHex: inserted.value.signedTxCborHex }] },
      { name: "planTransactionWitnesses", args: [{ textEnvelope: inserted.value.textEnvelope }] },
    ]);
    assert.equal(inserted.ok, true, JSON.stringify(inserted)); assert.equal(after.ok, true, JSON.stringify(after));
    assert.deepEqual(afterEnvelope, after, "post-attachment witness planning must be raw/TextEnvelope parity");
    assert.equal(inserted.value.witnessPatchAction, "inserted");
    assert.equal(inserted.value.textEnvelope.type, "Tx ConwayEra");
    assert.equal(inserted.value.textEnvelope.cborHex, inserted.value.signedTxCborHex);
    assert.equal(witnessPlan(after).body_hash, witnessPlan(before).body_hash, "attachment changed transaction body identity");
    assert.ok(witnessPlan(before).missing_vkey_witnesses.some(({ hash }) => hash === prepared.value.signerHashHex), "prepared signer must be missing before attachment");
    assert.ok(witnessPlan(before).present_vkey_witnesses.some(({ hash }) => hash === nonTarget.value.signerHashHex), "non-target signer must be present before attachment");
    assert.ok(witnessPlan(after).present_vkey_witnesses.some(({ hash }) => hash === prepared.value.signerHashHex), "prepared signer must be present after attachment");
    assert.deepEqual(
      witnessPlan(after).missing_vkey_witnesses,
      witnessPlan(before).missing_vkey_witnesses.filter(({ hash }) => hash !== prepared.value.signerHashHex),
      "attachment must remove exactly the prepared signer from the missing set",
    );
    assert.deepEqual(
      witnessPlan(after).present_vkey_witnesses.filter(({ hash }) => hash !== prepared.value.signerHashHex),
      witnessPlan(before).present_vkey_witnesses,
      "attachment changed pre-existing non-target vkeys",
    );
    for (const field of ["scripts", "datums", "redeemers"]) assert.deepEqual(witnessPlan(after)[field], witnessPlan(before)[field], `attachment changed ${field}`);
    const duplicate = await one("attachTransactionWitness", { cborHex: inserted.value.signedTxCborHex }, witnessRepresentation(prepared, representation));
    assertError(duplicate, "WITNESS_REPLACEMENT_FORBIDDEN");
    const replaced = await one("attachTransactionWitness", { cborHex: inserted.value.signedTxCborHex }, witnessRepresentation(prepared, representation), { replaceExisting: true });
    assert.equal(replaced.ok, true, JSON.stringify(replaced)); assert.equal(replaced.value.witnessPatchAction, "replaced");
    const replacedPlan = await one("planTransactionWitnesses", { cborHex: replaced.value.signedTxCborHex });
    assert.equal(replacedPlan.ok, true, JSON.stringify(replacedPlan));
    assert.equal(witnessPlan(replacedPlan).body_hash, witnessPlan(before).body_hash, "authorized replacement changed transaction body identity");
    assert.ok(witnessPlan(replacedPlan).present_vkey_witnesses.some(({ hash }) => hash === nonTarget.value.signerHashHex), "authorized replacement removed the non-target signer");
    assertError(await one("attachTransactionWitness", witnessTransaction("raw"), witnessRepresentation(unrelated, representation)), "WITNESS_UNRELATED_SIGNER");
    assert.deepEqual(witnessPlan(after).missing_vkey_witnesses, []);
      }
    },
  ), propertyParameters(2));
});

// validateTransaction/evaluateTransactionScripts — valid domain: every committed ledger fixture
// state and its packaged context; invariant: ledger truth states and redeemer details are retained
// exactly; taxonomy: successful engine verdicts are valid|invalid|incomplete|rejected and
// succeeded|failed|incomplete|rejected|not_applicable, not JavaScript truthiness or fallback values.
test("property: ledger validation and script evaluation preserve every committed truth state exactly", async () => {
  const completeOptions = ledgerFixture.complete.options;
  const invalidOptions = { ...completeOptions, context: { ...completeOptions.context, network: ledgerFixture.mutations.invalidNetwork } };
  const rejectedOptions = { ...completeOptions, context: ledgerFixture.mutations.rejectedContext };
  const transactionRepresentation = (cborHex, representation) => representation === "raw"
    ? { cborHex }
    : { textEnvelope: JSON.stringify({ type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex }) };
  const ledgerCall = async (name, input, options) => (
    await foreign.invoke([{ name, args: options === undefined ? [input] : [input, options] }])
  )[0];
  const validateCases = [
    ["valid", ledgerFixture.complete.transactionCbor, completeOptions],
    ["invalid", ledgerFixture.complete.transactionCbor, invalidOptions],
    ["incomplete", transactionCbor, undefined],
    ["rejected", ledgerFixture.complete.transactionCbor, rejectedOptions],
  ];
  const evaluateCases = [
    ["succeeded", ledgerFixture.complete.transactionCbor, completeOptions],
    ["failed", ledgerFixture.complete.transactionCbor.replace(ledgerFixture.mutations.failedMint.from, ledgerFixture.mutations.failedMint.to), completeOptions],
    ["incomplete", transactionCbor, undefined],
    ["rejected", ledgerFixture.complete.transactionCbor, rejectedOptions],
    ["notApplicable", ledgerFixture.noScriptTransactionCbor, undefined],
  ];
  const validation = {};
  const evaluation = {};
  for (const [state, cborHex, options] of validateCases) {
    const [raw, envelope] = await Promise.all(["raw", "envelope"].map((representation) => ledgerCall("validateTransaction", transactionRepresentation(cborHex, representation), options)));
    assert.deepEqual(envelope, raw, `validation ${state} must be raw/TextEnvelope parity`);
    validation[state] = raw;
  }
  for (const [state, cborHex, options] of evaluateCases) {
    const [raw, envelope] = await Promise.all(["raw", "envelope"].map((representation) => ledgerCall("evaluateTransactionScripts", transactionRepresentation(cborHex, representation), options)));
    assert.deepEqual(envelope, raw, `evaluation ${state} must be raw/TextEnvelope parity`);
    evaluation[state] = raw;
  }
  for (const result of [...Object.values(validation), ...Object.values(evaluation)]) assert.equal(result.ok, true, JSON.stringify(result));
  for (const [state, result] of Object.entries(validation)) assert.equal(result.value.result.validation.status, ledgerFixture.expected.validationStatuses[state]);
  for (const [state, result] of Object.entries(evaluation)) assert.equal(result.value.result.script_evaluation.status, ledgerFixture.expected.evaluationStatuses[state]);
  const succeeded = evaluation.succeeded.value.result.script_evaluation.redeemers[0];
  assert.deepEqual({ purpose: succeeded.purpose, index: succeeded.index, status: succeeded.status, evaluatedExUnits: succeeded.evaluated_ex_units }, ledgerFixture.expected.succeededRedeemer);
  const failedRedeemer = evaluation.failed.value.result.script_evaluation.redeemers[0];
  assert.deepEqual({ purpose: failedRedeemer.purpose, index: failedRedeemer.index, status: failedRedeemer.status, failureCode: failedRedeemer.failure.code }, ledgerFixture.expected.failedRedeemer);
});

// Witness and ledger malformed inputs — valid domain: deliberately wrong TextEnvelope types and
// malformed CBOR around committed artifacts; invariant: decoding is rejected before a result exists;
// taxonomy: witness forms are WITNESS_INPUT and transaction forms are DOMAIN_ERROR.
test("property: witness and ledger artifacts reject malformed and wrong-envelope representations exactly", async () => {
  const prepared = await witnessPreparation();
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const wrongWitness = { textEnvelope: { type: "Tx ConwayEra", description: "Ledger Cddl Format", cborHex: prepared.value.vkeyWitnessCborHex } };
  assertError(await one("attachTransactionWitness", witnessTransaction("raw"), wrongWitness), "WITNESS_INPUT");
  const wrongTransaction = { textEnvelope: JSON.stringify({ type: "TxWitness ConwayEra", description: "Ledger Cddl Format", cborHex: transactionCbor }) };
  for (const name of ["planTransactionWitnesses", "validateTransaction", "evaluateTransactionScripts"]) assertError(await one(name, wrongTransaction), "DOMAIN_ERROR");
  for (const name of ["planTransactionWitnesses", "validateTransaction", "evaluateTransactionScripts"]) assertError(await one(name, { cborHex: "not-cbor" }), "DOMAIN_ERROR");
});

// Ledger-engine boundaries — valid domain: all four ledger-crossing exports over committed
// witness/transaction artifacts; invariant: real artifact replacement is the only engine boundary;
// taxonomy: missing, incompatible, execution, and malformed protocol artifacts remain exact
// ENGINE_* failures with no fallback ledger result.
test("property: every ledger-crossing witness export retains exact engine failure taxonomy", async () => {
  const prepared = await witnessPreparation();
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const calls = () => foreign.invoke([
    { name: "attachTransactionWitness", args: [witnessTransaction("raw"), witnessRepresentation(prepared, "raw")] },
    { name: "planTransactionWitnesses", args: [witnessTransaction("raw")] },
    { name: "validateTransaction", args: [witnessTransaction("raw")] },
    { name: "evaluateTransactionScripts", args: [witnessTransaction("raw")] },
  ]);
  const assertFailures = async (bytes, code) => withTransactionEngine(bytes, async () => {
    for (const result of await calls()) assertError(result, code);
  });
  await assertFailures(null, "ENGINE_NOT_FOUND");
  await assertFailures("not a WebAssembly binary", "ENGINE_INCOMPATIBLE");
  const abnormalExit = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x60, 0x01, 0x7f, 0x00, 0x60, 0x00, 0x00, 0x02, 0x24, 0x01, 0x16, ...Buffer.from("wasi_snapshot_preview1"), 0x09, ...Buffer.from("proc_exit"), 0x00, 0x00, 0x03, 0x02, 0x01, 0x01, 0x07, 0x0a, 0x01, 0x06, ...Buffer.from("_start"), 0x00, 0x01, 0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x2a, 0x10, 0x00, 0x0b]);
  const emptyStart = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x07, 0x0a, 0x01, 0x06, 0x5f, 0x73, 0x74, 0x61, 0x72, 0x74, 0x00, 0x00, 0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b]);
  await assertFailures(abnormalExit, "ENGINE_EXECUTION");
  await assertFailures(emptyStart, "ENGINE_PROTOCOL");
});

// Contract inventory — valid domain: the current 25-export public surface; invariant:
// every named public operation has a canonical property group; taxonomy: inventory drift is an
// assertion failure, never an omitted or fallback contract. The six Slice-3 names are registered
// only in GREEN, after the substantive properties above have executed and exposed this honest RED.
const contractInventory = [
  "CskError", "inspectAddress", "generateMnemonic", "validateMnemonic", "deriveKeys", "constructShelleyAddresses",
  "constructIcarusAddressFromMnemonic", "constructByronAddressFromMnemonic", "constructIcarusAddress", "constructByronAddress",
  "signPayload", "verifySignature", "analyzeNativeScriptHex", "analyzeNativeScriptJson", "analyzeScriptTemplateJson",
  "inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent",
  "prepareTransactionWitness", "normaliseTransactionWitness", "attachTransactionWitness", "planTransactionWitnesses",
  "validateTransaction", "evaluateTransactionScripts",
];
test("property: current public contract inventory is complete", () => {
  assert.deepEqual(contractInventory, [
    "CskError", "inspectAddress", "generateMnemonic", "validateMnemonic", "deriveKeys", "constructShelleyAddresses",
    "constructIcarusAddressFromMnemonic", "constructByronAddressFromMnemonic", "constructIcarusAddress", "constructByronAddress",
    "signPayload", "verifySignature", "analyzeNativeScriptHex", "analyzeNativeScriptJson", "analyzeScriptTemplateJson",
    "inspectTransaction", "browseTransaction", "identifyTransaction", "transactionIntent",
    "prepareTransactionWitness", "normaliseTransactionWitness", "attachTransactionWitness", "planTransactionWitnesses",
    "validateTransaction", "evaluateTransactionScripts",
  ]);
});
