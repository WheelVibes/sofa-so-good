import { Box3, type Object3D, Vector3 } from 'three'
import { useStore } from '../../state/store'
import { exportGlb } from '../convert/toGlb'
import type { FurnitureCategory, UserGltfDef } from '../types'
import { type PersistResult, persistUserGlb } from '../upload/persist'

/** Measured world footprint (m) of a built object, for an accurate
 *  `defaultFootprint`. Returns null for an empty/degenerate object. */
function measureFootprint(object: Object3D): { w: number; d: number; h: number } | null {
  const box = new Box3().setFromObject(object)
  if (box.isEmpty()) return null
  const size = box.getSize(new Vector3())
  if (!Number.isFinite(size.x) || size.x <= 0) return null
  return { w: size.x, d: size.z, h: size.y }
}

/**
 * Export a designer-built object to a binary GLB and persist it as a new user
 * asset (so it lands in the catalog like any uploaded model). Reuses the exact
 * upload pipeline — `exportGlb` (GLTFExporter) → `File` → `persistUserGlb` —
 * which validates, de-dupes by content hash, writes the blob to IDB, and
 * registers the def. Returns the persist result (def or failure reason).
 */
export async function exportAndSaveAsset(
  object: Object3D,
  name: string,
  category: FurnitureCategory,
  opts: { mounted?: boolean; noClip?: boolean } = {},
  /** When set to an existing **user** asset's id, the result replaces that asset
   *  in place (keeping every placed instance referencing it) instead of adding a
   *  new catalog entry — "save edits back over the original". */
  overwriteId?: string,
): Promise<PersistResult> {
  const buffer = await exportGlb(object)
  const safe = (name.trim() || 'Custom asset').replace(/[^\w\- ]+/g, '').slice(0, 60)
  const file = new File([buffer], `${safe || 'asset'}.glb`, { type: 'model/gltf-binary' })
  // Overwrite only a def that actually exists + is a user asset (defensive).
  const overwriting =
    !!overwriteId &&
    useStore.getState().userFurniture.some((d) => d.id === overwriteId && d.source === 'user')
  const res = await persistUserGlb(file, {
    name: name.trim() || 'Custom asset',
    category,
    mounted: opts.mounted,
    noClip: opts.noClip,
    footprint: measureFootprint(object) ?? undefined,
    // Don't auto-register a new def when overwriting — we re-home it under the
    // existing id ourselves so placed instances ride through.
    commit: !overwriting,
  })
  if (!res.ok || !overwriting) return res
  const def = buildOverwriteDef(res.def as UserGltfDef, overwriteId, name, category)
  useStore.getState().replaceUserFurniture(def)
  return { ok: true, def, duplicate: res.duplicate }
}

/** Build the replacement def for an overwrite: the freshly-persisted def's
 *  blob/asset/footprint, re-homed under the existing def's id (so placed
 *  instances keep referencing it) with the chosen name + category. Pure. */
export function buildOverwriteDef(
  fresh: UserGltfDef,
  existingId: string,
  name: string,
  category: FurnitureCategory,
): UserGltfDef {
  return { ...fresh, id: existingId, name: name.trim() || 'Custom asset', category }
}

/** UI placement choice → the collision flags a piece needs. */
export function placementFlags(placement: 'floor' | 'wall' | 'floorCovering'): {
  mounted?: boolean
  noClip?: boolean
} {
  if (placement === 'wall') return { mounted: true }
  if (placement === 'floorCovering') return { noClip: true }
  return {}
}
