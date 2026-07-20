import {
  decryptVault,
  encryptVault,
  migrateLegacyVault,
  validateCanonicalVault,
} from "../../../lib/src/Cardano/Vault.js";

if (globalThis.__CSK_VAULT_TEST_SEAM__ === true) {
  globalThis.__cskVaultTestCore = { encryptVault, decryptVault, validateCanonicalVault };
}

let currentVaultHandle = null;
let rawEntries = new Map();

const ageMime = "application/vnd.cardano-swiss-knife.vault+age";
const ageName = "cardano-swiss-knife.vault.age";
const pickerTypes = [{ description: "Encrypted age vault", accept: { [ageMime]: [".age"] } }];
const ageHeader = new TextEncoder().encode("age-encryption.org/v1\n");

const isCanonicalAge = (bytes) => bytes.length >= ageHeader.length
  && ageHeader.every((byte, index) => bytes[index] === byte);

const projectEntries = (payload) => {
  const entries = validateCanonicalVault(payload).entries;
  rawEntries = new Map(entries.map((entry) => [entry.id, entry]));
  return entries.map(({ id, kind, label, value, createdAt }) => ({ id, kind, label, value, createdAt }));
};

const canonicalPayload = (entries) => {
  const retained = entries.map((entry) => ({ ...(rawEntries.get(entry.id) ?? {}), ...entry }));
  const payload = { cardanoSwissKnifeVault: { version: 1, entries: retained } };
  validateCanonicalVault(payload);
  return payload;
};

const readBinaryFileWithPicker = () => new Promise((resolve, reject) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".age," + ageMime;
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", async () => {
    try {
      const [file] = input.files ?? [];
      resolve(file ? { canceled: false, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle: null } : { canceled: true });
    } catch (error) { reject(error); } finally { input.remove(); }
  });
  input.click();
});

const pickBinary = () => typeof window.showOpenFilePicker === "function"
  ? window.showOpenFilePicker({ multiple: false, types: pickerTypes }).then(async ([handle] = []) => {
      if (!handle) return { canceled: true };
      const file = await handle.getFile();
      return { canceled: false, fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle };
    }).catch((error) => error?.name === "AbortError" ? { canceled: true } : Promise.reject(error))
  : readBinaryFileWithPicker();

const pickLegacy = () => new Promise((resolve, reject) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", async () => {
    try {
      const [file] = input.files ?? [];
      resolve(file ? { canceled: false, content: await file.text() } : { canceled: true });
    } catch (error) { reject(error); } finally { input.remove(); }
  });
  input.click();
});

const download = (fileName, bytes) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: ageMime }));
  const link = document.createElement("a");
  link.href = url; link.download = fileName; link.style.display = "none";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const write = async (handle, bytes) => {
  try { const writable = await handle.createWritable(); await writable.write(bytes); await writable.close(); }
  catch { throw new Error("Vault write failed."); }
};

const encrypted = (passphrase, entries) => encryptVault(passphrase, canonicalPayload(entries));

export const createVaultEntryImpl = (kind) => (label) => (value) => () => ({
  id: crypto.randomUUID(), kind, label, value, createdAt: new Date().toISOString(),
});

export const createVaultFileImpl = (fileName) => (passphrase) => (entries) => () => encrypted(passphrase, entries).then(async (bytes) => {
  if (typeof window.showSaveFilePicker === "function") {
    const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: pickerTypes });
    await write(handle, bytes); currentVaultHandle = handle; return handle.name || fileName;
  }
  download(fileName, bytes); currentVaultHandle = null; return fileName;
});

export const exportVaultFileImpl = (fileName) => (passphrase) => (entries) => () => encrypted(passphrase, entries).then((bytes) => download(fileName, bytes));

export const importVaultFileImpl = (passphrase) => () => pickBinary().then(async (picked) => {
  if (picked.canceled) return { canceled: true, fileName: "", entries: [] };
  if (!isCanonicalAge(picked.bytes)) throw new Error("Vault format is invalid.");
  const payload = await decryptVault(passphrase, picked.bytes);
  const entries = projectEntries(payload);
  currentVaultHandle = picked.handle;
  return { canceled: false, fileName: picked.fileName || ageName, entries };
});

export const migrateLegacyVaultFileImpl = (passphrase) => () => pickLegacy().then(async (picked) => {
  if (picked.canceled) return { canceled: true, fileName: "", entries: [] };
  let legacy;
  try { legacy = JSON.parse(picked.content); } catch { throw new Error("Vault format is invalid."); }
  const migrated = await migrateLegacyVault(passphrase, legacy);
  const entries = projectEntries({ cardanoSwissKnifeVault: { version: 1, entries: migrated.entries } });
  currentVaultHandle = null;
  return { canceled: false, fileName: ageName, entries };
});

export const persistVaultFileImpl = (fileName) => (passphrase) => (entries) => () => encrypted(passphrase, entries).then(async (bytes) => {
  if (currentVaultHandle) { await write(currentVaultHandle, bytes); return currentVaultHandle.name || fileName; }
  download(fileName, bytes); return fileName;
});
