import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import type { FurnitureCategory, UserGltfDef } from '../types'
import { validateGlbFile } from './validate'

export interface PersistOptions {
  name: string
  category: FurnitureCategory
  mounted?: boolean
  noClip?: boolean
  finishTargets?: { key: string; label: string }[]
  finishOverrides?: Record<string, string>
}

export type PersistResult = { ok: true; def: UserGltfDef } | { ok: false; reason: string }

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `asset-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

/** Validates → writes the blob to IndexedDB → registers a UserGltfDef
 *  in the store. The catalog merge picks the new entry up reactively;
 *  the GltfModel wrapper resolves the assetId at render time. */
export async function persistUserGlb(file: File, opts: PersistOptions): Promise<PersistResult> {
  const v = await validateGlbFile(file)
  if (!v.ok) return { ok: false, reason: v.reason }

  const assetId = newId()
  const blob = new Blob([await file.arrayBuffer()], { type: v.mime })
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
