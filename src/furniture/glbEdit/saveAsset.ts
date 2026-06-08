import type { Object3D } from 'three'
import { exportGlb } from '../convert/toGlb'
import type { FurnitureCategory } from '../types'
import { type PersistResult, persistUserGlb } from '../upload/persist'

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
): Promise<PersistResult> {
  const buffer = await exportGlb(object)
  const safe = (name.trim() || 'Custom asset').replace(/[^\w\- ]+/g, '').slice(0, 60)
  const file = new File([buffer], `${safe || 'asset'}.glb`, { type: 'model/gltf-binary' })
  return persistUserGlb(file, {
    name: name.trim() || 'Custom asset',
    category,
    mounted: opts.mounted,
    noClip: opts.noClip,
  })
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
