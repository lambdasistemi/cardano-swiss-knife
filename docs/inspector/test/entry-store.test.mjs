import assert from "node:assert/strict";
import test from "node:test";

// The adapter is intentionally exercised through the exact FFI functions that
// PureScript calls. This deterministic IndexedDB double preserves open,
// upgrade, request, transaction, and reopen boundaries; it is not a store API
// replacement.
const indexedDB = createIndexedDb();
globalThis.indexedDB = indexedDB;

const {
  ENTRY_DB_NAME,
  ENTRY_DB_VERSION,
  ENTRY_OBJECT_STORE,
  listEntriesImpl,
  lookupEntryImpl,
  putEntryImpl,
} = await import("../src/FFI/EntryStore.js");

const entry = (entryId, status = "Open") => ({
  entryId,
  unsignedTxCborHex: `cbor-${entryId}`,
  requiredSigners: ["alice", "bob"],
  collectedWitnesses: [{ signerId: "alice", witnessCborHex: "witness-alice" }],
  invalidAfterSlot: 123,
  status,
});

const putEntry = (value) => putEntryImpl(value)();
const lookupEntry = (entryId) => lookupEntryImpl(entryId)();
const listEntries = () => listEntriesImpl();
const initializeStore = () => putEntry(entry("entry-schema"));

const open = (name, version) =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const complete = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const resetDatabase = () => indexedDB.deleteDatabase(ENTRY_DB_NAME);

const seedRawRecord = async (record) => {
  const database = await open(ENTRY_DB_NAME, ENTRY_DB_VERSION);
  const transaction = database.transaction(ENTRY_OBJECT_STORE, "readwrite");
  transaction.objectStore(ENTRY_OBJECT_STORE).put(record);
  await complete(transaction);
  database.close();
};

test("creates one versioned entryId-keyed object store", async () => {
  resetDatabase();
  await putEntry(entry("entry-1"));

  const database = await open(ENTRY_DB_NAME, ENTRY_DB_VERSION);
  assert.equal(database.version, ENTRY_DB_VERSION);
  assert.equal(database.objectStoreNames.contains(ENTRY_OBJECT_STORE), true);
  assert.equal(database.storeKeyPath(ENTRY_OBJECT_STORE), "entryId");
  database.close();
});

test("puts, overwrites, looks up, and lists entries deterministically", async () => {
  resetDatabase();
  await putEntry(entry("entry-b"));
  await putEntry(entry("entry-a"));
  await putEntry({ ...entry("entry-b"), unsignedTxCborHex: "replacement" });

  assert.deepEqual(await lookupEntry("entry-b"), {
    ...entry("entry-b"),
    unsignedTxCborHex: "replacement",
  });
  assert.equal(await lookupEntry("missing"), null);
  assert.deepEqual(
    (await listEntries()).map((stored) => stored.entryId),
    ["entry-a", "entry-b"]
  );
  assert.equal((await listEntries()).filter((stored) => stored.entryId === "entry-b").length, 1);
});

test("reopens the versioned database without losing any entry field or status", async () => {
  resetDatabase();
  const entries = [
    entry("entry-open", "Open"),
    entry("entry-complete", "Complete"),
    entry("entry-expired", "Expired"),
    entry("entry-submitted", "Submitted"),
  ];
  for (const original of entries) await putEntry(original);

  const database = await open(ENTRY_DB_NAME, ENTRY_DB_VERSION);
  database.close();
  assert.throws(
    () => database.transaction(ENTRY_OBJECT_STORE, "readonly"),
    /InvalidStateError: database connection is closed/
  );

  for (const original of entries) {
    assert.deepEqual(await lookupEntry(original.entryId), original);
  }
});

test("rejects IndexedDB request and transaction errors once", async () => {
  resetDatabase();
  indexedDB.failNext("put", new Error("forced put failure"));
  await assert.rejects(() => putEntry(entry("entry-error")), /forced put failure/);

  indexedDB.failNext("getAll", new Error("forced list failure"));
  await assert.rejects(listEntries, /forced list failure/);

  indexedDB.failNextTransaction("put", new Error("forced transaction failure"));
  await assert.rejects(() => putEntry(entry("entry-transaction-error")), /forced transaction failure/);
});

test("rejects malformed persisted records and unknown statuses", async () => {
  resetDatabase();
  await initializeStore();
  await seedRawRecord({ ...entry("entry-malformed"), collectedWitnesses: "not-an-array" });
  await assert.rejects(listEntries, /collectedWitnesses.*array/);

  resetDatabase();
  await initializeStore();
  await seedRawRecord({ ...entry("entry-unknown"), status: "Uncertain" });
  await assert.rejects(listEntries, /unknown status.*Uncertain/);
});

function createIndexedDb() {
  const databases = new Map();
  const forcedRequestFailures = [];
  const forcedTransactionFailures = [];

  return {
    open(name, requestedVersion) {
      const request = new FakeOpenRequest();
      queueMicrotask(() => {
        const known = databases.get(name);
        const oldVersion = known?.version ?? 0;
        const version = requestedVersion ?? (oldVersion || 1);
        if (known && version < oldVersion) {
          request.fail(new Error("VersionError"));
          return;
        }

        const state = known ?? { version, stores: new Map() };
        const upgrade = version > oldVersion;
        state.version = version;
        databases.set(name, state);
        const database = new FakeDatabase(state, forcedRequestFailures, forcedTransactionFailures);
        request.result = database;
        if (upgrade) request.upgrade(oldVersion);
        request.succeed(database);
      });
      return request;
    },
    deleteDatabase(name) {
      databases.delete(name);
    },
    failNext(operation, error) {
      forcedRequestFailures.push({ operation, error });
    },
    failNextTransaction(operation, error) {
      forcedTransactionFailures.push({ operation, error });
    },
  };
}

class FakeOpenRequest {
  result;
  error = null;
  onerror = null;
  onsuccess = null;
  onupgradeneeded = null;

  upgrade(oldVersion) {
    this.onupgradeneeded?.({ oldVersion, target: this });
  }

  succeed(result) {
    this.result = result;
    this.onsuccess?.({ target: this });
  }

  fail(error) {
    this.error = error;
    this.onerror?.({ target: this });
  }
}

class FakeDatabase {
  constructor(state, forcedRequestFailures, forcedTransactionFailures) {
    this.state = state;
    this.forcedRequestFailures = forcedRequestFailures;
    this.forcedTransactionFailures = forcedTransactionFailures;
    this.closed = false;
    this.version = state.version;
    this.objectStoreNames = {
      contains: (name) => state.stores.has(name),
    };
  }

  createObjectStore(name, { keyPath }) {
    this.assertOpen();
    if (this.state.stores.has(name)) throw new Error(`ConstraintError: ${name} already exists`);
    this.state.stores.set(name, { keyPath, rows: new Map() });
    return new FakeObjectStore(this.state.stores.get(name), null);
  }

  transaction(name, mode) {
    this.assertOpen();
    const store = this.state.stores.get(name);
    if (!store) throw new Error(`NotFoundError: ${name}`);
    return new FakeTransaction(
      store,
      mode,
      this.forcedRequestFailures,
      this.forcedTransactionFailures
    );
  }

  storeKeyPath(name) {
    return this.state.stores.get(name)?.keyPath;
  }

  close() {
    this.closed = true;
  }

  assertOpen() {
    if (this.closed) throw new Error("InvalidStateError: database connection is closed");
  }
}

class FakeTransaction {
  constructor(store, mode, forcedRequestFailures, forcedTransactionFailures) {
    this.store = store;
    this.mode = mode;
    this.forcedRequestFailures = forcedRequestFailures;
    this.forcedTransactionFailures = forcedTransactionFailures;
    this.error = null;
    this.onabort = null;
    this.oncomplete = null;
    this.onerror = null;
    this.finished = false;
  }

  objectStore() {
    return new FakeObjectStore(this.store, this);
  }

  takeFailure(failures, operation) {
    const index = failures.findIndex((failure) => failure.operation === operation);
    return index < 0 ? null : failures.splice(index, 1)[0].error;
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    queueMicrotask(() => this.oncomplete?.({ target: this }));
  }

  fail(error) {
    if (this.finished) return;
    this.finished = true;
    this.error = error;
    queueMicrotask(() => {
      this.onerror?.({ target: this });
      this.onabort?.({ target: this });
    });
  }
}

class FakeObjectStore {
  constructor(store, transaction) {
    this.store = store;
    this.transaction = transaction;
  }

  put(value) {
    return this.request("put", () => {
      const key = value?.[this.store.keyPath];
      if (typeof key !== "string" || key === "") throw new Error("DataError: missing entryId");
      this.store.rows.set(key, structuredClone(value));
      return key;
    });
  }

  get(key) {
    return this.request("get", () => structuredClone(this.store.rows.get(key)));
  }

  getAll() {
    return this.request("getAll", () => Array.from(this.store.rows.values(), (value) => structuredClone(value)));
  }

  request(operation, action) {
    const request = new FakeRequest();
    const requestFailure = this.transaction?.takeFailure(
      this.transaction.forcedRequestFailures,
      operation
    );

    queueMicrotask(() => {
      if (requestFailure) {
        request.fail(requestFailure);
        this.transaction?.fail(requestFailure);
        return;
      }
      try {
        request.succeed(action());
        const transactionFailure = this.transaction?.takeFailure(
          this.transaction.forcedTransactionFailures,
          operation
        );
        if (transactionFailure) this.transaction?.fail(transactionFailure);
        else this.transaction?.finish();
      } catch (error) {
        request.fail(error);
        this.transaction?.fail(error);
      }
    });
    return request;
  }
}

class FakeRequest {
  result;
  error = null;
  onerror = null;
  onsuccess = null;

  succeed(result) {
    this.result = result;
    this.onsuccess?.({ target: this });
  }

  fail(error) {
    this.error = error;
    this.onerror?.({ target: this });
  }
}
