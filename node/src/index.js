import * as Address from "../../output/Cardano.Offline.Address/index.js";
import * as Key from "../../output/Cardano.Offline.Key/index.js";
import * as Mnemonic from "../../output/Cardano.Offline.Mnemonic/index.js";
import * as Payload from "../../output/Cardano.Offline.Payload/index.js";
import * as Script from "../../output/Cardano.Offline.Script/index.js";
import * as Transaction from "../../output/Cardano.Transaction/index.js";
import * as TransactionLedger from "../../output/Cardano.Transaction.Ledger/index.js";
import * as Provider from "../../output/Cardano.Provider/index.js";
import * as Aff from "../../output/Effect.Aff/index.js";
import * as Either from "../../output/Data.Either/index.js";
import * as Maybe from "../../output/Data.Maybe/index.js";
import { CskError, toCskError } from "./error.js";
import { runTransactionOperation } from "./transaction-engine.js";
import { importBooks } from "../../lib/src/Cardano/Transaction/Book.js";
import { resolveRdf } from "./rdf-engine.js";

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

export const inspectAddress = (address) => operation(async () => fromEither(await awaitAff(Address.eitherInspectAddress(address))));
export const generateMnemonic = (input = 12) => operation(async () => Mnemonic.generateMnemonic(typeof input === "number" ? input : input.wordCount)());
export const validateMnemonic = (input) => operation(async () => Mnemonic.validateMnemonic(Array.isArray(input) ? input : input.mnemonic));
export const deriveKeys = ({ mnemonic, accountIndex, role: roleValue, addressIndex }) => operation(async () => await awaitAff(Key.derivePipeline(mnemonic)(accountIndex)(required(role(roleValue), "Role"))(addressIndex)));
export const constructShelleyAddresses = ({ network, paymentXPubBech32, stakeXPubBech32 }) => operation(async () => fromEither(Key.constructShelleyAddresses(required(shelleyNetwork(network), "Shelley network"))(paymentXPubBech32 == null ? Maybe.Nothing.value : Maybe.Just.create(paymentXPubBech32))(stakeXPubBech32)));
export const constructIcarusAddressFromMnemonic = ({ network, mnemonic, accountIndex, role: roleValue, addressIndex }) => operation(async () => await awaitAff(Key.constructIcarusAddressFromMnemonic(required(legacyNetwork(network), "Legacy network"))(mnemonic)(accountIndex)(required(icarusRole(roleValue), "Icarus role"))(addressIndex)));
export const constructByronAddressFromMnemonic = ({ network, mnemonic, accountIndex, addressIndex }) => operation(async () => await awaitAff(Key.constructByronAddressFromMnemonic(required(legacyNetwork(network), "Legacy network"))(mnemonic)(accountIndex)(addressIndex)));
export const constructIcarusAddress = ({ network, addressXPubBech32 }) => operation(async () => await awaitAff(Key.constructIcarusAddress(required(legacyNetwork(network), "Legacy network"))(parseXpub(addressXPubBech32))));
export const constructByronAddress = ({ network, addressXPubBech32, rootXPubBech32, derivationPath }) => operation(async () => await awaitAff(Key.constructByronAddress(required(legacyNetwork(network), "Legacy network"))(parseXpub(addressXPubBech32))(parseXpub(rootXPubBech32))(derivationPath)));
export const signPayload = ({ payloadMode: mode, payloadInput, signingKeyBech32 }) => operation(async () => fromEither(await awaitAff(Payload.signPayload(required(payloadMode(mode), "Payload mode"))(payloadInput)(signingKeyBech32))));
export const verifySignature = ({ payloadMode: mode, payloadInput, verificationKeyBech32, signatureHex }) => operation(async () => fromEither(await awaitAff(Payload.verifySignature(required(payloadMode(mode), "Payload mode"))(payloadInput)(verificationKeyBech32)(signatureHex))));
export const analyzeNativeScriptHex = (input) => operation(async () => fromEither(Script.analyzeNativeScriptHex(typeof input === "string" ? input : input.cborHex)));
export const analyzeNativeScriptJson = (input) => operation(async () => fromEither(Script.analyzeNativeScriptJson(typeof input === "string" ? input : input.json)));
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

export const inspectTransaction = (input, options) => transactionOperation("tx.inspect", input, options);
export const browseTransaction = (input, options = {}) => transactionOperation("tx.browse", input, options);
export const identifyTransaction = (input, options) => transactionOperation("tx.identify", input, options);
export const transactionIntent = (input, options) => transactionOperation("tx.intent", input, options);
export const planTransactionWitnesses = (input, options) => transactionOperation(TransactionLedger.planTransactionWitnessesOperation, input, options);
export const validateTransaction = (input, options) => transactionOperation(TransactionLedger.validateTransactionOperation, input, options);
export const evaluateTransactionScripts = (input, options) => transactionOperation(TransactionLedger.evaluateTransactionScriptsOperation, input, options);
