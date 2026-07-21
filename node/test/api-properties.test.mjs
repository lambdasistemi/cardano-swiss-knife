import assert from "node:assert/strict";
import { after, before, test } from "node:test";
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
