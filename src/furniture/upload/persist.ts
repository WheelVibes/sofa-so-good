import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import type { FurnitureCategory, UserGltfDef } from '../types'
import { hashBuffer } from './hashFile'
import { validateGlbFile } from './validate'

export interface PersistOptions {
  name: string
  category: FurnitureCategory
  mounted?: boolean
  noClip?: boolean
  finishTargets?: { key: string; label: string }[]
  finishOverrides?: Record<string, string>
  /** Precomputed SHA-256 (hex) of the file bytes. When omitted it is computed
   *  here; the bulk path passes it so a batch hashes each file only once. */
  contentHash?: string
}

export type PersistResult =
  // `duplicate: true` means an identical file was already in the catalog and we
  // reused the existing def instead of importing a second copy.
  { ok: true; def: UserGltfDef; duplicate?: boolean } | { ok: false; reason: string }

/** An existing user GLB whose bytes match `hash`, if any (used to skip
 *  re-imports of the same model). Only user uploads carry a contentHash. */
function findByHash(hash: string): UserGltfDef | undefined {
  return useStore
    .getState()
    .userFurniture.find((d): d is UserGltfDef => d.source === 'user' && d.contentHash === hash)
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `asset-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

/** Validates → writes the blob to IndexedDB → registers a UserGltfDef
 *  in the store. The catalog merge picks the new entry up reactively;
 *  the GltfModel wrapper resolves the assetId at render time.
 *
 *  De-dupes by content: if a user GLB with the same SHA-256 is already in the
 *  catalog, it skips the write and returns that def with `duplicate: true`. */
export async function persistUserGlb(file: File, opts: PersistOptions): Promise<PersistResult> {
  const v = await validateGlbFile(file)
  if (!v.ok) return { ok: false, reason: v.reason }

  // Read the file ONCE — reuse the buffer for both the content hash and the
  // stored blob (two separate reads here were extra main-thread pressure).
  const buf = await file.arrayBuffer()
  const contentHash = opts.contentHash ?? (await hashBuffer(buf))
  const existing = findByHash(contentHash)
  if (existing) return { ok: true, def: existing, duplicate: true }

  const assetId = newId()
  const blob = new Blob([buf], { type: v.mime })
  await IdbAssetStore.put({
    assetId,
    kind: 'gltf',
    mime: v.mime,
    name: opts.name,
    uploadedAt: new Date().toISOString(),
    blob,
    meta: {
      category: opts.category,
      mounted: opts.mounted,
      noClip: opts.noClip,
      contentHash,
      // finishTargets/finishOverrides are arrays/objects → JSON-encode into the
      // primitive meta store; hydrateAssets decodes them back.
      ...(opts.finishTargets ? { finishTargets: JSON.stringify(opts.finishTargets) } : {}),
      ...(opts.finishOverrides ? { finishOverrides: JSON.stringify(opts.finishOverrides) } : {}),
    },
  })

  const def: UserGltfDef = {
    id: `user-${assetId}`,
    name: opts.name,
    category: opts.category,
    kind: 'gltf',
    source: 'user',
    assetId,
    contentHash,
    uploadedAt: new Date().toISOString(),
    defaultFootprint: { w: 1.0, d: 1.0, h: 1.0 },
    runtimeUrl: URL.createObjectURL(blob),
    mounted: opts.mounted,
    noClip: opts.noClip,
    finishTargets: opts.finishTargets,
    finishOverrides: opts.finishOverrides,
  }
  useStore.getState().addUserFurniture(def)
  return { ok: true, def }
}
