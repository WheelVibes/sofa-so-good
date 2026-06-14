import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import { LOD_TIERS, type LodTier, lodAssetId, registerLodVariants } from '../gltf/lod'
import type { LodVariantSet } from '../optimize/lodVariants'
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
  /** When false, build + persist the blob to IDB but DON'T add the def to the
   *  store — the caller batch-commits (avoids per-file catalog rebuilds in a
   *  large bulk import). The def is still returned. Default true. */
  commit?: boolean
  /** Optional measured footprint (m). When known up front (e.g. the asset
   *  designer builds the geometry), it seeds an accurate `defaultFootprint` so
   *  the catalog card + first-placement collision are right before the GLB
   *  loads. Defaults to a 1 m cube (refined from the GLB bbox at render). */
  footprint?: { w: number; d: number; h: number }
  /** Generated -low/-medium LOD variants (from `optimize/lodVariants.ts`).
   *  Persisted as sibling IDB records under derived keys (`lodAssetId`) and
   *  registered so the renderer serves them on low/medium asset tiers. */
  lods?: LodVariantSet
  /** Estimated price (SGD) to carry on the def (parametric generator). */
  price?: number
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
      byteSize: buf.byteLength,
      ...(typeof opts.price === 'number' ? { price: opts.price } : {}),
      // Footprint (when measured up front) JSON-encodes into the primitive
      // meta store so hydration restores exact dims before the GLB loads.
      ...(opts.footprint ? { footprint: JSON.stringify(opts.footprint) } : {}),
      // finishTargets/finishOverrides are arrays/objects → JSON-encode into the
      // primitive meta store; hydrateAssets decodes them back.
      ...(opts.finishTargets ? { finishTargets: JSON.stringify(opts.finishTargets) } : {}),
      ...(opts.finishOverrides ? { finishOverrides: JSON.stringify(opts.finishOverrides) } : {}),
    },
  })

  // LOD tier siblings: one IDB record per generated variant, under the derived
  // `<assetId>:lod-<tier>` key, then registered so resolveLodUrlSync routes
  // low/medium asset tiers to these blob URLs (uploads have no `-low.glb`
  // sibling files to HEAD-probe). Best-effort: a failed tier write only costs
  // that tier, never the upload.
  const runtimeUrl = URL.createObjectURL(blob)
  const lodUrls: Partial<Record<LodTier, string>> = {}
  for (const tier of LOD_TIERS) {
    const bytes = opts.lods?.[tier]
    if (!bytes) continue
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    const lodBlob = new Blob([ab as ArrayBuffer], { type: v.mime })
    try {
      await IdbAssetStore.put({
        assetId: lodAssetId(assetId, tier),
        kind: 'gltf',
        mime: v.mime,
        name: `${opts.name} (${tier} LOD)`,
        uploadedAt: new Date().toISOString(),
        blob: lodBlob,
        meta: { role: 'lod', tier, baseAssetId: assetId },
      })
      lodUrls[tier] = URL.createObjectURL(lodBlob)
    } catch {
      // tier dropped; the original serves that tier instead
    }
  }
  if (lodUrls.low || lodUrls.medium) registerLodVariants(runtimeUrl, lodUrls)

  const def: UserGltfDef = {
    id: `user-${assetId}`,
    name: opts.name,
    category: opts.category,
    kind: 'gltf',
    source: 'user',
    assetId,
    contentHash,
    uploadedAt: new Date().toISOString(),
    defaultFootprint: opts.footprint ?? { w: 1.0, d: 1.0, h: 1.0 },
    runtimeUrl,
    mounted: opts.mounted,
    noClip: opts.noClip,
    finishTargets: opts.finishTargets,
    finishOverrides: opts.finishOverrides,
    byteSize: buf.byteLength,
    ...(typeof opts.price === 'number' ? { price: opts.price } : {}),
  }
  if (opts.commit ?? true) useStore.getState().addUserFurniture(def)
  return { ok: true, def }
}
