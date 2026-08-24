/**
 * Object-space box projection for parametric furniture (MAT-006c).
 *
 * Every parametric piece is built from boxes whose geometry carries the DEFAULT
 * `BoxGeometry` UVs: 0..1 per face, whatever the face measures. A finish tiled
 * through those UVs therefore scales with the part instead of with the world —
 * a 1.6 m tabletop and a 4 cm leg show the same number of tiles — and its
 * direction follows each face's own UV axes, so wood grain runs across a leg
 * rather than along it.
 *
 * This projects instead from the part's own geometry: per vertex, drop the axis
 * its normal points along most strongly (the face it belongs to) and use the
 * other two local coordinates as UV **in metres**, so the tile period is
 * physical. U is assigned to the LONGER of the face's two axes, which is what
 * puts grain along a leg's length, along a rail's run, and along a tabletop's
 * long side — the direction a joiner would pick.
 *
 * Object space, not world: a part keeps its mapping when the item is moved or
 * rotated (a rotated chair's grain doesn't swim), unlike the world-space
 * `triplanar.ts` used for the fixed shell.
 *
 * Pure geometry helpers — no three, no React (the three-facing wrapper is
 * `applyBoxUv`). `dominantAxis` is shared with the triplanar path.
 */

import { BufferAttribute, type BufferGeometry, type Object3D } from 'three'
import { dominantAxis } from './triplanar'

/**
 * Which local axes become (U, V) for a face whose normal is dominated by `axis`,
 * given the part's bounding size. The pair is the two axes that survive the
 * projection; U is the longer of them so the texture's primary direction (wood
 * grain, plank run, brushed metal) follows the part's length.
 *
 * Returns `[uAxis, vAxis]` as local axis indices (0=x, 1=y, 2=z).
 */
export function faceAxes(axis: 0 | 1 | 2, size: [number, number, number]): [number, number] {
  // Drop `axis`; the survivors keep the same order the triplanar projection uses
  // (x-dominant → (z, y), y-dominant → (x, z), z-dominant → (x, y)).
  const pair: [number, number] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1]
  return size[pair[1]] > size[pair[0]] ? [pair[1], pair[0]] : pair
}

/**
 * Box-project a vertex buffer: one UV per vertex, in metres of the part's local
 * frame. `positions`/`normals` are flat `[x,y,z,…]` arrays of equal length;
 * `size` is the part's bounding-box extent (metres) and only decides which axis
 * of each face carries U. Returns `null` on a malformed buffer.
 */
export function boxProjectUv(
  positions: Float32Array,
  normals: Float32Array,
  size: [number, number, number],
): Float32Array | null {
  if (positions.length !== normals.length) return null
  const vertCount = positions.length / 3
  if (!Number.isInteger(vertCount) || vertCount === 0) return null
  const uv = new Float32Array(vertCount * 2)
  for (let v = 0; v < vertCount; v++) {
    const i = v * 3
    const axis = dominantAxis(normals[i], normals[i + 1], normals[i + 2])
    const [ua, va] = faceAxes(axis, size)
    uv[v * 2] = positions[i + ua]
    uv[v * 2 + 1] = positions[i + va]
  }
  return uv
}

/** Geometry types this projection is safe on: the axis-aligned slabs parametric
 *  furniture is built from. `ExtrudeGeometry` covers drei's `RoundedBox` (our
 *  `BeveledBox` — tabletops, carcasses, legs). Round shapes (cylinders, spheres,
 *  lathes) keep their own wrap, which suits them better than a box projection,
 *  and GLB meshes keep their authored UVs. */
const PROJECTABLE = new Set(['BoxGeometry', 'ExtrudeGeometry'])

/**
 * Rewrite a geometry's UV attribute in place with {@link boxProjectUv}, sized
 * from its own bounding box. Idempotent + cheap to call repeatedly: the
 * geometry is tagged, so a re-render never re-projects. Returns true when it
 * (re)wrote UVs.
 */
export function applyBoxUv(geo: BufferGeometry): boolean {
  if (!PROJECTABLE.has(geo.type)) return false
  if (geo.userData.__boxUv) return false
  const pos = geo.attributes.position
  const nrm = geo.attributes.normal
  if (!pos || !nrm) return false
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  if (!bb) return false
  const size: [number, number, number] = [
    bb.max.x - bb.min.x,
    bb.max.y - bb.min.y,
    bb.max.z - bb.min.z,
  ]
  const uv = boxProjectUv(pos.array as Float32Array, nrm.array as Float32Array, size)
  if (!uv) return false
  geo.setAttribute('uv', new BufferAttribute(uv, 2))
  geo.userData.__boxUv = true
  return true
}

/** Apply {@link applyBoxUv} to every projectable mesh under `root`. Returns how
 *  many geometries were rewritten (0 on a re-run — the tag makes it a no-op). */
export function boxProjectSubtree(root: Object3D): number {
  let n = 0
  root.traverse((o) => {
    const geo = (o as { geometry?: BufferGeometry }).geometry
    if (geo && applyBoxUv(geo)) n++
  })
  return n
}
