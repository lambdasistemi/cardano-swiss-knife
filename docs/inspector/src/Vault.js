const encoder = new TextEncoder();
const decoder = new TextDecoder();
let currentVaultHandle = null;

const PBKDF2_ITERATIONS = 250000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

const toBase64 = (bytes) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const deriveKey = async (passphrase, salt, usages) => {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    material,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    usages,
  );
};

const normalizeEntries = (entries) => {
  if (!Array.isArray(entries)) {
    throw new Error("Vault payload is invalid.");
  }

  return entries.map((entry) => {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.kind !== "string" ||
      typeof entry.label !== "string" ||
      typeof entry.value !== "string" ||
      typeof entry.createdAt !== "string"
    ) {
      throw new Error("Vault entry is invalid.");
    }

    return {
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      value: entry.value,
      createdAt: entry.createdAt,
    };
  });
};

const buildVaultDocument = async (passphrase, entries) => {
  if (passphrase.trim() === "") {
    throw new Error("Enter a vault passphrase first.");
  }

  const plaintext = encoder.encode(
    JSON.stringify({
      version: 1,
      entries: normalizeEntries(entries),
    }),
  );

  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );

  return JSON.stringify(
    {
      version: 1,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: PBKDF2_ITERATIONS,
        saltBase64: toBase64(salt),
      },
      cipher: {
        name: "AES-GCM",
        ivBase64: toBase64(iv),
        ciphertextBase64: toBase64(ciphertext),
      },
    },
    null,
    2,
  );
};

const readTextFileWithPicker = () =>
  new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", async () => {
      try {
        const [file] = input.files ?? [];
        if (!file) {
          resolve({ canceled: true, fileName: "", content: "" });
          cleanup();
          return;
        }

        const content = await file.text();
        resolve({ canceled: false, fileName: file.name, content });
      } catch (error) {
        reject(error);
      } finally {
        cleanup();
      }
    });

    input.click();
  });

const downloadVaultDocument = (fileName, content) => {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const filePickerTypes = [
  {
    description: "Encrypted vault JSON",
    accept: {
      "application/json": [".json"],
    },
  },
];

const writeVaultWithHandle = async (handle, content) => {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
};

export const createVaultEntryImpl = (kind) => (label) => (value) => () => ({
  id: crypto.randomUUID(),
  kind,
  label,
  value,
  createdAt: new Date().toISOString(),
});

export const createVaultFileImpl = (fileName) => (passphrase) => (entries) => () =>
  buildVaultDocument(passphrase, entries).then(async (content) => {
    if (typeof window.showSaveFilePicker === "function") {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: filePickerTypes,
      });
      await writeVaultWithHandle(handle, content);
      currentVaultHandle = handle;
      return handle.name || fileName;
    }

    downloadVaultDocument(fileName, content);
    currentVaultHandle = null;
    return fileName;
  });

export const exportVaultFileImpl = (fileName) => (passphrase) => (entries) => () =>
  buildVaultDocument(passphrase, entries).then((content) => {
    downloadVaultDocument(fileName, content);
  });

export const importVaultFileImpl = (passphrase) => () =>
  (typeof window.showOpenFilePicker === "function"
    ? window
        .showOpenFilePicker({
          multiple: false,
          types: filePickerTypes,
        })
        .then(async (handles) => {
          const [handle] = handles ?? [];
          if (!handle) {
            return { canceled: true, fileName: "", content: "", handle: null };
          }

          const file = await handle.getFile();
          const content = await file.text();
          return {
            canceled: false,
            fileName: file.name,
            content,
            handle,
          };
        })
        .catch((error) => {
          if (error?.name === "AbortError") {
            return { canceled: true, fileName: "", content: "", handle: null };
          }
          throw error;
        })
    : readTextFileWithPicker().then((picked) => ({ ...picked, handle: null }))).then(async (picked) => {
    if (picked.canceled) {
      return { canceled: true, fileName: "", entries: [] };
    }

    if (passphrase.trim() === "") {
      throw new Error("Enter the vault passphrase before importing a vault file.");
    }

    let locked;
    try {
      locked = JSON.parse(picked.content);
    } catch {
      throw new Error("Vault file is not valid JSON.");
    }

    const saltBase64 = locked?.kdf?.saltBase64;
    const ivBase64 = locked?.cipher?.ivBase64;
    const ciphertextBase64 = locked?.cipher?.ciphertextBase64;

    if (
      locked?.version !== 1 ||
      locked?.kdf?.name !== "PBKDF2" ||
      locked?.kdf?.hash !== "SHA-256" ||
      locked?.kdf?.iterations !== PBKDF2_ITERATIONS ||
      locked?.cipher?.name !== "AES-GCM" ||
      typeof saltBase64 !== "string" ||
      typeof ivBase64 !== "string" ||
      typeof ciphertextBase64 !== "string"
    ) {
      throw new Error("Vault file format is not supported.");
    }

    const salt = fromBase64(saltBase64);
    const iv = fromBase64(ivBase64);
    const ciphertext = fromBase64(ciphertextBase64);
    const key = await deriveKey(passphrase, salt, ["decrypt"]);

    let plaintext;
    try {
      plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    } catch {
      throw new Error("Vault unlock failed. Check the passphrase.");
    }

    let payload;
    try {
      payload = JSON.parse(decoder.decode(plaintext));
    } catch {
      throw new Error("Vault payload is not valid JSON.");
    }

    if (payload?.version !== 1) {
      throw new Error("Vault payload version is not supported.");
    }

    currentVaultHandle = picked.handle ?? null;

    return {
      canceled: false,
      fileName: picked.fileName || "cardano-swiss-knife.vault.json",
      entries: normalizeEntries(payload.entries ?? []),
    };
  });

export const persistVaultFileImpl = (fileName) => (passphrase) => (entries) => () =>
  buildVaultDocument(passphrase, entries).then(async (content) => {
    if (currentVaultHandle) {
      await writeVaultWithHandle(currentVaultHandle, content);
      return currentVaultHandle.name || fileName;
    }

    downloadVaultDocument(fileName, content);
    return fileName;
  });
