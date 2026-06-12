import { seedGltfFootprint } from '../../furniture/GltfModel'
import { LOD_TIERS, type LodTier, lodAssetId, registerLodVariants } from '../../furniture/gltf/lod'
import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
  type IkeaGltfDef,
  type UserGltfDef,
} from '../../furniture/types'
import type { MaterialCategory, TexturedMaterialDef } from '../../materials/types'
import { useStore } from '../store'
import { type AssetRecord, IdbAssetStore } from './IdbAssetStore'

/** JSON.parse that never throws: returns undefined on any parse error so a
 *  corrupt meta string can't abort hydration of the remaining assets. */
function safeParse<T>(s: unknown): T | undefined {
  if (typeof s !== 'string') return undefined
  try {
    return JSON.parse(s) as T
  } catch {
    return undefined
  }
}

/**
 * Reloads user-uploaded furniture defs from IndexedDB and populates the
 * user-assets store slice. Called once at app boot before the first
 * paint of the catalog drawer.
 *
 * Phase 3 will extend this to also hydrate user materials and the
 * autosaved layout from localStorage. The split (binaries from IDB,
 * state from localStorage) means each can be wired independently.
 */
/** Re-attach runtime blob URLs to persisted IKEA defs (binaries live in IDB by
 *  assetId; the def itself comes from the layout save). Seeds the active
 *  variant's footprint cache so collision is correct before first render. */
export async function resolveIkeaRuntimeUrls(defs: IkeaGltfDef[]): Promise<IkeaGltfDef[]> {
  if (typeof indexedDB === 'undefined') return defs
  const out: IkeaGltfDef[] = []
  for (const def of defs) {
    const variants = await Promise.all(
      def.variants.map(async (v) => {
        let next = v
        if (v.assetId) {
          const rec = await IdbAssetStore.get(v.assetId).catch(() => null)
          if (rec) next = { ...next, runtimeUrl: URL.createObjectURL(rec.blob) }
        }
        if (v.imageAssetId) {
          const imgRec = await IdbAssetStore.get(v.imageAssetId).catch(() => null)
          if (imgRec) next = { ...next, runtimeImageUrl: URL.createObjectURL(imgRec.blob) }
        }
        return next
      }),
    )
    const resolved = { ...def, variants }
    const active =
      variants.find((v) => v.finish === def.activeVariant) ?? variants.find((v) => v.runtimeUrl)
    if (active?.runtimeUrl && active.footprint)
      seedGltfFootprint(active.runtimeUrl, active.footprint)
    out.push(resolved)
  }
  return out
}

export async function hydrateUserAssets(): Promise<void> {
  // IndexedDB is unavailable in some test environments; fail soft so
  // the app still boots in those cases.
  if (typeof indexedDB === 'undefined') return

  let metas: Awaited<ReturnType<typeof IdbAssetStore.list>>
  try {
    metas = await IdbAssetStore.list()
  } catch {
    return
  }
  if (metas.length === 0) return

  const furniture: UserGltfDef[] = []
  // Group texture records by their parent matId so we can rebuild
  // material defs from the channel records on disk.
  const matChannels = new Map<
    string,
    Partial<Record<'albedo' | 'normal' | 'roughness' | 'ao', AssetRecord>>
  >()

  for (const m of metas) {
    // Pack-installed assets share the IDB store; skip them here so they
    // don't surface as user uploads. hydratePacks() reconstructs them.
    if (m.meta?.['source'] === 'pack') continue
    if (m.kind === 'gltf') {
      // Generated LOD tier siblings (`<id>:lod-low/-medium`) are owned by
      // their base asset — resolved below, never surfaced as their own def.
      if (m.meta?.['role'] === 'lod') continue
      const rec = await IdbAssetStore.get(m.assetId)
      if (!rec) continue
      const cat = m.meta?.['category']
      const category: FurnitureCategory =
        typeof cat === 'string' && (FURNITURE_CATEGORIES as readonly string[]).includes(cat)
          ? (cat as FurnitureCategory)
          : 'decor'
      const runtimeUrl = URL.createObjectURL(rec.blob)
      // Persisted footprint (set when measured at save time, e.g. the GLB
      // designer / parametric generator) — exact dims before the GLB loads.
      const storedFootprint = safeParse<{ w: number; d: number; h: number }>(m.meta?.['footprint'])
      const footprint =
        storedFootprint &&
        [storedFootprint.w, storedFootprint.d, storedFootprint.h].every(
          (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
        )
          ? storedFootprint
          : { w: 1.0, d: 1.0, h: 1.0 }
      furniture.push({
        id: `user-${m.assetId}`,
        name: m.name,
        category,
        kind: 'gltf',
        source: 'user',
        assetId: m.assetId,
        contentHash: m.meta?.['contentHash'] as string | undefined,
        uploadedAt: m.uploadedAt,
        defaultFootprint: footprint,
        runtimeUrl,
        mounted: m.meta?.['mounted'] as boolean | undefined,
        noClip: m.meta?.['noClip'] as boolean | undefined,
        finishTargets: safeParse<{ key: string; label: string }[]>(m.meta?.['finishTargets']),
        finishOverrides: safeParse<Record<string, string>>(m.meta?.['finishOverrides']),
        ...(typeof m.meta?.['price'] === 'number' ? { price: m.meta['price'] } : {}),
      })
      // Re-resolve the asset's generated LOD tier siblings (derived keys) and
      // re-register them — blob URLs are session-scoped, so the registry must
      // be rebuilt every boot for tier-routed loading to keep working.
      const lodUrls: Partial<Record<LodTier, string>> = {}
      for (const tier of LOD_TIERS) {
        const lodRec = await IdbAssetStore.get(lodAssetId(m.assetId, tier)).catch(() => null)
        if (lodRec) lodUrls[tier] = URL.createObjectURL(lodRec.blob)
      }
      if (lodUrls.low || lodUrls.medium) registerLodVariants(runtimeUrl, lodUrls)
    } else if (m.kind === 'texture') {
      // IKEA catalog thumbnails share the texture kind but are owned by the
      // IKEA def (resolved via resolveIkeaRuntimeUrls), not a user material.
      if (m.meta?.['role'] === 'ikea-image') continue
      const matId = m.meta?.['matId']
      const role = m.meta?.['role']
      if (typeof matId !== 'string' || typeof role !== 'string') continue
      if (role !== 'albedo' && role !== 'normal' && role !== 'roughness' && role !== 'ao') continue
      const rec = await IdbAssetStore.get(m.assetId)
      if (!rec) continue
      const bucket = matChannels.get(matId) ?? {}
      bucket[role] = rec
      matChannels.set(matId, bucket)
    }
  }
  useStore.getState().setUserFurniture(furniture)

  const materials: TexturedMaterialDef[] = []
  for (const [matId, channels] of matChannels.entries()) {
    if (!channels.albedo) continue
    const albedoMeta = channels.albedo.meta as
      | {
          matId?: string
          category?: string
          uvScale?: [number, number]
          swatch?: string
          name?: string
        }
      | undefined
    const category: MaterialCategory = albedoMeta?.category === 'wall' ? 'wall' : 'floor'
    const url = (rec: AssetRecord) => URL.createObjectURL(rec.blob)
    materials.push({
      id: matId,
      name: (channels.albedo.meta?.['name'] as string) ?? matId.slice(0, 8),
      category,
      kind: 'textured',
      source: 'user',
      swatch: '#cccccc',
      uvScale: [1, 1],
      textures: {
        albedo: channels.albedo.assetId,
        normal: channels.normal?.assetId,
        roughness: channels.roughness?.assetId,
        ao: channels.ao?.assetId,
      },
      runtimeUrls: {
        albedo: url(channels.albedo),
        normal: channels.normal ? url(channels.normal) : undefined,
        roughness: channels.roughness ? url(channels.roughness) : undefined,
        ao: channels.ao ? url(channels.ao) : undefined,
      },
    })
  }
  useStore.getState().setUserMaterials(materials)
}
