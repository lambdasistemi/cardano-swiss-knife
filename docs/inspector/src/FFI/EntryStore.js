export const ENTRY_DB_NAME = "cardano-swiss-knife.entry-store";
export const ENTRY_DB_VERSION = 1;
export const ENTRY_OBJECT_STORE = "entries";

const knownStatuses = new Set(["Open", "Complete", "Expired", "Submitted"]);

const fail = (message) => {
  throw new Error(message);
};

const requireObject = (value, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`entry store ${label} is not an object`);
  }
  return value;
};

const requireString = (value, field) => {
  if (typeof value !== "string") fail(`entry store field ${field} is not a string`);
  return value;
};

const requireArray = (value, field) => {
  if (!Array.isArray(value)) fail(`entry store field ${field} is not an array`);
  return value;
};

const requireInteger = (value, field) => {
  if (!Number.isInteger(value)) fail(`entry store field ${field} is not an integer`);
  return value;
};

const validateWitness = (value, index) => {
  const witness = requireObject(value, `collectedWitnesses[${index}]`);
  return {
    signerId: requireString(witness.signerId, `collectedWitnesses[${index}].signerId`),
    witnessCborHex: requireString(
      witness.witnessCborHex,
      `collectedWitnesses[${index}].witnessCborHex`
    ),
  };
};

const validateEntry = (value) => {
  const entry = requireObject(value, "record");
  const status = requireString(entry.status, "status");
  if (!knownStatuses.has(status)) fail(`entry store field status has unknown status ${status}`);

  return {
    entryId: requireString(entry.entryId, "entryId"),
    unsignedTxCborHex: requireString(entry.unsignedTxCborHex, "unsignedTxCborHex"),
    requiredSigners: requireArray(entry.requiredSigners, "requiredSigners").map((signerId, index) =>
      requireString(signerId, `requiredSigners[${index}]`)
    ),
    collectedWitnesses: requireArray(entry.collectedWitnesses, "collectedWitnesses").map(
      validateWitness
    ),
    invalidAfterSlot: requireInteger(entry.invalidAfterSlot, "invalidAfterSlot"),
    status,
  };
};

const indexedDb = () => {
  if (!globalThis.indexedDB) fail("IndexedDB is unavailable in this browser.");
  return globalThis.indexedDB;
};

const openDatabase = () =>
  new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    let request;
    try {
      request = indexedDb().open(ENTRY_DB_NAME, ENTRY_DB_VERSION);
    } catch (error) {
      settle(reject, error);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ENTRY_OBJECT_STORE)) {
        database.createObjectStore(ENTRY_OBJECT_STORE, { keyPath: "entryId" });
      }
    };
    request.onerror = () => settle(reject, request.error || new Error("Could not open IndexedDB."));
    request.onblocked = () => settle(reject, new Error("IndexedDB upgrade is blocked."));
    request.onsuccess = () => settle(resolve, request.result);
  });

const runTransaction = async (mode, operation) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let result;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };

      let transaction;
      try {
        transaction = database.transaction(ENTRY_OBJECT_STORE, mode);
        const request = operation(transaction.objectStore(ENTRY_OBJECT_STORE));
        request.onerror = () =>
          settle(reject, request.error || new Error("IndexedDB request failed."));
        request.onsuccess = () => {
          result = request.result;
        };
        transaction.onerror = () =>
          settle(reject, transaction.error || new Error("IndexedDB transaction failed."));
        transaction.onabort = () =>
          settle(reject, transaction.error || new Error("IndexedDB transaction aborted."));
        transaction.oncomplete = () => settle(resolve, result);
      } catch (error) {
        settle(reject, error);
      }
    });
  } finally {
    database.close();
  }
};

export const putEntryImpl = (entry) => () =>
  runTransaction("readwrite", (store) => store.put(validateEntry(entry))).then(() => undefined);

export const lookupEntryImpl = (entryId) => () =>
  runTransaction("readonly", (store) => store.get(requireString(entryId, "entryId"))).then((entry) =>
    entry === undefined ? null : validateEntry(entry)
  );

export const listEntriesImpl = () =>
  runTransaction("readonly", (store) => store.getAll()).then((entries) =>
    requireArray(entries, "records")
      .map(validateEntry)
      .sort((left, right) => left.entryId.localeCompare(right.entryId))
  );
