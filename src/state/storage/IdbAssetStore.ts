/**
 * Thin IndexedDB wrapper for binary asset blobs (GLBs, texture images).
 * The state slot adapter (LocalStorageAdapter) stays small JSON-only;
 * binaries land here so the 5 MB localStorage quota is never an issue.
 *
 * Schema (`sofa-so-good` DB, `assets` store, key=assetId):
 *   { assetId: string, kind: 'gltf' | 'texture', mime: string,
 *     name: string, uploadedAt: string, blob: Blob }
 */

const DB_NAME = 'sofa-so-good'
const DB_VERSION = 1
const STORE = 'assets'

export type AssetKind = 'gltf' | 'texture'

export interface AssetRecord {
  assetId: string
  kind: AssetKind
  mime: string
  name: string
  uploadedAt: string
  blob: Blob
  /** Free-form metadata persisted alongside the blob. For furniture
   *  this carries `category`; for materials (Phase 3) it carries the
   *  texture role + uvScale. Keeping this open-ended avoids needing a
   *  new IDB schema migration when a new asset kind is added. */
  meta?: Record<string, string | number | boolean | undefined>
}

export interface AssetMeta {
  assetId: string
  kind: AssetKind
  mime: string
  name: string
  uploadedAt: string
  size: number
  meta?: Record<string, string | number | boolean | undefined>
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'assetId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const store = t.objectStore(STORE)
        const result = fn(store)
        if (result instanceof Promise) {
          result.then(resolve, reject)
        } else {
          result.onsuccess = () => resolve(result.result)
          result.onerror = () => reject(result.error)
        }
        t.onerror = () => reject(t.error)
        t.oncomplete = () => db.close()
      }),
  )
}

export const IdbAssetStore = {
  async put(record: AssetRecord): Promise<void> {
    await tx('readwrite', (s) => s.put(record))
  },
  async get(assetId: string): Promise<AssetRecord | null> {
    const r = await tx<AssetRecord | undefined>('readonly', (s) => s.get(assetId))
    return r ?? null
  },
  async list(): Promise<AssetMeta[]> {
    const records = await tx<AssetRecord[]>('readonly', (s) => s.getAll())
    return records.map((r) => ({
      assetId: r.assetId,
      kind: r.kind,
      mime: r.mime,
      name: r.name,
      uploadedAt: r.uploadedAt,
      size: r.blob.size,
      meta: r.meta,
    }))
  },
  async delete(assetId: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(assetId))
  },
  async usage(): Promise<{ count: number; bytes: number }> {
    const records = await tx<AssetRecord[]>('readonly', (s) => s.getAll())
    return {
      count: records.length,
      bytes: records.reduce((sum, r) => sum + r.blob.size, 0),
    }
  },
}
