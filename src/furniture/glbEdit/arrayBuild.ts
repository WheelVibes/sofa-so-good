/**
 * GLB Asset Designer — Stage 4 linear & radial ARRAY: duplicate a selection into
 * a regular pattern, landed as ONE named transform group so the whole array
 * moves/edits as a unit (`addPlacedComponent`, exactly like a placed component).
 *
 * Pure of the store + React. The **radial** path reuses the room editor's pure
 * `radialArrayPlacements` (`furniture/radialArray.ts`) verbatim — its
 * `{ position:[x,z], rotation }` output in the floor XZ plane maps straight onto
 * a designer part's `[x, y, z]` + Y-rotation, so the polar maths is not
 * re-derived here (only the cluster-offset composition around each ring slot is
 * new). The **linear** path is a trivial evenly-spaced 3D translation, so it is
 * implemented directly (the room helper's `arrayOffsets` is XZ-plane +
 * FurnitureItem-shaped and rotation-relative — the wrong shape for an
 * axis-aligned X/Y/Z designer array).
 */

import { radialArrayPlacements } from '../radialArray'
import { selectionBounds } from './arrange'
import {
  type AssetEditSpec,
  addPlacedComponent,
  appendClonedDecals,
  clonePartAtPose,
  type ShapePart,
} from './editSpec'

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/** Axis for a linear array (asset-local). */
export type LinearArrayAxis = 'x' | 'y' | 'z'
const AXIS_INDEX: Record<LinearArrayAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/** Safety caps shared by both array kinds. */
const ARRAY_MAX_COPIES = 50
const ARRAY_MIN_GAP = 0.001

export interface LinearArrayOptions {
  /** Number of copies to create (each offset by one pitch step per k = 1…count). ≥1. */
  count: number
  /** EDGE gap between adjacent copies' bounding boxes, in metres (the clear space
   *  left between them) — the pitch is `sourceExtent + gap` on the chosen axis, so
   *  the word "gap" matches the geometry. May be negative (copies overlap /
   *  array in the −axis direction). */
  gap: number
  axis: LinearArrayAxis
}

const clampCount = (n: number) => Math.max(1, Math.min(ARRAY_MAX_COPIES, Math.floor(n)))

/** Resolve the source parts for a set of ids (order preserved, unknowns dropped). */
function sourceParts(spec: AssetEditSpec, ids: string[]): ShapePart[] {
  return ids.map((id) => spec.parts.find((p) => p.id === id)).filter((p): p is ShapePart => !!p)
}

/**
 * Linear array: clone the source part(s) `count` times, each offset by one pitch
 * step per k (k = 1…count) along the chosen axis, and wrap the copies in one new
 * named group ("Array"). The pitch is EDGE-gap semantics — `sourceExtent + gap`
 * (rotation/kind-aware extent from `arrange.selectionBounds`) — so adjacent
 * copies leave `gap` metres of clear space between their bounding boxes and the
 * cluster shape is preserved. The originals are left in place. Returns
 * `{ spec, groupId }` (groupId null when no source resolves or the gap is
 * degenerate). Pure — one spec transition = one undo step.
 */
export function linearArray(
  spec: AssetEditSpec,
  sourceIds: string[],
  opts: LinearArrayOptions,
): { spec: AssetEditSpec; groupId: string | null } {
  const src = sourceParts(spec, sourceIds)
  if (src.length === 0 || Math.abs(opts.gap) < ARRAY_MIN_GAP) return { spec, groupId: null }
  const count = clampCount(opts.count)
  const i = AXIS_INDEX[opts.axis]
  // Edge-gap pitch: the source cluster's extent on this axis + the requested gap,
  // signed so a negative gap still arrays in the −axis direction.
  const extent = selectionBounds(src)?.size[i] ?? 0
  const pitch = Math.sign(opts.gap) * (extent + Math.abs(opts.gap))
  const copies: ShapePart[] = []
  const pairs: Array<{ srcId: string; newId: string }> = []
  for (let k = 1; k <= count; k++) {
    for (const p of src) {
      const pos = [...p.position] as [number, number, number]
      pos[i] = pos[i] + pitch * k
      const copy = clonePartAtPose(p, pos, p.rotation ? [...p.rotation] : undefined)
      copies.push(copy)
      pairs.push({ srcId: p.id, newId: copy.id })
    }
  }
  const { spec: out, groupId } = addPlacedComponent(spec, copies, 'Array')
  return { spec: appendClonedDecals(out, pairs), groupId }
}

export interface RadialArrayOptions {
  /** Number of copies placed around the ring. ≥2. */
  count: number
  /** Ring radius in metres. */
  radius: number
  /** Total angular sweep in DEGREES (360 = full circle). */
  sweepDeg: number
}

/**
 * Radial array: place `count` copies of the source cluster evenly around a ring
 * (centred on the selection's XZ centroid), each rotated to face the centre.
 * Reuses `radialArrayPlacements` for the polar positions/yaws; a multi-part
 * source is carried rigidly (its per-part offset from the centroid is rotated by
 * each slot's yaw). Returns `{ spec, groupId }`. Pure — one undo step.
 */
export function radialArray(
  spec: AssetEditSpec,
  sourceIds: string[],
  opts: RadialArrayOptions,
): { spec: AssetEditSpec; groupId: string | null } {
  const src = sourceParts(spec, sourceIds)
  if (src.length === 0) return { spec, groupId: null }
  // Ring centre = the source cluster's XZ centroid.
  const cx = src.reduce((s, p) => s + p.position[0], 0) / src.length
  const cz = src.reduce((s, p) => s + p.position[2], 0) / src.length
  const placements = radialArrayPlacements({
    center: [cx, cz],
    radius: opts.radius,
    count: opts.count,
    sweep: opts.sweepDeg * DEG,
    faceCenter: true,
  })
  if (placements.length === 0) return { spec, groupId: null }
  const copies: ShapePart[] = []
  const pairs: Array<{ srcId: string; newId: string }> = []
  for (const pl of placements) {
    const yawDeg = pl.rotation * RAD
    const cos = Math.cos(pl.rotation)
    const sin = Math.sin(pl.rotation)
    for (const p of src) {
      // Part offset from the centroid, rotated by this slot's yaw (three's
      // Y-rotation of an (x,z) vector) then placed at the ring position.
      const dx = p.position[0] - cx
      const dz = p.position[2] - cz
      const rx = dx * cos + dz * sin
      const rz = -dx * sin + dz * cos
      const pos: [number, number, number] = [
        pl.position[0] + rx,
        p.position[1],
        pl.position[1] + rz,
      ]
      const baseRot = p.rotation ?? [0, 0, 0]
      const rot: [number, number, number] = [baseRot[0], baseRot[1] + yawDeg, baseRot[2]]
      const copy = clonePartAtPose(p, pos, rot)
      copies.push(copy)
      pairs.push({ srcId: p.id, newId: copy.id })
    }
  }
  const { spec: out, groupId } = addPlacedComponent(spec, copies, 'Array')
  return { spec: appendClonedDecals(out, pairs), groupId }
}
