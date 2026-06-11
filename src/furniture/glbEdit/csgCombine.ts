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
 *   - the result is re-centred on its bounding-box centre and stored as a new
 *     part at that centre with identity rotation (`meshPartFromGeometry`),
 *     carrying the FIRST part's material;
 *   - the new part replaces part A in place and drops part B
 *     (`replaceWithCombined`).
 *
 * Degenerate output (empty result, e.g. intersecting disjoint shapes, or a
 * zero-volume sliver) throws — callers catch and toast.
 */

import { type BufferGeometry, Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import { partGeometry } from './buildObject'
import { type AssetEditSpec, newPartId, type ShapePart } from './editSpec'

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

/**
 * Turn a CSG result geometry (asset-local space) into a new `mesh` part:
 * re-centres the triangles on the bounding-box centre, places the part there
 * with identity rotation, and carries `material`'s colour/PBR finish.
 * Throws on a degenerate result (no triangles / non-finite or sliver bounds).
 * Mutates (translates) the given geometry; caller owns disposal.
 */
export function meshPartFromGeometry(geometry: BufferGeometry, material: ShapePart): ShapePart {
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
  return {
    id: newPartId(),
    kind: 'mesh',
    position: [centre.x, centre.y, centre.z],
    size: [size.x, size.y, size.z],
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
    emissiveIntensity: material.emissiveIntensity,
    opacity: material.opacity,
    geometry: {
      positions: Array.from(geometry.getAttribute('position').array),
      normals: Array.from(geometry.getAttribute('normal').array),
      index: index ? Array.from(index.array) : undefined,
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
  try {
    const brushA = new Brush(geoA)
    const brushB = new Brush(geoB)
    brushA.updateMatrixWorld()
    brushB.updateMatrixWorld()
    const evaluator = new Evaluator()
    // Single-material output in plain position/normal terms (primitive parts
    // have one material; UVs would be meaningless across a boolean anyway).
    evaluator.attributes = ['position', 'normal']
    evaluator.useGroups = false
    const csgOp = op === 'union' ? ADDITION : op === 'subtract' ? SUBTRACTION : INTERSECTION
    const result = evaluator.evaluate(brushA, brushB, csgOp)
    const combined = meshPartFromGeometry(result.geometry, a)
    result.geometry.dispose()
    return { spec: replaceWithCombined(spec, idA, idB, combined), partId: combined.id }
  } finally {
    geoA.dispose()
    geoB.dispose()
  }
}
