export type CrossTabLockStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type StorageLease = {
  owner: string;
  expiresAt: number;
};

type IndexedDbLease = StorageLease & {
  name: string;
};

const STORAGE_LEASE_MS = 15_000;
const STORAGE_LEASE_RETRY_MS = 12;
const processTails = new WeakMap<object, Map<string, Promise<unknown>>>();
const indexedDbConnections = new WeakMap<IDBFactory, Promise<IDBDatabase>>();
const INDEXED_DB_NAME = "novelideas-cross-tab-locks-v1";
const INDEXED_DB_STORE = "locks";

export type AssertCrossTabLockOwnership = () => Promise<void>;

class CrossTabLockLostError extends Error {
  constructor() {
    super("cross_tab_lock_lost");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseStorageLease(raw: string | null): StorageLease | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StorageLease>;
    return typeof value.owner === "string" && typeof value.expiresAt === "number"
      ? value as StorageLease
      : null;
  } catch {
    return null;
  }
}

function openIndexedDbLockDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const existing = indexedDbConnections.get(factory);
  if (existing) return existing;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(INDEXED_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(INDEXED_DB_STORE)) {
        request.result.createObjectStore(INDEXED_DB_STORE, { keyPath: "name" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("cross_tab_lock_database_failed"));
    request.onblocked = () => reject(new Error("cross_tab_lock_database_blocked"));
  });
  indexedDbConnections.set(factory, opening);
  return opening;
}

function acquireIndexedDbLease(
  database: IDBDatabase,
  name: string,
  owner: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, "readwrite");
    const store = transaction.objectStore(INDEXED_DB_STORE);
    let acquired = false;
    const request = store.get(name);
    request.onsuccess = () => {
      const current = request.result as IndexedDbLease | undefined;
      if (!current || current.owner === owner || current.expiresAt <= Date.now()) {
        store.put({ name, owner, expiresAt: Date.now() + STORAGE_LEASE_MS } satisfies IndexedDbLease);
        acquired = true;
      }
    };
    transaction.oncomplete = () => resolve(acquired);
    transaction.onerror = () => reject(transaction.error || new Error("cross_tab_lock_acquire_failed"));
    transaction.onabort = () => reject(transaction.error || new Error("cross_tab_lock_acquire_aborted"));
  });
}

function updateIndexedDbLease(
  database: IDBDatabase,
  name: string,
  owner: string,
  release: boolean,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, "readwrite");
    const store = transaction.objectStore(INDEXED_DB_STORE);
    let owned = false;
    const request = store.get(name);
    request.onsuccess = () => {
      const current = request.result as IndexedDbLease | undefined;
      if (current?.owner !== owner) return;
      owned = true;
      if (release) store.delete(name);
      else store.put({ name, owner, expiresAt: Date.now() + STORAGE_LEASE_MS } satisfies IndexedDbLease);
    };
    transaction.oncomplete = () => resolve(owned);
    transaction.onerror = () => reject(transaction.error || new Error("cross_tab_lock_update_failed"));
    transaction.onabort = () => reject(transaction.error || new Error("cross_tab_lock_update_aborted"));
  });
}

async function withIndexedDbLease<R>(
  database: IDBDatabase,
  lockName: string,
  work: (assertOwnership: AssertCrossTabLockOwnership) => Promise<R>,
): Promise<R> {
  const owner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  for (;;) {
    if (!await acquireIndexedDbLease(database, lockName, owner)) {
      await delay(STORAGE_LEASE_RETRY_MS);
      continue;
    }
    const heartbeat = setInterval(() => {
      void updateIndexedDbLease(database, lockName, owner, false).catch(() => undefined);
    }, STORAGE_LEASE_MS / 3);
    try {
      const assertOwnership = async () => {
        if (!await updateIndexedDbLease(database, lockName, owner, false)) {
          throw new CrossTabLockLostError();
        }
      };
      const result = await work(assertOwnership);
      await assertOwnership();
      return result;
    } catch (error) {
      if (!(error instanceof CrossTabLockLostError)) throw error;
    } finally {
      clearInterval(heartbeat);
      await updateIndexedDbLease(database, lockName, owner, true).catch(() => undefined);
    }
  }
}

async function withStorageLease<R>(
  storage: CrossTabLockStorage,
  lockName: string,
  work: (assertOwnership: AssertCrossTabLockOwnership) => Promise<R>,
): Promise<R> {
  const lockKey = `novelideas_cross_tab_lock_v1:${lockName}`;
  const owner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  for (;;) {
    const now = Date.now();
    const current = parseStorageLease(await storage.getItem(lockKey));
    if (current && current.owner !== owner && current.expiresAt > now) {
      await delay(STORAGE_LEASE_RETRY_MS);
      continue;
    }
    await storage.setItem(lockKey, JSON.stringify({ owner, expiresAt: now + STORAGE_LEASE_MS }));
    await delay(STORAGE_LEASE_RETRY_MS);
    if (parseStorageLease(await storage.getItem(lockKey))?.owner !== owner) continue;

    const heartbeat = setInterval(() => {
      void storage.getItem(lockKey).then((raw) => {
        if (parseStorageLease(raw)?.owner === owner) {
          return storage.setItem(lockKey, JSON.stringify({
            owner,
            expiresAt: Date.now() + STORAGE_LEASE_MS,
          }));
        }
        return undefined;
      }).catch(() => undefined);
    }, STORAGE_LEASE_MS / 3);
    try {
      const assertOwnership = async () => {
        if (parseStorageLease(await storage.getItem(lockKey))?.owner !== owner) {
          throw new CrossTabLockLostError();
        }
        await storage.setItem(lockKey, JSON.stringify({
          owner,
          expiresAt: Date.now() + STORAGE_LEASE_MS,
        }));
      };
      const result = await work(assertOwnership);
      await assertOwnership();
      return result;
    } catch (error) {
      if (!(error instanceof CrossTabLockLostError)) throw error;
    } finally {
      clearInterval(heartbeat);
      if (parseStorageLease(await storage.getItem(lockKey))?.owner === owner) {
        await storage.setItem(lockKey, JSON.stringify({ owner, expiresAt: 0 }));
      }
    }
  }
}

export function withCrossTabStorageLock<R>(
  storage: CrossTabLockStorage,
  lockName: string,
  work: (assertOwnership: AssertCrossTabLockOwnership) => Promise<R>,
): Promise<R> {
  const storageObject = storage as object;
  const tails = processTails.get(storageObject) || new Map<string, Promise<unknown>>();
  processTails.set(storageObject, tails);
  const previous = tails.get(lockName) || Promise.resolve();
  const run = async () => {
    const locks = (globalThis as {
      navigator?: { locks?: { request: <V>(name: string, callback: () => Promise<V>) => Promise<V> } };
    }).navigator?.locks;
    if (locks?.request) {
      return locks.request(`novelideas:${lockName}`, () => work(async () => undefined));
    }
    const indexedDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (indexedDB) {
      try {
        const database = await openIndexedDbLockDatabase(indexedDB);
        return withIndexedDbLease(database, lockName, work);
      } catch (error) {
        console.warn("[cross-tab-lock] indexed_db_unavailable", error);
      }
    }
    // Native runtimes have no cross-document storage. This storage-backed fallback also protects
    // unusual browser contexts where both standardized lock mechanisms are unavailable.
    return withStorageLease(storage, lockName, work);
  };
  const result = previous.catch(() => undefined).then(run);
  tails.set(lockName, result.then(() => undefined, () => undefined));
  return result;
}
