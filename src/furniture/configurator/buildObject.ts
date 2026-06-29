/**
 * Slot configurator — composed model → three.js object (SLOT-102).
 *
 * Maps `composeProduct`'s procedural parts to a `Group` of box meshes, reusing
 * `furnitureMaterials.ts` so the preview can't drift from the baked GLB. To make
 * the baked product re-skinnable through the existing finish-override channel,
 * every part sharing a `finishKey` gets ONE cloned material named after that key
 * — so `listFinishTargets` discovers the same keys `composeProduct` returns.
 * Browser-only (canvas textures). GLB-sub-asset options (SLOT-203) are not yet
 * loaded here; v1 products are all-procedural.
 */

import { BoxGeometry, Group, type Material, Mesh } from 'three'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { type ComposedModel, composeProduct } from './compose'
import type { ConfigurableProduct, ConfiguredSpec } from './model'

export interface BuiltConfigured {
  object: Group
  model: ComposedModel
  /** Re-skin targets present in the baked GLB (procedural parts for v1). */
  finishTargets: { key: string; label: string }[]
}

/**
 * Build the assembled product as a Group of box meshes (floor-anchored, centred,
 * +Z forward). Async to allow GLB-option loading in a later phase; v1 resolves
 * immediately (no network — all-procedural products). Caller disposes via
 * {@link disposeConfiguredObject}.
 */
export async function buildConfiguredObject(
  product: ConfigurableProduct,
  spec: Partial<ConfiguredSpec> | null | undefined,
): Promise<BuiltConfigured> {
  const model = composeProduct(product, spec)
  const group = new Group()
  // One cloned, named material per finish key → distinct material names in the
  // exported GLB so the finish-override channel can target each group. Cloning
  // shares the cached base's textures (no per-instance texture allocation); the
  // clones are disposed with the group.
  const matByKey = new Map<string, Material>()
  for (const part of model.parts) {
    const key = part.finishKey ?? part.role
    let mat = matByKey.get(key)
    if (!mat) {
      const base = getSurfaceMaterial(part.material ?? 'painted', part.color ?? '#cccccc', 1)
      mat = base.clone()
      mat.name = key
      matByKey.set(key, mat)
    }
    const mesh = new Mesh(new BoxGeometry(...part.size), mat)
    mesh.position.set(...part.position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = key
    group.add(mesh)
  }
  return { object: group, model, finishTargets: model.finishTargets }
}

/** Dispose every geometry + the per-key cloned materials in a built group.
 *  (Textures are shared via the furnitureMaterials cache — never disposed here.) */
export function disposeConfiguredObject(group: Group): void {
  const mats = new Set<Material>()
  for (const child of group.children) {
    const mesh = child as Mesh
    mesh.geometry?.dispose?.()
    const m = mesh.material
    if (m) for (const one of Array.isArray(m) ? m : [m]) mats.add(one)
  }
  for (const m of mats) m.dispose()
}
