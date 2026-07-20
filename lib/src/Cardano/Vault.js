import { Decrypter, Encrypter } from "age-encryption";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fail = (message) => { throw new Error(message); };
const vaultFormat = () => fail("Vault format is invalid.");
const vaultVersion = () => fail("Vault version is unsupported.");
const vaultIdentity = () => fail("Vault identity is ambiguous.");
const entryInvalid = () => fail("Vault entry is invalid.");
const string = (value) => typeof value === "string";

const base64 = (value) => {
  try {
    if (typeof atob === "function") return Uint8Array.from(atob(value), (byte) => byte.charCodeAt(0));
    return Uint8Array.from(Buffer.from(value, "base64"));
  } catch {
    vaultFormat();
  }
};

export const validateCanonicalVault = (payload) => {
  const vault = payload?.cardanoSwissKnifeVault;
  if (!vault || typeof vault !== "object" || Array.isArray(vault) || !Array.isArray(vault.entries)) vaultFormat();
  if (vault.version !== 1) vaultVersion();
  const ids = new Set();
  for (const item of vault.entries) {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || !string(item.id) || item.id.length === 0
      || !string(item.kind) || item.kind.length === 0
      || !string(item.label) || item.label.length === 0
      || !string(item.value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(item.createdAt)
      || Number.isNaN(Date.parse(item.createdAt))) entryInvalid();
    if (ids.has(item.id)) vaultIdentity();
    ids.add(item.id);
  }
  return vault;
};

export const encryptVault = async (passphrase, payload) => {
  validateCanonicalVault(payload);
  if (!string(passphrase) || passphrase.length === 0) fail("Vault passphrase is invalid.");
  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  return encrypter.encrypt(JSON.stringify(payload));
};

export const decryptVault = async (passphrase, encrypted) => {
  if (!string(passphrase) || passphrase.length === 0 || !(encrypted instanceof Uint8Array)) vaultFormat();
  try {
    const decrypter = new Decrypter();
    decrypter.addPassphrase(passphrase);
    const payload = JSON.parse(await decrypter.decrypt(encrypted, "text"));
    validateCanonicalVault(payload);
    return payload;
  } catch (error) {
    if (error?.message?.startsWith("Vault ")) throw error;
    fail("Vault unlock failed.");
  }
};

const decryptLegacyCsk = async (passphrase, envelope) => {
  const kdf = envelope?.kdf;
  const cipher = envelope?.cipher;
  if (envelope?.version !== 1 || kdf?.name !== "PBKDF2" || kdf?.hash !== "SHA-256"
    || kdf?.iterations !== 250000 || cipher?.name !== "AES-GCM"
    || !string(kdf?.saltBase64) || !string(cipher?.ivBase64) || !string(cipher?.ciphertextBase64)) vaultFormat();
  try {
    const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: base64(kdf.saltBase64), iterations: 250000 },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64(cipher.ivBase64) }, key, base64(cipher.ciphertextBase64));
    const payload = JSON.parse(decoder.decode(plaintext));
    if (payload?.version !== 1 || !Array.isArray(payload.entries)) vaultFormat();
    return { entries: validateCanonicalVault({ cardanoSwissKnifeVault: { version: 1, entries: payload.entries } }).entries };
  } catch (error) {
    if (error?.message?.startsWith("Vault ")) throw error;
    fail("Vault unlock failed.");
  }
};

const migrateIdentityWrapper = (name, wrapper, now) => {
  if (!wrapper || wrapper.version !== 1 || !wrapper.identities || typeof wrapper.identities !== "object" || Array.isArray(wrapper.identities)) vaultFormat();
  const labels = new Set();
  const hashes = new Set();
  const entries = [];
  for (const [mapLabel, identity] of Object.entries(wrapper.identities)) {
    const source = identity?.source;
    if (!identity || identity.label !== mapLabel || !string(identity.network) || !string(identity.keyHash)
      || !source || !["cardano-cli-skey", "cardano-addresses-addr-xsk"].includes(source.kind)) vaultFormat();
    if (labels.has(identity.label) || hashes.has(identity.keyHash)) vaultIdentity();
    labels.add(identity.label);
    hashes.add(identity.keyHash);
    const value = source.kind === "cardano-cli-skey"
      ? (source.keyEnvelope && typeof source.keyEnvelope === "object" && !Array.isArray(source.keyEnvelope) ? JSON.stringify(source.keyEnvelope) : null)
      : (string(source.bech32) ? source.bech32 : null);
    if (!value) vaultFormat();
    const entry = {
      id: `migrated:${name}:${identity.keyHash}`,
      kind: source.kind,
      label: identity.label,
      value,
      createdAt: now(),
      network: identity.network,
      keyHash: identity.keyHash,
    };
    if (string(identity.description)) entry.description = identity.description;
    entries.push(entry);
  }
  return { entries: validateCanonicalVault({ cardanoSwissKnifeVault: { version: 1, entries } }).entries };
};

const decryptAgePayload = async (passphrase, encrypted) => {
  try {
    const decrypter = new Decrypter();
    decrypter.addPassphrase(passphrase);
    return JSON.parse(await decrypter.decrypt(encrypted, "text"));
  } catch {
    fail("Vault unlock failed.");
  }
};

export const migrateLegacyVault = async (passphrase, input, now = () => new Date().toISOString()) => {
  if (input instanceof Uint8Array) return migrateLegacyVault(passphrase, await decryptAgePayload(passphrase, input), now);
  if (!input || typeof input !== "object") vaultFormat();
  if (input.cardanoTxSignVault) return migrateIdentityWrapper("cardanoTxSignVault", input.cardanoTxSignVault, now);
  if (input.amaruTreasuryWitnessVault) return migrateIdentityWrapper("amaruTreasuryWitnessVault", input.amaruTreasuryWitnessVault, now);
  return decryptLegacyCsk(passphrase, input);
};

export const canonicalVaultContractImpl = (json) => {
  try { validateCanonicalVault(JSON.parse(json)); return true; } catch { return false; }
};
