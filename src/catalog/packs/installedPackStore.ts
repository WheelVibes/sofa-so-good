import type { InstalledPack } from './types';

const DB_NAME = 'sofa-so-good-packs';
const DB_VERSION = 1;
const STORE = 'installed-packs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'packId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const s = t.objectStore(STORE);
        const r = fn(s);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export const InstalledPackStore = {
  async put(p: InstalledPack): Promise<void> {
    await tx('readwrite', (s) => s.put(p));
  },
  async get(packId: string): Promise<InstalledPack | null> {
    const r = await tx<InstalledPack | undefined>('readonly', (s) => s.get(packId));
    return r ?? null;
  },
  async list(): Promise<InstalledPack[]> {
    return tx<InstalledPack[]>('readonly', (s) => s.getAll());
  },
  async delete(packId: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(packId));
  },
};
