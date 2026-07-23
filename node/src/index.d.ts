/**
 * The public Node.js API for Cardano Swiss Knife.
 *
 * @remarks
 * All operations resolve to {@link CskResult} rather than throwing operational
 * failures. The executable property-based contract is maintained in
 * {@link https://github.com/lambdasistemi/cardano-swiss-knife/blob/main/node/test/api-properties.test.mjs | node/test/api-properties.test.mjs}.
 *
 * @packageDocumentation
 */

/** Release version derived from package.json (sole authored authority). */
export declare const version: string;

/** A JSON scalar accepted by JSON-oriented API operations. */
export type JsonPrimitive = string | number | boolean | null;
/** A recursively JSON-serialisable value. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
/** A JSON object returned by operations with extensible structured output. */
export type JsonObject = { [key: string]: JsonValue };

/** Stable error codes returned in failed {@link CskResult} values. */
export type CskErrorCode =
  | "DOMAIN_ERROR"
  | "BOOK_IMPORT"
  | "ENGINE_NOT_FOUND"
  | "ENGINE_INCOMPATIBLE"
  | "ENGINE_EXECUTION"
  | "ENGINE_PROTOCOL"
  | "PROVIDER_AUTHENTICATION"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_SERVER"
  | "PROVIDER_TRANSPORT"
  | "PROVIDER_DECODE"
  | "RDF_ENGINE_NOT_FOUND"
  | "RDF_ENGINE_INCOMPATIBLE"
  | "RDF_ENGINE_EXECUTION"
  | "RDF_ENGINE_PROTOCOL"
  | "WITNESS_INPUT"
  | "WITNESS_ATTACHMENT_REJECTED"
  | "WITNESS_UNRELATED_SIGNER"
  | "WITNESS_REPLACEMENT_FORBIDDEN"
  | "WITNESS_ACTION_MISMATCH";

/** Details included in the failed branch of a {@link CskResult}. */
export interface CskFailure {
  /** A stable machine-readable failure category. */
  code: CskErrorCode;
  /** A human-readable explanation of the failure. */
  message: string;
}

/** The non-throwing result returned by every public operation. */
export type CskResult<T> = { ok: true; value: T } | { ok: false; error: CskFailure };

/** An error value carrying the stable {@link CskErrorCode} taxonomy. */
export declare class CskError extends Error {
  /** The stable code callers can branch on. */
  readonly code: CskErrorCode;
  /** Creates an error with an optional underlying cause. */
  constructor(code: CskErrorCode, message: string, cause?: unknown);
}

/** A derivation role used when deriving hierarchical keys. */
export type KeyRole = "external" | "internal" | "stake";
/** A derivation role supported by Icarus addresses. */
export type IcarusKeyRole = "external" | "internal";
/** A Byron-era network identifier. */
export type LegacyNetwork = "mainnet" | "staging" | "testnet" | "preview" | "preprod" | number;
/** A Shelley-era network identifier. */
export type ShelleyNetwork = "mainnet" | "preprod" | "preview" | number;
/** A supported transaction-data provider. */
export type ProviderName = "blockfrost" | "koios";
/** A network supported by remote transaction-data providers. */
export type ProviderNetwork = "mainnet" | "preprod" | "preview";
/** A witness collected for a transaction entry. */
export interface CollectedWitness {
  /** Identifier of the signer that supplied the witness. */
  signerId: string;
  /** Witness CBOR encoded as hexadecimal. */
  witnessCborHex: string;
}
/** JSON-compatible lifecycle status of a transaction entry. */
export type TransactionEntryStatus = "open" | "complete" | "expired" | "submitted";
/** A transaction entry collected by the host before explicit provider submission. */
export interface TransactionEntry {
  entryId: string;
  unsignedTxCborHex: string;
  requiredSigners: string[];
  collectedWitnesses: CollectedWitness[];
  invalidAfterSlot: number;
  status: TransactionEntryStatus;
}
/** Input for explicitly submitting a completed transaction entry. */
export interface TransactionEntrySubmissionInput {
  entry: TransactionEntry;
  signedTxCborHex: string;
  currentSlot: number;
  provider: ProviderName;
  network: ProviderNetwork;
  credential?: string;
}
/** Receipt returned after the shared provider accepts a completed entry. */
export interface TransactionEntrySubmissionReceipt {
  txId: string;
  provider: ProviderName;
  network: ProviderNetwork;
  entry: TransactionEntry & { status: "submitted" };
}
/** Encoding used for a signed or verified payload. */
export type PayloadMode = "text" | "hex";

/** Options for mnemonic generation. */
export interface MnemonicOptions {
  /** Number of mnemonic words to create. */
  wordCount: number;
}

/** Input for mnemonic validation. */
export interface ValidateMnemonicInput {
  /** Mnemonic words in their intended order. */
  mnemonic: string[];
}

/** Input for deterministic key derivation. */
export interface DeriveKeysInput {
  /** Source mnemonic words. */
  mnemonic: string[];
  /** Account position in the derivation path. */
  accountIndex: number;
  /** The key role to derive. */
  role: KeyRole;
  /** Address position in the derivation path. */
  addressIndex: number;
}

/** Input for constructing Shelley payment and stake addresses. */
export interface ConstructShelleyAddressesInput {
  /** Network for the returned addresses. */
  network: ShelleyNetwork;
  /** Optional payment extended public key. */
  paymentXPubBech32?: string;
  /** Optional stake extended public key. */
  stakeXPubBech32?: string;
}

/** Input for constructing an Icarus address directly from a mnemonic. */
export interface ConstructIcarusAddressFromMnemonicInput {
  /** Network for the returned address. */
  network: LegacyNetwork;
  /** Source mnemonic words. */
  mnemonic: string[];
  /** Account position in the derivation path. */
  accountIndex: number;
  /** Icarus key role to derive. */
  role: IcarusKeyRole;
  /** Address position in the derivation path. */
  addressIndex: number;
}

/** Input for constructing a Byron address directly from a mnemonic. */
export interface ConstructByronAddressFromMnemonicInput {
  /** Network for the returned address. */
  network: LegacyNetwork;
  /** Source mnemonic words. */
  mnemonic: string[];
  /** Account position in the derivation path. */
  accountIndex: number;
  /** Address position in the derivation path. */
  addressIndex: number;
}

/** Input for constructing an Icarus address from an extended public key. */
export interface ConstructIcarusAddressInput {
  /** Network for the returned address. */
  network: LegacyNetwork;
  /** Address extended public key in Bech32 format. */
  addressXPubBech32: string;
}

/** Input for constructing a Byron address from public keys and a path. */
export interface ConstructByronAddressInput {
  /** Network for the returned address. */
  network: LegacyNetwork;
  /** Address extended public key in Bech32 format. */
  addressXPubBech32: string;
  /** Root extended public key in Bech32 format. */
  rootXPubBech32: string;
  /** Derivation path for the address key. */
  derivationPath: string;
}

/** Input for payload signing. */
export interface SignPayloadInput {
  /** Encoding of the supplied payload. */
  payloadMode: PayloadMode;
  /** Text or hexadecimal payload to sign. */
  payloadInput: string;
  /** Signing key in Bech32 format. */
  signingKeyBech32: string;
}

/** Input for signature verification. */
export interface VerifySignatureInput {
  /** Encoding of the supplied payload. */
  payloadMode: PayloadMode;
  /** Text or hexadecimal payload to verify. */
  payloadInput: string;
  /** Verification key in Bech32 format. */
  verificationKeyBech32: string;
  /** Signature encoded as hexadecimal. */
  signatureHex: string;
}

/** A CBOR payload supplied as hexadecimal. */
export interface CborInput {
  /** CBOR bytes encoded as hexadecimal. */
  cborHex: string;
}

/** A JSON payload supplied as a structured value. */
export interface JsonInput {
  /** JSON document to analyse. */
  json: JsonValue;
}

/** A Cardano text-envelope representation. */
export interface TextEnvelope {
  /** Optional text-envelope type. */
  type?: string;
  /** Optional human-readable description. */
  description?: string;
  /** Optional CBOR payload encoded as hexadecimal. */
  cborHex?: string;
  /** Additional JSON-compatible text-envelope fields. */
  [field: string]: JsonValue | undefined;
}

/** Input containing a text envelope object or its serialised JSON. */
export interface TextEnvelopeInput {
  /** Text envelope object or JSON string. */
  textEnvelope: TextEnvelope | string;
}

/** Input used to obtain a transaction from a provider. */
export interface ProviderTransactionInput {
  /** Transaction hash to retrieve. */
  txHash: string;
  /** Provider used to retrieve the transaction. */
  provider: ProviderName;
  /** Provider network hosting the transaction. */
  network: ProviderNetwork;
  /** Optional provider credential. */
  credential?: string;
}

/** An explicit provider/network selection used to enrich local transaction bytes. */
export interface LocalProviderContext {
  /** Provider used to resolve input producers and validation context. */
  provider: ProviderName;
  /** Provider network used to resolve input producers and validation context. */
  network: ProviderNetwork;
  /** Optional credential for the selected provider. */
  credential?: string;
}

/** Local input with no provider context selection. */
export interface OfflineLocalProviderContext {
  provider?: never;
  network?: never;
  credential?: never;
}

/** Local raw transaction CBOR with an optional all-or-nothing provider context selection. */
export type LocalCborTransactionInput = CborInput & (LocalProviderContext | OfflineLocalProviderContext);
/** Local transaction text envelope with an optional all-or-nothing provider context selection. */
export type LocalTextEnvelopeTransactionInput = TextEnvelopeInput & (LocalProviderContext | OfflineLocalProviderContext);

/** Any supported transaction input. */
export type TransactionInput = LocalCborTransactionInput | LocalTextEnvelopeTransactionInput | ProviderTransactionInput;
/** Any supported witness input. */
export type WitnessInput = CborInput | TextEnvelopeInput;

/** Input for preparing a transaction witness. */
export interface PrepareTransactionWitnessInput {
  /** Transaction body hash encoded as hexadecimal. */
  bodyHashHex: string;
  /** Signing key in Bech32 format. */
  signingKeyBech32: string;
}

/** Common optional controls for transaction operations. */
export interface TransactionOperationOptions {
  /** Optional book identifiers to use while processing. */
  books?: string[];
  /** Additional JSON-compatible operation options. */
  [field: string]: JsonValue | undefined;
}

/** Options for attaching a witness to a transaction. */
export interface WitnessAttachmentOptions extends TransactionOperationOptions {
  /** Whether an existing witness may be replaced. */
  replaceExisting?: boolean;
}

/** Structured result of address inspection. */
export interface AddressInspection extends JsonObject {}
/** Structured result of key derivation. */
export interface DerivedKeys extends JsonObject {}
/** Structured result containing Shelley addresses. */
export interface ShelleyAddresses extends JsonObject {}
/** Structured result containing a bootstrap address. */
export interface BootstrapAddress extends JsonObject {}
/** Structured result of native-script analysis. */
export interface ScriptAnalysis extends JsonObject {}
/** Structured signed-payload representation. */
export interface Signature extends JsonObject {
  /** Signature encoded as hexadecimal, where available. */
  signatureHex?: string;
}
/** Prepared transaction witness data. */
export interface PreparedTransactionWitness extends JsonObject {
  /** Verification-key witness CBOR, where available. */
  vkeyWitnessCborHex?: string;
  /** Equivalent witness text envelope. */
  textEnvelope: TextEnvelope;
}
/** Normalised transaction witness data. */
export interface NormalisedTransactionWitness extends JsonObject {
  /** Normalised witness CBOR encoded as hexadecimal. */
  cborHex: string;
  /** Equivalent witness text envelope. */
  textEnvelope: TextEnvelope;
}
/** Transaction data after a witness attachment operation. */
export interface AttachedTransactionWitness extends JsonObject {
  /** Signed transaction CBOR encoded as hexadecimal. */
  signedTxCborHex: string;
  /** Equivalent signed-transaction text envelope. */
  textEnvelope: TextEnvelope;
  /** Action taken while applying the witness. */
  witnessPatchAction: string;
}
/** Structured result from a transaction operation. */
export interface TransactionOperationOutput extends JsonObject {}

/** Inspects a Cardano address. */
export declare const inspectAddress: (address: string) => Promise<CskResult<AddressInspection>>;
/** Generates a mnemonic with a default or requested word count. */
export declare const generateMnemonic: (input?: number | MnemonicOptions) => Promise<CskResult<string[]>>;
/** Validates mnemonic words and their checksum. */
export declare const validateMnemonic: (input: string[] | ValidateMnemonicInput) => Promise<CskResult<boolean>>;
/** Derives extended keys from a mnemonic and path components. */
export declare const deriveKeys: (input: DeriveKeysInput) => Promise<CskResult<DerivedKeys>>;
/** Constructs Shelley addresses from extended public keys. */
export declare const constructShelleyAddresses: (input: ConstructShelleyAddressesInput) => Promise<CskResult<ShelleyAddresses>>;
/** Constructs an Icarus address from mnemonic material. */
export declare const constructIcarusAddressFromMnemonic: (input: ConstructIcarusAddressFromMnemonicInput) => Promise<CskResult<string>>;
/** Constructs a Byron address from mnemonic material. */
export declare const constructByronAddressFromMnemonic: (input: ConstructByronAddressFromMnemonicInput) => Promise<CskResult<string>>;
/** Constructs an Icarus address from an extended public key. */
export declare const constructIcarusAddress: (input: ConstructIcarusAddressInput) => Promise<CskResult<string>>;
/** Constructs a Byron bootstrap address from public keys and a path. */
export declare const constructByronAddress: (input: ConstructByronAddressInput) => Promise<CskResult<BootstrapAddress>>;
/** Signs a text or hexadecimal payload. */
export declare const signPayload: (input: SignPayloadInput) => Promise<CskResult<Signature>>;
/** Verifies a signature for a text or hexadecimal payload. */
export declare const verifySignature: (input: VerifySignatureInput) => Promise<CskResult<boolean>>;
/** Analyses a native script represented as hexadecimal CBOR. */
export declare const analyzeNativeScriptHex: (input: string | CborInput) => Promise<CskResult<ScriptAnalysis>>;
/** Analyses a native script represented as JSON. */
export declare const analyzeNativeScriptJson: (input: string | JsonInput) => Promise<CskResult<ScriptAnalysis>>;
/** Analyses a script template represented as JSON. */
export declare const analyzeScriptTemplateJson: (input: string | JsonInput) => Promise<CskResult<ScriptAnalysis>>;
/** Prepares a signing witness for a transaction body hash. */
export declare const prepareTransactionWitness: (input: PrepareTransactionWitnessInput) => Promise<CskResult<PreparedTransactionWitness>>;
/** Normalises a transaction witness into CBOR and text-envelope forms. */
export declare const normaliseTransactionWitness: (input: WitnessInput) => Promise<CskResult<NormalisedTransactionWitness>>;
/** Attaches a witness to a transaction. */
export declare const attachTransactionWitness: (input: TransactionInput, witness: WitnessInput, options?: WitnessAttachmentOptions) => Promise<CskResult<AttachedTransactionWitness>>;
/** Explicitly submits a completed entry through the selected provider. */
export declare const submitTransactionEntry: (input: TransactionEntrySubmissionInput) => Promise<CskResult<TransactionEntrySubmissionReceipt>>;
/** Inspects the structure and contents of a transaction. */
export declare const inspectTransaction: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
/** Browses a transaction through its linked book data. */
export declare const browseTransaction: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
/** Identifies transaction features and classifications. */
export declare const identifyTransaction: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
/** Determines the apparent intent of a transaction. */
export declare const transactionIntent: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
/** Plans witness requirements for a transaction. */
export declare const planTransactionWitnesses: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
/** Validates a transaction against known rules and books. */
export declare const validateTransaction: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
/** Evaluates scripts contained in a transaction. */
export declare const evaluateTransactionScripts: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
