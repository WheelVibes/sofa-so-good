/**
 * Parametric furniture (PF1) — part list → three.js object.
 *
 * Maps the pure `buildParametric` model to a `Group` of box meshes with real
 * three `Material`s from `furnitureMaterials.ts` (tintable wood / painted /
 * gloss, `mat:<id>` DLC pass-through via `getSurfaceMaterial`). Shared by the
 * dialog's live preview AND the save/export path so the preview can never
 * drift from the saved GLB. Browser-only (canvas textures).
 */

import { BoxGeometry, Group, type Material, Mesh } from 'three'
import { getSolidMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { buildParametric, type ParametricModel, type ParametricPartRole } from './buildParts'
import type { ParametricSpec } from './spec'

/** Material for one part role. Panels carry the chosen finish; the plinth is
 *  a dark recessed kick; handles + rail read as brushed metal. */
export function partMaterial(role: ParametricPartRole, spec: ParametricSpec): Material {
  if (role === 'handle' || role === 'rail') return getSolidMaterial('#9b9b9b', 0.35, 0.85)
  if (role === 'plinth') return getSolidMaterial('#3a3733', 0.8, 0.05)
  // Back panels are typically a thinner, flatter board — keep the tint but
  // drop the gloss so an open shelf's interior doesn't mirror-shine.
  if (role === 'back')
    return getSurfaceMaterial(spec.finish === 'gloss' ? 'painted' : spec.finish, spec.color, 1.2)
  return getSurfaceMaterial(spec.finish, spec.color, 1.2)
}

/** Build the full piece as a Group of box meshes (floor-anchored, centred,
 *  facing +Z). Returns the model too so callers reuse bounds/price inputs.
 *  Caller owns disposal of the geometries (`disposeParametricObject`). */
export function buildParametricObject(spec: ParametricSpec): {
  object: Group
  model: ParametricModel
} {
  const model = buildParametric(spec)
  const group = new Group()
  for (const part of model.parts) {
    const mesh = new Mesh(new BoxGeometry(...part.size), partMaterial(part.role, spec))
    mesh.position.set(...part.position)
    mesh.castShadow = mesh.receiveShadow = true
    mesh.name = part.role
    group.add(mesh)
  }
  return { object: group, model }
}

/** Dispose every geometry in a built group (materials are shared via the
 *  furnitureMaterials cache — never dispose those). */
export function disposeParametricObject(group: Group): void {
  for (const child of group.children) {
    if (child instanceof Mesh) child.geometry.dispose()
  }
}
