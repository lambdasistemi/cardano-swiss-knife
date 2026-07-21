export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

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

export interface CskFailure {
  code: CskErrorCode;
  message: string;
}

export type CskResult<T> = { ok: true; value: T } | { ok: false; error: CskFailure };

export declare class CskError extends Error {
  readonly code: CskErrorCode;
  constructor(code: CskErrorCode, message: string, cause?: unknown);
}

export type KeyRole = "external" | "internal" | "stake";
export type IcarusKeyRole = "external" | "internal";
export type LegacyNetwork = "mainnet" | "staging" | "testnet" | "preview" | "preprod" | number;
export type ShelleyNetwork = "mainnet" | "preprod" | "preview" | number;
export type ProviderName = "blockfrost" | "koios";
export type ProviderNetwork = "mainnet" | "preprod" | "preview";
export type PayloadMode = "text" | "hex";

export interface MnemonicOptions {
  wordCount: number;
}

export interface ValidateMnemonicInput {
  mnemonic: string[];
}

export interface DeriveKeysInput {
  mnemonic: string[];
  accountIndex: number;
  role: KeyRole;
  addressIndex: number;
}

export interface ConstructShelleyAddressesInput {
  network: ShelleyNetwork;
  paymentXPubBech32?: string;
  stakeXPubBech32?: string;
}

export interface ConstructIcarusAddressFromMnemonicInput {
  network: LegacyNetwork;
  mnemonic: string[];
  accountIndex: number;
  role: IcarusKeyRole;
  addressIndex: number;
}

export interface ConstructByronAddressFromMnemonicInput {
  network: LegacyNetwork;
  mnemonic: string[];
  accountIndex: number;
  addressIndex: number;
}

export interface ConstructIcarusAddressInput {
  network: LegacyNetwork;
  addressXPubBech32: string;
}

export interface ConstructByronAddressInput {
  network: LegacyNetwork;
  addressXPubBech32: string;
  rootXPubBech32: string;
  derivationPath: string;
}

export interface SignPayloadInput {
  payloadMode: PayloadMode;
  payloadInput: string;
  signingKeyBech32: string;
}

export interface VerifySignatureInput {
  payloadMode: PayloadMode;
  payloadInput: string;
  verificationKeyBech32: string;
  signatureHex: string;
}

export interface CborInput {
  cborHex: string;
}

export interface JsonInput {
  json: JsonValue;
}

export interface TextEnvelope {
  type?: string;
  description?: string;
  cborHex?: string;
  [field: string]: JsonValue | undefined;
}

export interface TextEnvelopeInput {
  textEnvelope: TextEnvelope | string;
}

export interface ProviderTransactionInput {
  txHash: string;
  provider: ProviderName;
  network: ProviderNetwork;
  credential?: string;
}

export type TransactionInput = CborInput | TextEnvelopeInput | ProviderTransactionInput;
export type WitnessInput = CborInput | TextEnvelopeInput;

export interface PrepareTransactionWitnessInput {
  bodyHashHex: string;
  signingKeyBech32: string;
}

export interface TransactionOperationOptions {
  books?: string[];
  [field: string]: JsonValue | undefined;
}

export interface WitnessAttachmentOptions extends TransactionOperationOptions {
  replaceExisting?: boolean;
}

export interface AddressInspection extends JsonObject {}
export interface DerivedKeys extends JsonObject {}
export interface ShelleyAddresses extends JsonObject {}
export interface BootstrapAddress extends JsonObject {}
export interface ScriptAnalysis extends JsonObject {}
export interface Signature extends JsonObject {
  signatureHex?: string;
}
export interface PreparedTransactionWitness extends JsonObject {
  vkeyWitnessCborHex?: string;
  textEnvelope: TextEnvelope;
}
export interface NormalisedTransactionWitness extends JsonObject {
  cborHex: string;
  textEnvelope: TextEnvelope;
}
export interface AttachedTransactionWitness extends JsonObject {
  signedTxCborHex: string;
  textEnvelope: TextEnvelope;
  witnessPatchAction: string;
}
export interface TransactionOperationOutput extends JsonObject {}

export declare const inspectAddress: (address: string) => Promise<CskResult<AddressInspection>>;
export declare const generateMnemonic: (input?: number | MnemonicOptions) => Promise<CskResult<string[]>>;
export declare const validateMnemonic: (input: string[] | ValidateMnemonicInput) => Promise<CskResult<boolean>>;
export declare const deriveKeys: (input: DeriveKeysInput) => Promise<CskResult<DerivedKeys>>;
export declare const constructShelleyAddresses: (input: ConstructShelleyAddressesInput) => Promise<CskResult<ShelleyAddresses>>;
export declare const constructIcarusAddressFromMnemonic: (input: ConstructIcarusAddressFromMnemonicInput) => Promise<CskResult<string>>;
export declare const constructByronAddressFromMnemonic: (input: ConstructByronAddressFromMnemonicInput) => Promise<CskResult<string>>;
export declare const constructIcarusAddress: (input: ConstructIcarusAddressInput) => Promise<CskResult<string>>;
export declare const constructByronAddress: (input: ConstructByronAddressInput) => Promise<CskResult<BootstrapAddress>>;
export declare const signPayload: (input: SignPayloadInput) => Promise<CskResult<Signature>>;
export declare const verifySignature: (input: VerifySignatureInput) => Promise<CskResult<boolean>>;
export declare const analyzeNativeScriptHex: (input: string | CborInput) => Promise<CskResult<ScriptAnalysis>>;
export declare const analyzeNativeScriptJson: (input: string | JsonInput) => Promise<CskResult<ScriptAnalysis>>;
export declare const analyzeScriptTemplateJson: (input: string | JsonInput) => Promise<CskResult<ScriptAnalysis>>;
export declare const prepareTransactionWitness: (input: PrepareTransactionWitnessInput) => Promise<CskResult<PreparedTransactionWitness>>;
export declare const normaliseTransactionWitness: (input: WitnessInput) => Promise<CskResult<NormalisedTransactionWitness>>;
export declare const attachTransactionWitness: (input: TransactionInput, witness: WitnessInput, options?: WitnessAttachmentOptions) => Promise<CskResult<AttachedTransactionWitness>>;
export declare const inspectTransaction: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
export declare const browseTransaction: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
export declare const identifyTransaction: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
export declare const transactionIntent: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
export declare const planTransactionWitnesses: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
export declare const validateTransaction: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
export declare const evaluateTransactionScripts: (input: TransactionInput, options?: TransactionOperationOptions) => Promise<CskResult<TransactionOperationOutput>>;
