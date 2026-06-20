/**
 * IndexedDB cache for captured panorama images in the linked 360° tour
 * (P-720 follow-up: C261).
 *
 * Each entry is keyed `<stopId>:<designKey>` — the `designKey` is a
 * lightweight hash of the design's persistent fields (items, finishes,
 * floorPlan, doors, userFurniture) so the cache is automatically
 * invalidated whenever the room layout or furnishings change; unchanged
 * stops never re-render.
 *
 * The panorama canvas is stored as a WebP Blob (≈ 200 KB per stop at
 * the default equirect resolution), not a raw ImageData, so the IDB
 * quota cost scales gracefully. On retrieval the Blob is decoded back
 * into an HTMLCanvasElement (same type the rest of the tour machinery
 * expects).
 *
 * The store uses a **separate** IDB database (`sofa-pano-cache`) to
 * avoid version-bump conflicts with the main asset store (`sofa-so-good`
 * at v1). This keeps the two stores independently clearable and the
 * version timeline decoupled.
 *
 * NOTE: IndexedDB does **not** persist across separate headless shot.mjs
 * runs (each launch gets a fresh browser profile); verify round-trips
 * within a single run via a simulated reload — see the visual-
 * verification playbook.
 */

const DB_NAME = 'sofa-pano-cache'
const DB_VERSION = 1
const PANO_STORE = 'pano-cache'

/** Maximum number of entries kept in the pano-cache store. Oldest entries
 *  are evicted when this cap is exceeded (simple LRU via `savedAt`). */
export const PANO_CACHE_MAX_ENTRIES = 30

interface PanoCacheEntry {
  /** Composite key: `<stopId>:<designKey>`. */
  cacheKey: string
  stopId: string
  designKey: string
  blob: Blob
  savedAt: number
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PANO_STORE)) {
        const store = db.createObjectStore(PANO_STORE, { keyPath: 'cacheKey' })
        store.createIndex('savedAt', 'savedAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Compute a lightweight design-change key from the persistent store
 * fields that affect what a panorama looks like (items, finishes,
 * floorPlan, doors). The key is a short string (hash of the JSON) so
 * comparison is O(1). We use a djb2-style rolling hash — fast, pure,
 * no crypto dependency.
 */
export function computeDesignKey(fields: {
  items: unknown
  finishes: unknown
  floorPlan: unknown
  doors: unknown
  userFurniture: unknown
}): string {
  const json = JSON.stringify(fields)
  let h = 5381
  for (let i = 0; i < json.length; i++) {
    h = ((h << 5) + h + json.charCodeAt(i)) | 0
  }
  // Return as a hex string (unsigned).
  return (h >>> 0).toString(16)
}

/** Encode an HTMLCanvasElement to a Blob (WebP if supported, else PNG). */
async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 0.85)
  })
}

/** Decode a Blob back into an HTMLCanvasElement. */
async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')?.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Retrieve a cached panorama canvas, or null on miss / error. */
export async function getPanoCached(
  stopId: string,
  designKey: string,
): Promise<HTMLCanvasElement | null> {
  try {
    const db = await open()
    const cacheKey = `${stopId}:${designKey}`
    const entry = await idbRequest<PanoCacheEntry | undefined>(
      db.transaction(PANO_STORE, 'readonly').objectStore(PANO_STORE).get(cacheKey),
    )
    db.close()
    if (!entry) return null
    return await blobToCanvas(entry.blob)
  } catch {
    return null
  }
}

/** Store a captured panorama canvas in the IDB cache and evict the
 *  oldest entries above {@link PANO_CACHE_MAX_ENTRIES}. */
export async function putPanoCached(
  stopId: string,
  designKey: string,
  canvas: HTMLCanvasElement,
): Promise<void> {
  try {
    const blob = await canvasToBlob(canvas)
    const db = await open()
    const cacheKey = `${stopId}:${designKey}`
    const entry: PanoCacheEntry = { cacheKey, stopId, designKey, blob, savedAt: Date.now() }
    // Write in its own transaction. IDB auto-commits a transaction once its
    // requests settle, so reusing a store handle across the `await` below would
    // risk TransactionInactiveError on the next request (BUG-012) — open a fresh
    // transaction for the eviction read instead.
    await idbRequest(db.transaction(PANO_STORE, 'readwrite').objectStore(PANO_STORE).put(entry))
    // Evict oldest if over the cap (fresh read-only transaction).
    const all = await idbRequest<PanoCacheEntry[]>(
      db.transaction(PANO_STORE, 'readonly').objectStore(PANO_STORE).getAll(),
    )
    if (all.length > PANO_CACHE_MAX_ENTRIES) {
      all.sort((a, b) => a.savedAt - b.savedAt)
      const evict = all.slice(0, all.length - PANO_CACHE_MAX_ENTRIES)
      // Issue all deletes within one transaction without awaiting between them,
      // so the transaction stays active until they're all queued.
      const delStore = db.transaction(PANO_STORE, 'readwrite').objectStore(PANO_STORE)
      await Promise.all(evict.map((e) => idbRequest(delStore.delete(e.cacheKey))))
    }
    db.close()
  } catch {
    // Non-critical — fall back to live capture silently.
  }
}

/** Evict all cached entries for a specific stop (e.g. on stop removal). */
export async function evictPanoStop(stopId: string): Promise<void> {
  try {
    const db = await open()
    // Read in one transaction, then delete in a fresh one — don't reuse a store
    // handle across the getAll await (TransactionInactiveError risk, BUG-012).
    const all = await idbRequest<PanoCacheEntry[]>(
      db.transaction(PANO_STORE, 'readonly').objectStore(PANO_STORE).getAll(),
    )
    const toDelete = all.filter((e) => e.stopId === stopId)
    if (toDelete.length) {
      const store = db.transaction(PANO_STORE, 'readwrite').objectStore(PANO_STORE)
      await Promise.all(toDelete.map((e) => idbRequest(store.delete(e.cacheKey))))
    }
    db.close()
  } catch {
    // Best-effort.
  }
}

/** Clear the entire pano-cache store (e.g. on clearPanoTour). */
export async function clearPanoCache(): Promise<void> {
  try {
    const db = await open()
    await idbRequest(db.transaction(PANO_STORE, 'readwrite').objectStore(PANO_STORE).clear())
    db.close()
  } catch {
    // Best-effort.
  }
}
