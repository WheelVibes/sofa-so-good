/**
 * CSG geometry helpers for the GLB Asset Designer — the pure spec/geometry maths
 * shared by the live boolean evaluator (`csgEval.ts`, CSG v2): baking a part's
 * transform into its geometry (`bakedPartGeometry`), snapshotting a part's
 * surface look (`partAsGroupMaterial`), and wrapping a CSG result geometry as a
 * `mesh` `ShapePart` (`meshPartFromGeometry`, which serialises the per-group
 * material round-trip into `geometry.groups`/`geometry.materials`).
 *
 * (The old destructive v1 combine that fused two parts into one and dropped the
 * operands — `combineParts`/`canCombineParts`/`replaceWithCombined` — was removed
 * once CSG v2's non-destructive combine groups replaced it.)
 *
 * Inspector behaviour (GE3c tail): a combined mesh part's per-source materials are
 * frozen at combine time — they are not editable per-group after the fact (no face
 * picker). The PartInspector hides colour/finish/PBR sliders for mesh-kind parts,
 * showing only position and rotation fields (size is baked). This keeps the UI
 * simple and consistent; re-add the source parts if you need different finishes.
 *
 * Degenerate output (empty result, e.g. intersecting disjoint shapes, or a
 * zero-volume sliver) throws — callers catch and toast.
 */

import { type BufferGeometry, Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import { partGeometry } from './buildObject'
import { type GroupMaterialData, newPartId, type ShapePart } from './editSpec'

export type CsgOp = 'union' | 'subtract' | 'intersect'

export const CSG_OPS: { op: CsgOp; label: string }[] = [
  { op: 'union', label: 'Union' },
  { op: 'subtract', label: 'Subtract' },
  { op: 'intersect', label: 'Intersect' },
]

/** Smallest bounding-box extent (m) the combined result must keep on every
 *  axis — anything thinner is a degenerate sliver (e.g. two boxes touching
 *  only on a face) that would export as invisible/z-fighting geometry. */
const MIN_RESULT_EXTENT = 1e-4

/** The part's asset-local transform (centre position + degree Euler rotation)
 *  as a matrix, ready to bake into its geometry. */
export function partTransformMatrix(part: ShapePart): Matrix4 {
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0]
  return new Matrix4().compose(
    new Vector3(part.position[0], part.position[1], part.position[2]),
    new Quaternion().setFromEuler(
      new Euler(MathUtils.degToRad(rx), MathUtils.degToRad(ry), MathUtils.degToRad(rz)),
    ),
    new Vector3(1, 1, 1),
  )
}

/** Build the part's geometry with its transform BAKED IN (asset-local space),
 *  so CSG brushes can sit at identity. Caller owns disposal. */
export function bakedPartGeometry(part: ShapePart): BufferGeometry {
  const geo = partGeometry(part)
  geo.applyMatrix4(partTransformMatrix(part))
  return geo
}

/** Extract the surface-look config from a ShapePart as a `GroupMaterialData` record
 *  (used to snapshot the per-part material at combine time). Shared with the CSG
 *  v2 evaluator (`csgEval.ts`). */
export function partAsGroupMaterial(part: ShapePart): GroupMaterialData {
  return {
    color: part.color,
    finish: part.finish,
    roughness: part.roughness,
    metalness: part.metalness,
    emissiveIntensity: part.emissiveIntensity,
    opacity: part.opacity,
  }
}

/**
 * Turn a CSG result geometry (asset-local space) into a new `mesh` part:
 * re-centres the triangles on the bounding-box centre, places the part there
 * with identity rotation, and stores per-group material configs (GE3c tail).
 *
 * `groupMaterials` is the array of `MeshStandardMaterial` that the Evaluator
 * placed on the result brush (`result.material`) when `useGroups = true`. The
 * geometry's `groups` array maps each triangle range to a material index. Both
 * are serialised into `geometry.groups` / `geometry.materials` so the round-trip
 * (save → rehydrate → render) restores each source part's finish on its faces.
 *
 * When `groupMaterials` is empty/absent (legacy or single-material path), the
 * function falls back to `fallbackMaterial`'s colour/finish as before (back-compat).
 *
 * Throws on a degenerate result (no triangles / non-finite or sliver bounds).
 * Mutates (translates) the given geometry; caller owns disposal.
 */
export function meshPartFromGeometry(
  geometry: BufferGeometry,
  fallbackMaterial: ShapePart,
  /** Per-group `GroupMaterialData` list (index-matched to geometry.groups).
   *  When non-empty the `groups`/`materials` fields are stored in the serialised
   *  geometry so each source part's finish is preserved. */
  groupMaterials: GroupMaterialData[] = [],
): ShapePart {
  const pos = geometry.getAttribute('position')
  if (!pos || pos.count < 3) throw new Error('CSG result has no triangles')
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) throw new Error('CSG result has no bounds')
  // Round to a micrometre so the part's editable position/size fields read as
  // clean numbers (CSG output carries float32 noise like 0.2000000014901161).
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  const centre = box.getCenter(new Vector3())
  centre.set(round(centre.x), round(centre.y), round(centre.z))
  const size = box.getSize(new Vector3())
  size.set(round(size.x), round(size.y), round(size.z))
  if (
    ![centre.x, centre.y, centre.z, size.x, size.y, size.z].every(Number.isFinite) ||
    Math.min(size.x, size.y, size.z) < MIN_RESULT_EXTENT
  ) {
    throw new Error('CSG result is degenerate')
  }
  geometry.translate(-centre.x, -centre.y, -centre.z)
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const index = geometry.getIndex()

  // Snapshot geometry groups for the multi-material round-trip.
  const geoGroups = geometry.groups.length > 0 ? geometry.groups : []
  const hasGroups = geoGroups.length > 0 && groupMaterials.length > 0

  return {
    id: newPartId(),
    kind: 'mesh',
    position: [centre.x, centre.y, centre.z],
    size: [size.x, size.y, size.z],
    // Fall back to first-part material for the ShapePart-level fields so
    // pre-C273 rendering paths that don't read geometry.materials still work.
    color: fallbackMaterial.color,
    finish: hasGroups ? undefined : fallbackMaterial.finish,
    roughness: hasGroups ? undefined : fallbackMaterial.roughness,
    metalness: hasGroups ? undefined : fallbackMaterial.metalness,
    emissiveIntensity: hasGroups ? undefined : fallbackMaterial.emissiveIntensity,
    opacity: hasGroups ? undefined : fallbackMaterial.opacity,
    geometry: {
      positions: Array.from(geometry.getAttribute('position').array),
      normals: Array.from(geometry.getAttribute('normal').array),
      index: index ? Array.from(index.array) : undefined,
      // Per-source-part group ranges + material configs (GE3c tail).
      groups: hasGroups
        ? geoGroups.map((g) => ({
            start: g.start,
            count: g.count,
            materialIndex: g.materialIndex ?? 0,
          }))
        : undefined,
      materials: hasGroups ? groupMaterials : undefined,
    },
  }
}
