import { chmod, link, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { decryptVault, encryptVault, migrateLegacyVault } from "../lib/src/Cardano/Vault.js";

export const projectEntries = (payload) => payload.cardanoSwissKnifeVault.entries.map(({ value, ...entry }) => entry);
export const atomicWriteVault = async (target, bytes, force = false, hooks = {}) => {
  const temp = join(dirname(target), `.${basename(target)}.${randomBytes(8).toString("hex")}.tmp`);
  try {
    const handle = await open(temp, "wx", 0o600); try { await handle.writeFile(bytes); await handle.sync(); await chmod(temp, 0o600); } finally { await handle.close(); }
    hooks.beforeRename?.(); if (force) await rename(temp, target); else { try { await link(temp, target); } catch (error) { if (error.code === "EEXIST") throw Error("Vault output exists."); throw error; } await unlink(temp); }
  } catch (error) { await unlink(temp).catch(() => {}); throw error; }
};
export const createVaultFile = async (target, passphrase, payload = { cardanoSwissKnifeVault: { version: 1, entries: [] } }, force = false) => atomicWriteVault(target, await encryptVault(passphrase, payload), force);
export const listVaultFile = async (target, passphrase) => projectEntries(await decryptVault(passphrase, new Uint8Array(await readFile(target))));
export const migrateVaultFile = async (inputPath, outputPath, inputPassphrase, outputPassphrase, force = false) => { let input; try { const bytes = new Uint8Array(await readFile(inputPath)); const text = new TextDecoder().decode(bytes); if (text.trimStart().startsWith("{")) { try { input = JSON.parse(text); } catch { throw Error("Vault input is invalid."); } } else input = bytes; } catch (error) { if (error.message?.startsWith("Vault ")) throw error; throw Error("Vault input is invalid."); } const migrated = await migrateLegacyVault(inputPassphrase, input); return createVaultFile(outputPath, outputPassphrase, { cardanoSwissKnifeVault: { version: 1, entries: migrated.entries } }, force); };

export const providerCredentialKind = { blockfrost: "blockfrost-project-id", koios: "koios-bearer-token" };
const controlChars = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`);
export const invalidMetadataText = (value) => typeof value !== "string" || value.trim().length === 0 || controlChars.test(value);
export const invalidCredentialText = (value) => typeof value !== "string" || value.trim().length === 0;
export const addCredentialFile = async (target, passphrase, { provider, id, label, value }, hooks = {}) => {
  const kind = providerCredentialKind[provider];
  if (!kind) throw Error("Vault provider is unsupported.");
  if (invalidMetadataText(id) || invalidMetadataText(label)) throw Error("Vault credential metadata is invalid.");
  if (invalidCredentialText(value)) throw Error("Vault credential input is invalid.");
  const payload = await decryptVault(passphrase, new Uint8Array(await readFile(target)));
  const entries = [...payload.cardanoSwissKnifeVault.entries, { id, kind, label, value, createdAt: new Date().toISOString() }];
  const bytes = await encryptVault(passphrase, { ...payload, cardanoSwissKnifeVault: { ...payload.cardanoSwissKnifeVault, entries } });
  await atomicWriteVault(target, bytes, true, hooks);
};
