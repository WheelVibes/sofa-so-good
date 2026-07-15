/**
 * CSG boolean combine for the GLB Asset Designer — union / subtract / intersect
 * two primitive (or already-combined) parts into ONE new `mesh` part whose
 * triangles are baked into the spec (`ShapePart.geometry`).
 *
 * The heavy lifting is `three-bvh-csg` (MIT), DYNAMIC-imported inside
 * `combineParts` so it stays out of the boot bundle — everything else here is
 * pure spec/geometry maths, unit-testable without the library:
 *   - each part's local transform (position + degree rotation) is baked into
 *     its geometry first (`bakedPartGeometry`), so the CSG runs in plain
 *     asset-local space with identity brushes;
 *   - the result geometry carries one group per source part (via `useGroups=true`),
 *     and the result brush's material array maps group→source part material config
 *     (`meshPartFromGeometry` serialises both into `geometry.groups`/`geometry.materials`);
 *   - the new part replaces part A in place and drops part B
 *     (`replaceWithCombined`).
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

import {
  type BufferGeometry,
  Euler,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { partGeometry } from './buildObject'
import { type AssetEditSpec, type GroupMaterialData, newPartId, type ShapePart } from './editSpec'

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

/** True when `idA`/`idB` name two distinct existing parts — the only inputs a
 *  combine accepts. (Parts are primitive shapes or previous combine results by
 *  construction; the source GLB is never a part, so it can't be combined.) */
export function canCombineParts(spec: AssetEditSpec, idA: string, idB: string): boolean {
  if (idA === idB) return false
  const has = (id: string) => spec.parts.some((p) => p.id === id)
  return has(idA) && has(idB)
}

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

/** Replace part A (in place, keeping list order) with the combined part and
 *  drop part B. Pure/immutable like the other spec helpers. */
export function replaceWithCombined(
  spec: AssetEditSpec,
  idA: string,
  idB: string,
  combined: ShapePart,
): AssetEditSpec {
  return {
    ...spec,
    parts: spec.parts.filter((p) => p.id !== idB).map((p) => (p.id === idA ? combined : p)),
  }
}

/**
 * Boolean-combine parts `idA` (op) `idB` into one new `mesh` part. Async: the
 * CSG engine (`three-bvh-csg`) is dynamic-imported on first use. Returns the
 * next spec plus the new part's id (for reselection). Throws if the ids are
 * invalid or the result is degenerate — catch and toast.
 *
 * GE3c tail: uses `useGroups = true` so the result geometry carries one draw
 * group per source part, preserving each part's finish on its own faces.
 * Brush materials are throwaway `MeshStandardMaterial` instances whose colour is
 * set to the part's `color` — they are only used by the Evaluator's group-
 * deduplication logic (two groups sharing the same material object are merged);
 * the actual per-group surface look is captured as `GroupMaterialData` snapshots
 * from the source `ShapePart` specs, independent of three.js materials.
 *
 * Parts that share the same `finish` + `color` combination are assigned the same
 * brush material instance so the Evaluator's `consolidateGroups` logic naturally
 * merges their triangles into one group — visually correct and more efficient than
 * redundant separate groups.
 */
export async function combineParts(
  spec: AssetEditSpec,
  idA: string,
  idB: string,
  op: CsgOp,
): Promise<{ spec: AssetEditSpec; partId: string }> {
  const a = spec.parts.find((p) => p.id === idA)
  const b = spec.parts.find((p) => p.id === idB)
  if (!a || !b || a === b) throw new Error('combine needs two distinct parts')
  const { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } = await import('three-bvh-csg')
  const geoA = bakedPartGeometry(a)
  const geoB = bakedPartGeometry(b)

  // Build lightweight proxy materials for the Evaluator's group-deduplication:
  // parts with identical finish+colour share an instance so their groups merge.
  const matCache = new Map<string, MeshStandardMaterial>()
  const brushMat = (part: ShapePart): MeshStandardMaterial => {
    const key = `${part.color}|${part.finish ?? ''}`
    let m = matCache.get(key)
    if (!m) {
      m = new MeshStandardMaterial({ color: part.color })
      matCache.set(key, m)
    }
    return m
  }

  try {
    const brushA = new Brush(geoA)
    const brushB = new Brush(geoB)
    brushA.material = brushMat(a)
    brushB.material = brushMat(b)
    brushA.updateMatrixWorld()
    brushB.updateMatrixWorld()
    const evaluator = new Evaluator()
    // useGroups = true: result geometry carries one group per source material,
    // and result.material is the array of MeshStandardMaterial proxy instances.
    // Include 'uv' so existing UV data survives (boxProjectUvs is a no-op when
    // UVs are present, but the CSG attributes list must include 'uv' to carry them).
    evaluator.attributes = ['position', 'normal', 'uv']
    evaluator.useGroups = true
    const csgOp = op === 'union' ? ADDITION : op === 'subtract' ? SUBTRACTION : INTERSECTION
    const result = evaluator.evaluate(brushA, brushB, csgOp)

    // Map each proxy material back to the source part's GroupMaterialData.
    // The Evaluator's `result.material` is the deduplicated array of proxy mats.
    const resultMats: MeshStandardMaterial[] = Array.isArray(result.material)
      ? (result.material as MeshStandardMaterial[])
      : [result.material as MeshStandardMaterial]

    const matA = brushMat(a)
    const matB = brushMat(b)
    const gmA = partAsGroupMaterial(a)
    const gmB = partAsGroupMaterial(b)

    // Build the GroupMaterialData array index-matched to resultMats.
    const groupMaterials: GroupMaterialData[] = resultMats.map((m) => {
      // Proxy mats are identity-compared to the brush mats.
      if (m === matA) return gmA
      if (m === matB) return gmB
      // Shared proxy (same finish+colour) → use part A's config (first operand).
      return gmA
    })

    const combined = meshPartFromGeometry(result.geometry, a, groupMaterials)
    result.geometry.dispose()
    return { spec: replaceWithCombined(spec, idA, idB, combined), partId: combined.id }
  } finally {
    geoA.dispose()
    geoB.dispose()
    for (const m of matCache.values()) m.dispose()
  }
}
