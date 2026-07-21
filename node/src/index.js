import * as Address from "../../output/Cardano.Offline.Address/index.js";
import * as Key from "../../output/Cardano.Offline.Key/index.js";
import * as Mnemonic from "../../output/Cardano.Offline.Mnemonic/index.js";
import * as Payload from "../../output/Cardano.Offline.Payload/index.js";
import * as Script from "../../output/Cardano.Offline.Script/index.js";
import * as Transaction from "../../output/Cardano.Transaction/index.js";
import * as TransactionLedger from "../../output/Cardano.Transaction.Ledger/index.js";
import * as TransactionWitness from "../../output/Cardano.Transaction.Witness/index.js";
import * as Provider from "../../output/Cardano.Provider/index.js";
import * as Aff from "../../output/Effect.Aff/index.js";
import * as Either from "../../output/Data.Either/index.js";
import * as Maybe from "../../output/Data.Maybe/index.js";
import { CskError, toCskError } from "./error.js";
import { runTransactionOperation } from "./transaction-engine.js";
import { importBooks } from "../../lib/src/Cardano/Transaction/Book.js";
import { resolveRdf } from "./rdf-engine.js";

/**
 * A JSON primitive accepted by public API inputs and returned by JSON-shaped
 * operation values.
 * @typedef {string | number | boolean | null} JsonPrimitive
 */

/**
 * A recursively JSON-serialisable public value.
 * @typedef {JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }} JsonValue
 */

/**
 * The stable error codes callers can branch on.
 * @typedef {"DOMAIN_ERROR" | "BOOK_IMPORT" | "ENGINE_NOT_FOUND" | "ENGINE_INCOMPATIBLE" | "ENGINE_EXECUTION" | "ENGINE_PROTOCOL" | "PROVIDER_AUTHENTICATION" | "PROVIDER_RATE_LIMIT" | "PROVIDER_SERVER" | "PROVIDER_TRANSPORT" | "PROVIDER_DECODE" | "RDF_ENGINE_NOT_FOUND" | "RDF_ENGINE_INCOMPATIBLE" | "RDF_ENGINE_EXECUTION" | "RDF_ENGINE_PROTOCOL" | "WITNESS_INPUT" | "WITNESS_ATTACHMENT_REJECTED" | "WITNESS_UNRELATED_SIGNER" | "WITNESS_REPLACEMENT_FORBIDDEN" | "WITNESS_ACTION_MISMATCH"} CskErrorCode
 */

/**
 * A public operation failure.
 * @typedef {object} CskFailure
 * @property {CskErrorCode} code Stable code identifying the error family.
 * @property {string} message Human-readable explanation of the failure.
 */

/**
 * A non-throwing operation result.
 * @template T
 * @typedef {{ ok: true, value: T } | { ok: false, error: CskFailure }} CskResult<T>
 */

const ok = (value) => ({ ok: true, value: normalise(value) });
const fail = (error) => ({ ok: false, error: { code: error.code, message: error.message } });

const normalise = (value) => {
  if (value instanceof Maybe.Nothing) return null;
  if (value instanceof Maybe.Just) return normalise(value.value0);
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalise(item)]));
  return value;
};

const fromEither = (value) => {
  if (value instanceof Either.Left) throw toCskError(new Error(value.value0));
  if (value instanceof Either.Right) return value.value0;
  throw new CskError("ENGINE_PROTOCOL", "PureScript returned a malformed result.");
};

const awaitAff = (aff) => new Promise((resolve, reject) => {
  Aff.runAff((outcome) => () => {
    if (outcome instanceof Either.Left) reject(outcome.value0);
    else if (outcome instanceof Either.Right) resolve(outcome.value0);
    else reject(new CskError("ENGINE_PROTOCOL", "PureScript returned a malformed asynchronous result."));
  })(aff)();
});

const operation = async (thunk) => {
  try {
    return ok(await thunk());
  } catch (error) {
    const typed = toCskError(error);
    return fail(typed);
  }
};

const role = (value) => ({ external: Key.UTxOExternal.value, internal: Key.UTxOInternal.value, stake: Key.Stake.value })[value];
const icarusRole = (value) => ({ external: Key.IcarusExternal.value, internal: Key.IcarusInternal.value })[value];
const legacyNetwork = (value) => {
  if (typeof value === "number") return Key.LegacyCustom.create(value);
  return ({ mainnet: Key.LegacyMainnet.value, staging: Key.LegacyStaging.value, testnet: Key.LegacyTestnet.value, preview: Key.LegacyPreview.value, preprod: Key.LegacyPreprod.value })[value];
};
const shelleyNetwork = (value) => {
  if (typeof value === "number") return Key.ShelleyCustom.create(value);
  return ({ mainnet: Key.ShelleyMainnet.value, preprod: Key.ShelleyPreprod.value, preview: Key.ShelleyPreview.value })[value];
};
const required = (value, label) => {
  if (value == null) throw new CskError("DOMAIN_ERROR", `${label} is required.`);
  return value;
};
const parseXpub = (value) => fromEither(Key.parseBootstrapXPub(required(value, "Extended public key")));
const payloadMode = (value) => value === "text" ? Payload.PayloadText.value : value === "hex" ? Payload.PayloadHex.value : undefined;

export { CskError };

/**
 * Inspects a Cardano address.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or the `ENGINE_*`
 * family.
 *
 * @param {string} address Bech32 or Byron address to inspect.
 * @returns {Promise<CskResult<JsonValue>>} The normalised inspection value or
 * a coded failure.
 * @example
 * const result = await inspectAddress("addr1...");
 */
export const inspectAddress = (address) => operation(async () => fromEither(await awaitAff(Address.eitherInspectAddress(address))));
/**
 * Generates a BIP-39 mnemonic.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use the `ENGINE_*` or `DOMAIN_ERROR`
 * family.
 *
 * @param {number | { wordCount: number }} [input=12] Word count or an object
 * containing `wordCount`.
 * @returns {Promise<CskResult<string[]>>} Generated mnemonic words or a coded
 * failure.
 * @example
 * const result = await generateMnemonic({ wordCount: 24 });
 */
export const generateMnemonic = (input = 12) => operation(async () => Mnemonic.generateMnemonic(typeof input === "number" ? input : input.wordCount)());
/**
 * Validates a mnemonic phrase.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {string[] | { mnemonic: string[] }} input Mnemonic words or an object
 * containing `mnemonic`.
 * @returns {Promise<CskResult<boolean>>} Whether the mnemonic is valid or a
 * coded failure.
 * @example
 * const result = await validateMnemonic(["abandon", "ability"]);
 */
export const validateMnemonic = (input) => operation(async () => Mnemonic.validateMnemonic(Array.isArray(input) ? input : input.mnemonic));
/**
 * Derives Cardano keys from a mnemonic.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {object} input Derivation input.
 * @param {string[]} input.mnemonic Source mnemonic words.
 * @param {number} input.accountIndex Hardened account index.
 * @param {"external" | "internal" | "stake"} input.role Derived key role.
 * @param {number} input.addressIndex Address index for the selected role.
 * @returns {Promise<CskResult<JsonValue>>} Derived key material or a coded
 * failure.
 * @example
 * const result = await deriveKeys({ mnemonic, accountIndex: 0, role: "external", addressIndex: 0 });
 */
export const deriveKeys = ({ mnemonic, accountIndex, role: roleValue, addressIndex }) => operation(async () => await awaitAff(Key.derivePipeline(mnemonic)(accountIndex)(required(role(roleValue), "Role"))(addressIndex)));
/**
 * Constructs Shelley payment and optional stake addresses.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {object} input Shelley address input.
 * @param {"mainnet" | "preprod" | "preview" | number} input.network Network
 * name or custom network id.
 * @param {string} [input.paymentXPubBech32] Optional payment extended public key.
 * @param {string} [input.stakeXPubBech32] Optional stake extended public key.
 * @returns {Promise<CskResult<JsonValue>>} Constructed addresses or a coded
 * failure.
 * @example
 * const result = await constructShelleyAddresses({ network: "preview", paymentXPubBech32 });
 */
export const constructShelleyAddresses = ({ network, paymentXPubBech32, stakeXPubBech32 }) => operation(async () => fromEither(Key.constructShelleyAddresses(required(shelleyNetwork(network), "Shelley network"))(paymentXPubBech32 == null ? Maybe.Nothing.value : Maybe.Just.create(paymentXPubBech32))(stakeXPubBech32)));
/**
 * Constructs an Icarus address by deriving its key from a mnemonic.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {object} input Icarus derivation input.
 * @param {"mainnet" | "staging" | "testnet" | "preview" | "preprod" | number} input.network Legacy network name or id.
 * @param {string[]} input.mnemonic Source mnemonic words.
 * @param {number} input.accountIndex Hardened account index.
 * @param {"external" | "internal"} input.role Icarus key role.
 * @param {number} input.addressIndex Address index.
 * @returns {Promise<CskResult<string>>} Constructed address or a coded failure.
 * @example
 * const result = await constructIcarusAddressFromMnemonic({ network: "mainnet", mnemonic, accountIndex: 0, role: "external", addressIndex: 0 });
 */
export const constructIcarusAddressFromMnemonic = ({ network, mnemonic, accountIndex, role: roleValue, addressIndex }) => operation(async () => await awaitAff(Key.constructIcarusAddressFromMnemonic(required(legacyNetwork(network), "Legacy network"))(mnemonic)(accountIndex)(required(icarusRole(roleValue), "Icarus role"))(addressIndex)));
/**
 * Constructs a Byron address by deriving its key from a mnemonic.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {object} input Byron derivation input.
 * @param {"mainnet" | "staging" | "testnet" | "preview" | "preprod" | number} input.network Legacy network name or id.
 * @param {string[]} input.mnemonic Source mnemonic words.
 * @param {number} input.accountIndex Hardened account index.
 * @param {number} input.addressIndex Address index.
 * @returns {Promise<CskResult<string>>} Constructed address or a coded failure.
 * @example
 * const result = await constructByronAddressFromMnemonic({ network: "mainnet", mnemonic, accountIndex: 0, addressIndex: 0 });
 */
export const constructByronAddressFromMnemonic = ({ network, mnemonic, accountIndex, addressIndex }) => operation(async () => await awaitAff(Key.constructByronAddressFromMnemonic(required(legacyNetwork(network), "Legacy network"))(mnemonic)(accountIndex)(addressIndex)));
/**
 * Constructs an Icarus address from an extended public key.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {object} input Icarus public-key input.
 * @param {"mainnet" | "staging" | "testnet" | "preview" | "preprod" | number} input.network Legacy network name or id.
 * @param {string} input.addressXPubBech32 Address extended public key.
 * @returns {Promise<CskResult<string>>} Constructed address or a coded failure.
 * @example
 * const result = await constructIcarusAddress({ network: "mainnet", addressXPubBech32 });
 */
export const constructIcarusAddress = ({ network, addressXPubBech32 }) => operation(async () => await awaitAff(Key.constructIcarusAddress(required(legacyNetwork(network), "Legacy network"))(parseXpub(addressXPubBech32))));
/**
 * Constructs a Byron address from address and root extended public keys.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {object} input Byron public-key input.
 * @param {"mainnet" | "staging" | "testnet" | "preview" | "preprod" | number} input.network Legacy network name or id.
 * @param {string} input.addressXPubBech32 Address extended public key.
 * @param {string} input.rootXPubBech32 Root extended public key.
 * @param {string} input.derivationPath Byron derivation path.
 * @returns {Promise<CskResult<JsonValue>>} Constructed address data or a coded
 * failure.
 * @example
 * const result = await constructByronAddress({ network: "mainnet", addressXPubBech32, rootXPubBech32, derivationPath });
 */
export const constructByronAddress = ({ network, addressXPubBech32, rootXPubBech32, derivationPath }) => operation(async () => await awaitAff(Key.constructByronAddress(required(legacyNetwork(network), "Legacy network"))(parseXpub(addressXPubBech32))(parseXpub(rootXPubBech32))(derivationPath)));
/**
 * Signs text or hexadecimal payload input.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {object} input Signing input.
 * @param {"text" | "hex"} input.payloadMode Interpretation of `payloadInput`.
 * @param {string} input.payloadInput Payload text or hexadecimal bytes.
 * @param {string} input.signingKeyBech32 Signing key in Bech32 form.
 * @returns {Promise<CskResult<JsonValue>>} Signature data or a coded failure.
 * @example
 * const result = await signPayload({ payloadMode: "text", payloadInput: "hello", signingKeyBech32 });
 */
export const signPayload = ({ payloadMode: mode, payloadInput, signingKeyBech32 }) => operation(async () => fromEither(await awaitAff(Payload.signPayload(required(payloadMode(mode), "Payload mode"))(payloadInput)(signingKeyBech32))));
/**
 * Verifies a payload signature.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {object} input Verification input.
 * @param {"text" | "hex"} input.payloadMode Interpretation of `payloadInput`.
 * @param {string} input.payloadInput Payload text or hexadecimal bytes.
 * @param {string} input.verificationKeyBech32 Verification key in Bech32 form.
 * @param {string} input.signatureHex Signature bytes in hexadecimal.
 * @returns {Promise<CskResult<boolean>>} Signature validity or a coded failure.
 * @example
 * const result = await verifySignature({ payloadMode: "text", payloadInput: "hello", verificationKeyBech32, signatureHex });
 */
export const verifySignature = ({ payloadMode: mode, payloadInput, verificationKeyBech32, signatureHex }) => operation(async () => fromEither(await awaitAff(Payload.verifySignature(required(payloadMode(mode), "Payload mode"))(payloadInput)(verificationKeyBech32)(signatureHex))));
/**
 * Analyses a native script encoded as CBOR hexadecimal.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {string | { cborHex: string }} input CBOR hexadecimal or an object
 * containing `cborHex`.
 * @returns {Promise<CskResult<JsonValue>>} Script analysis or a coded failure.
 * @example
 * const result = await analyzeNativeScriptHex({ cborHex });
 */
export const analyzeNativeScriptHex = (input) => operation(async () => fromEither(Script.analyzeNativeScriptHex(typeof input === "string" ? input : input.cborHex)));
/**
 * Analyses a native script represented as JSON.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {string | { json: JsonValue }} input JSON text or an object containing
 * `json`.
 * @returns {Promise<CskResult<JsonValue>>} Script analysis or a coded failure.
 * @example
 * const result = await analyzeNativeScriptJson({ json: { type: "sig" } });
 */
export const analyzeNativeScriptJson = (input) => operation(async () => fromEither(Script.analyzeNativeScriptJson(typeof input === "string" ? input : input.json)));
/**
 * Analyses a script template represented as JSON.
 *
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false,
 * error }` `CskResult`; failures use `DOMAIN_ERROR` or `ENGINE_*`.
 *
 * @param {string | { json: JsonValue }} input JSON text or an object containing
 * `json`.
 * @returns {Promise<CskResult<JsonValue>>} Template analysis or a coded failure.
 * @example
 * const result = await analyzeScriptTemplateJson({ json: { type: "all", scripts: [] } });
 */
export const analyzeScriptTemplateJson = (input) => operation(async () => fromEither(Script.analyzeScriptTemplateJson(typeof input === "string" ? input : input.json)));

const provider = (value) => ({ blockfrost: Provider.Blockfrost.value, koios: Provider.Koios.value })[value];
const providerNetwork = (value) => ({ mainnet: Provider.Mainnet.value, preprod: Provider.Preprod.value, preview: Provider.Preview.value })[value];

const transactionInput = async (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CskError("DOMAIN_ERROR", "Transaction input must be an object with cborHex, textEnvelope, or txHash provider source.");
  }

  const hasCbor = Object.hasOwn(input, "cborHex");
  const hasEnvelope = Object.hasOwn(input, "textEnvelope");
  const hasHash = Object.hasOwn(input, "txHash") || Object.hasOwn(input, "provider") || Object.hasOwn(input, "network") || Object.hasOwn(input, "credential");
  if (Number(hasCbor) + Number(hasEnvelope) + Number(hasHash) !== 1) {
    throw new CskError("DOMAIN_ERROR", "Transaction input must contain exactly one of cborHex, textEnvelope, or txHash provider source.");
  }

  if (hasHash) {
    const selectedProvider = provider(input.provider);
    const selectedNetwork = providerNetwork(input.network);
    if (typeof input.txHash !== "string" || !selectedProvider || !selectedNetwork || (input.credential != null && typeof input.credential !== "string")) {
      throw new CskError("DOMAIN_ERROR", "Transaction hash input requires txHash, provider, network, and an optional string credential.");
    }
    return awaitAff(Provider.fetchTxCborForNode(selectedProvider)(selectedNetwork)(input.credential ?? "")(input.txHash));
  }

  const value = hasCbor
    ? input.cborHex
    : typeof input.textEnvelope === "string"
      ? input.textEnvelope
      : JSON.stringify(input.textEnvelope);
  if (typeof value !== "string") {
    throw new CskError("DOMAIN_ERROR", "Transaction input must be CBOR hex or a TextEnvelope value.");
  }

  return fromEither(Transaction.decodeTransactionInput(value));
};

const witnessInput = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CskError("WITNESS_INPUT", "Witness input must be an object with cborHex or textEnvelope.");
  }
  const hasCbor = Object.hasOwn(input, "cborHex");
  const hasEnvelope = Object.hasOwn(input, "textEnvelope");
  if (Number(hasCbor) + Number(hasEnvelope) !== 1) {
    throw new CskError("WITNESS_INPUT", "Witness input must contain exactly one of cborHex or textEnvelope.");
  }
  const value = hasCbor
    ? input.cborHex
    : typeof input.textEnvelope === "string"
      ? input.textEnvelope
      : JSON.stringify(input.textEnvelope);
  if (typeof value !== "string") {
    throw new CskError("WITNESS_INPUT", "Witness input must be CBOR hex or a TextEnvelope value.");
  }
  try {
    return fromEither(TransactionWitness.decodeWitnessInput(value));
  } catch (error) {
    throw new CskError("WITNESS_INPUT", error.message, error);
  }
};

const witnessPlan = (value) => value?.result?.witness_plan ?? value?.witness_plan;
const attachmentResult = (value) => value?.result?.witness_attachment ?? value?.witness_attachment;
const witnessPlanHashes = (plan, field) => {
  const entries = plan?.[field];
  if (!Array.isArray(entries)) throw new CskError("ENGINE_PROTOCOL", `The ledger-inspector witness plan omitted ${field}.`);
  const hashes = entries.map((entry) => typeof entry === "string" ? entry : entry?.hash);
  if (hashes.some((hash) => typeof hash !== "string")) throw new CskError("ENGINE_PROTOCOL", `The ledger-inspector witness plan contained an invalid ${field} entry.`);
  return new Set(hashes);
};

const encodeTransactionEnvelope = (cborHex) => {
  const serialized = fromEither(Transaction.encodeTransactionTextEnvelope(cborHex));
  return JSON.parse(serialized);
};

/**
 * Creates a detached transaction witness from a body hash and signing key.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `WITNESS_INPUT`, `DOMAIN_ERROR`, or `ENGINE_*`.
 * @param {object} input Witness preparation input.
 * @param {string} input.bodyHashHex Transaction body hash in hexadecimal.
 * @param {string} input.signingKeyBech32 Signing key in Bech32 form.
 * @returns {Promise<CskResult<JsonValue>>} Detached witness and text envelope or a coded failure.
 * @example
 * const result = await prepareTransactionWitness({ bodyHashHex, signingKeyBech32 });
 */
export const prepareTransactionWitness = (input) => operation(async () => {
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.bodyHashHex !== "string" || typeof input.signingKeyBech32 !== "string") {
    throw new CskError("WITNESS_INPUT", "Witness preparation requires bodyHashHex and signingKeyBech32 strings.");
  }
  const detached = await awaitAff(TransactionWitness.prepareWitness(input.bodyHashHex)(input.signingKeyBech32));
  const witness = fromEither(detached);
  return { ...witness, textEnvelope: JSON.parse(fromEither(TransactionWitness.encodeWitnessTextEnvelope(witness.vkeyWitnessCborHex))) };
});

/**
 * Normalises a detached witness into CBOR and a text envelope.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `WITNESS_INPUT`, `DOMAIN_ERROR`, or `ENGINE_*`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string }} input Witness CBOR or TextEnvelope input.
 * @returns {Promise<CskResult<JsonValue>>} Normalised witness data or a coded failure.
 * @example
 * const result = await normaliseTransactionWitness({ cborHex });
 */
export const normaliseTransactionWitness = (input) => operation(async () => {
  const cborHex = witnessInput(input);
  return { cborHex, textEnvelope: JSON.parse(fromEither(TransactionWitness.encodeWitnessTextEnvelope(cborHex))) };
});

const attachmentOperationOptions = async (input, txCbor, options) => {
  if (!Object.hasOwn(input, "txHash")) return options;
  const selectedProvider = provider(input.provider);
  const selectedNetwork = providerNetwork(input.network);
  const credential = input.credential ?? "";
  const inspection = await runTransactionOperation("tx.inspect", txCbor, options);
  const context = await awaitAff(Provider.resolveProducerTxContext(selectedProvider)(selectedNetwork)(credential)(!Provider.needsKey(selectedProvider) || credential !== "")(JSON.stringify(inspection)));
  return { ...options, ...JSON.parse(context) };
};

/**
 * Attaches one detached witness after validating its signer plan and replacement safety.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `WITNESS_*`, `PROVIDER_*`, `ENGINE_*`, or `DOMAIN_ERROR`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string } | { txHash: string, provider: "blockfrost" | "koios", network: "mainnet" | "preprod" | "preview", credential?: string }} input Transaction source.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string }} witness Detached witness source.
 * @param {{ replaceExisting?: boolean, books?: string[], [key: string]: JsonValue | undefined }} [options={}] Witness attachment options, including `replaceExisting`.
 * @returns {Promise<CskResult<JsonValue>>} Attached transaction data or a coded failure.
 * @example
 * const result = await attachTransactionWitness({ cborHex: txCbor }, { cborHex: witnessCbor });
 */
export const attachTransactionWitness = (input, witness, options = {}) => operation(async () => {
  const txCbor = await transactionInput(input);
  const witnessCbor = witnessInput(witness);
  const operationOptions = await attachmentOperationOptions(input, txCbor, options);

  const planResponse = await runTransactionOperation(TransactionLedger.planTransactionWitnessesOperation, txCbor, operationOptions);
  const plan = witnessPlan(planResponse);
  if (!plan || typeof plan !== "object") {
    throw new CskError("ENGINE_PROTOCOL", "The ledger-inspector witness plan response was malformed.");
  }
  const replaceExisting = options?.replaceExisting === true;
  const attached = attachmentResult(await runTransactionOperation(TransactionLedger.attachTransactionWitnessOperation, txCbor, { ...operationOptions, vkey_witness_cbor_hex: witnessCbor }));
  if (!attached || typeof attached !== "object" || attached.status !== "applied") {
    const message = attached?.errors?.map((error) => error?.message).filter(Boolean).join("; ") || "The ledger-inspector rejected the detached witness.";
    const code = /not required|unrelated/i.test(message) ? "WITNESS_UNRELATED_SIGNER" : "WITNESS_ATTACHMENT_REJECTED";
    throw new CskError(code, message);
  }
  const signedTxCborHex = attached.signed_tx_cbor_hex ?? attached.tx_cbor;
  const witnessPatchAction = attached.witness_patch_action;
  if (typeof signedTxCborHex !== "string" || signedTxCborHex === "" || typeof witnessPatchAction !== "string" || witnessPatchAction === "") {
    throw new CskError("ENGINE_PROTOCOL", "The ledger-inspector attachment response was incomplete.");
  }
  const beforePresent = witnessPlanHashes(plan, "present_vkey_witnesses");
  const required = new Set([...witnessPlanHashes(plan, "required_signers"), ...witnessPlanHashes(plan, "missing_vkey_witnesses")]);
  const afterResponse = await runTransactionOperation(TransactionLedger.planTransactionWitnessesOperation, signedTxCborHex, operationOptions);
  const afterPlan = witnessPlan(afterResponse);
  if (!afterPlan || typeof afterPlan !== "object") throw new CskError("ENGINE_PROTOCOL", "The ledger-inspector post-attachment witness plan response was malformed.");
  const afterPresent = witnessPlanHashes(afterPlan, "present_vkey_witnesses");
  const insertedSignerHashes = [...afterPresent].filter((hash) => !beforePresent.has(hash));
  const insertedIsRequired = insertedSignerHashes.length === 1 && required.has(insertedSignerHashes[0]);
  if (witnessPatchAction === "inserted" && !insertedIsRequired) {
    throw new CskError("WITNESS_UNRELATED_SIGNER", "The detached witness did not add exactly one signer required by the pre-mutation witness plan.");
  }
  let expectedAction;
  try {
    expectedAction = fromEither(TransactionWitness.attachmentSafety(witnessPatchAction === "inserted" && insertedIsRequired)(witnessPatchAction === "replaced")(replaceExisting));
  } catch (error) {
    const code = error.message.startsWith("Signer already present") ? "WITNESS_REPLACEMENT_FORBIDDEN" : "WITNESS_ACTION_MISMATCH";
    throw new CskError(code, error.message, error);
  }
  if (witnessPatchAction !== expectedAction) {
    throw new CskError("WITNESS_ACTION_MISMATCH", `The ledger-inspector reported ${witnessPatchAction}; signer safety requires ${expectedAction}.`);
  }
  return { signedTxCborHex, textEnvelope: encodeTransactionEnvelope(signedTxCborHex), witnessPatchAction };
});

const transactionOperation = (name, input, options = {}) => operation(async () => {
  let books;
  try { books = importBooks(options.books ?? []); }
  catch (error) { throw new CskError("BOOK_IMPORT", error.message, error); }
  const txCbor = await transactionInput(input);
  const hashSource = Object.hasOwn(input, "txHash");
  const needsProviderContext = TransactionLedger.requiresProviderContext(name)
    || name === "tx.identify"
    || name === "tx.intent";
  if (!hashSource || !needsProviderContext) {
    const value = await runTransactionOperation(name, txCbor, options);
    if (books.length === 0) return value;
    const rdf = await runTransactionOperation("tx.rdf", txCbor, options);
    const graph = rdf?.result?.rdf?.turtle ?? rdf?.rdf?.turtle ?? rdf?.turtle;
    if (!graph) throw new CskError("RDF_ENGINE_PROTOCOL", "The ledger-inspector tx.rdf operation returned no Turtle graph.");
    return { ...value, books, resolutions: await resolveRdf(graph, books) };
  }

  const selectedProvider = provider(input.provider);
  const selectedNetwork = providerNetwork(input.network);
  const credential = input.credential ?? "";
  const inspection = await runTransactionOperation("tx.inspect", txCbor, options);
  const context = await awaitAff(Provider.resolveProducerTxContext(selectedProvider)(selectedNetwork)(credential)(!Provider.needsKey(selectedProvider) || credential !== "")(JSON.stringify(inspection)));
  const contextArgs = JSON.parse(context);
  const value = await runTransactionOperation(name, txCbor, { ...options, ...contextArgs });
  if (books.length === 0) return { ...value, context: contextArgs.context };
  const rdf = await runTransactionOperation("tx.rdf", txCbor, { ...options, ...contextArgs });
  const graph = rdf?.result?.rdf?.turtle ?? rdf?.rdf?.turtle ?? rdf?.turtle;
  if (!graph) throw new CskError("RDF_ENGINE_PROTOCOL", "The ledger-inspector tx.rdf operation returned no Turtle graph.");
  return { ...value, context: contextArgs.context, books, resolutions: await resolveRdf(graph, books) };
});

/**
 * Inspects a transaction and optionally resolves inspection books.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `PROVIDER_*`, `RDF_ENGINE_*`, `BOOK_IMPORT`, `ENGINE_*`, or `DOMAIN_ERROR`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string } | { txHash: string, provider: "blockfrost" | "koios", network: "mainnet" | "preprod" | "preview", credential?: string }} input Transaction source.
 * @param {{ books?: string[], [key: string]: JsonValue | undefined }} [options] Operation options and optional book paths.
 * @returns {Promise<CskResult<JsonValue>>} Inspection data or a coded failure.
 * @example
 * const result = await inspectTransaction({ cborHex });
 */
export const inspectTransaction = (input, options) => transactionOperation("tx.inspect", input, options);
/**
 * Browses transaction contents and optionally resolves inspection books.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `PROVIDER_*`, `RDF_ENGINE_*`, `BOOK_IMPORT`, `ENGINE_*`, or `DOMAIN_ERROR`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string } | { txHash: string, provider: "blockfrost" | "koios", network: "mainnet" | "preprod" | "preview", credential?: string }} input Transaction source.
 * @param {{ books?: string[], [key: string]: JsonValue | undefined }} [options={}] Operation options and optional book paths.
 * @returns {Promise<CskResult<JsonValue>>} Browse data or a coded failure.
 * @example
 * const result = await browseTransaction({ cborHex }, { books: [] });
 */
export const browseTransaction = (input, options = {}) => transactionOperation("tx.browse", input, options);
/**
 * Identifies a transaction and optionally resolves inspection books.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `PROVIDER_*`, `RDF_ENGINE_*`, `BOOK_IMPORT`, `ENGINE_*`, or `DOMAIN_ERROR`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string } | { txHash: string, provider: "blockfrost" | "koios", network: "mainnet" | "preprod" | "preview", credential?: string }} input Transaction source.
 * @param {{ books?: string[], [key: string]: JsonValue | undefined }} [options] Operation options and optional book paths.
 * @returns {Promise<CskResult<JsonValue>>} Identification data or a coded failure.
 * @example
 * const result = await identifyTransaction({ cborHex });
 */
export const identifyTransaction = (input, options) => transactionOperation("tx.identify", input, options);
/**
 * Determines transaction intent and optionally resolves inspection books.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `PROVIDER_*`, `RDF_ENGINE_*`, `BOOK_IMPORT`, `ENGINE_*`, or `DOMAIN_ERROR`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string } | { txHash: string, provider: "blockfrost" | "koios", network: "mainnet" | "preprod" | "preview", credential?: string }} input Transaction source.
 * @param {{ books?: string[], [key: string]: JsonValue | undefined }} [options] Operation options and optional book paths.
 * @returns {Promise<CskResult<JsonValue>>} Intent data or a coded failure.
 * @example
 * const result = await transactionIntent({ cborHex });
 */
export const transactionIntent = (input, options) => transactionOperation("tx.intent", input, options);
/**
 * Plans the witnesses required by a transaction.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `PROVIDER_*`, `RDF_ENGINE_*`, `BOOK_IMPORT`, `ENGINE_*`, or `DOMAIN_ERROR`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string } | { txHash: string, provider: "blockfrost" | "koios", network: "mainnet" | "preprod" | "preview", credential?: string }} input Transaction source.
 * @param {{ books?: string[], [key: string]: JsonValue | undefined }} [options] Operation options and optional book paths.
 * @returns {Promise<CskResult<JsonValue>>} Witness plan data or a coded failure.
 * @example
 * const result = await planTransactionWitnesses({ cborHex });
 */
export const planTransactionWitnesses = (input, options) => transactionOperation(TransactionLedger.planTransactionWitnessesOperation, input, options);
/**
 * Validates a transaction against ledger rules.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `PROVIDER_*`, `RDF_ENGINE_*`, `BOOK_IMPORT`, `ENGINE_*`, or `DOMAIN_ERROR`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string } | { txHash: string, provider: "blockfrost" | "koios", network: "mainnet" | "preprod" | "preview", credential?: string }} input Transaction source.
 * @param {{ books?: string[], [key: string]: JsonValue | undefined }} [options] Operation options and optional book paths.
 * @returns {Promise<CskResult<JsonValue>>} Validation data or a coded failure.
 * @example
 * const result = await validateTransaction({ cborHex });
 */
export const validateTransaction = (input, options) => transactionOperation(TransactionLedger.validateTransactionOperation, input, options);
/**
 * Evaluates the executable scripts in a transaction.
 * Resolves rather than throws to a `{ ok: true, value }` / `{ ok: false, error }` `CskResult`; failures use `PROVIDER_*`, `RDF_ENGINE_*`, `BOOK_IMPORT`, `ENGINE_*`, or `DOMAIN_ERROR`.
 * @param {{ cborHex: string } | { textEnvelope: JsonValue | string } | { txHash: string, provider: "blockfrost" | "koios", network: "mainnet" | "preprod" | "preview", credential?: string }} input Transaction source.
 * @param {{ books?: string[], [key: string]: JsonValue | undefined }} [options] Operation options and optional book paths.
 * @returns {Promise<CskResult<JsonValue>>} Script evaluation data or a coded failure.
 * @example
 * const result = await evaluateTransactionScripts({ cborHex });
 */
export const evaluateTransactionScripts = (input, options) => transactionOperation(TransactionLedger.evaluateTransactionScriptsOperation, input, options);
