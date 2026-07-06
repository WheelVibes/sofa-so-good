import { BufferAttribute, ExtrudeGeometry, MeshStandardMaterial, Path, Shape } from 'three'
import type { WallBodyOutline } from './wallBodyShape'

/** Structural (unpainted) wall colour — the wall's TOP edge, its outward/exterior
 *  faces, and opening jambs stay this clean off-white regardless of the room's
 *  wall FINISH, which only paints the interior room-facing surface. Used by both
 *  the orbit body and the per-room-editor body. */
export const WALL_STRUCTURE_COLOR = '#f1f0ec'

let structureMaterial: MeshStandardMaterial | null = null
/** Shared structural-white wall material (room editor). Reused across walls; the
 *  reveal fade clones it per-mesh, so the shared instance is never mutated. */
export function getWallStructureMaterial(): MeshStandardMaterial {
  if (!structureMaterial) {
    structureMaterial = new MeshStandardMaterial({ color: WALL_STRUCTURE_COLOR, roughness: 0.9 })
  }
  return structureMaterial
}

/**
 * Mitre spec for the extruded wall body. At a true L-corner the two walls meet
 * along the 45° angle-bisector; each wall's end is cut to that diagonal so they
 * share the corner equally. Because the two mitred end-faces are then EXACTLY
 * coincident with OPPOSITE normals, backface culling renders only one from any
 * viewpoint — a genuinely seamless join with no z-fighting and no doubled
 * translucency (no pixel overlaps two coplanar faces).
 *
 * `endAt`/`startAt` are the along-axis (local +X) coordinate of the corner's
 * CENTRE-LINE vertex at each end — the intersection of this wall's centre-line
 * with the neighbour's. For orbit walls (endpoints ARE the shared corner) that is
 * `±length/2`; for room-editor clipped walls (endpoints sit at the interior
 * footprint corner, half a neighbour-thickness short of the centre-line corner)
 * it is beyond the endpoint. `startSlope`/`endSlope` are the signed diagonal slope
 * for each mitred end (undefined = that end is NOT mitred): the cut line is
 * `x = at + slope·z`. The slope's sign encodes which vertex is the EXTERIOR one, so
 * it is correct for BOTH convex (exterior edge extends, interior retracts) AND
 * concave / inward-pointing corners — the caller derives it from the NEIGHBOUR's
 * outward normal so both walls at the corner cut to the SAME diagonal.
 */
export interface WallMiter {
  startAt?: number
  startSlope?: number
  endAt?: number
  endSlope?: number
}

/**
 * Shear the extruded body's mitred end(s) to the corner diagonal by clamping each
 * vertex's along-axis (local X) to the cut line `x = at + slope·z`. The LONG side
 * reaches the shared outer corner vertex, the short side the inner one; both walls
 * at the corner clamp to the SAME line, so their end-faces coincide exactly. Runs
 * on the centred geometry (z ∈ ±thickness/2) before normals are computed.
 */
function applyMiter(geo: ExtrudeGeometry, m: WallMiter): void {
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    if (m.endSlope !== undefined && m.endAt !== undefined && x > 1e-6) {
      const lim = m.endAt + m.endSlope * z
      if (x > lim) pos.setX(i, lim)
    } else if (m.startSlope !== undefined && m.startAt !== undefined && x < -1e-6) {
      const lim = m.startAt + m.startSlope * z
      if (x < lim) pos.setX(i, lim)
    }
  }
  pos.needsUpdate = true
}

/** Turn a wall-body cross-section (outline + holes, in the wall's centred
 *  along-axis × height frame) into a three `Shape` with hole paths. */
function wallBodyShape({ outline, holes }: WallBodyOutline): Shape {
  const shape = new Shape()
  shape.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1])
  shape.closePath()
  for (const h of holes) {
    const p = new Path()
    p.moveTo(h[0][0], h[0][1])
    for (let i = 1; i < h.length; i++) p.lineTo(h[i][0], h[i][1])
    p.closePath()
    shape.holes.push(p)
  }
  return shape
}

/**
 * Extrude a wall body from its cross-section outline + holes into ONE watertight
 * mesh (no internal seams), centred on the wall's thickness so it straddles the
 * centreline (floor at y = 0, +Z / −Z faces at ±thickness/2). Shared by the
 * orbit scene (`WallSegment`) and the per-room editor (`RoomShell` /
 * `PlanRoomShell`) so a wall's door/window openings carve real holes in EVERY
 * scene — otherwise an opaque room-editor wall box occludes the door/window
 * sitting inside it.
 */
export function extrudeWallBody(
  body: WallBodyOutline,
  thickness: number,
  /**
   * When set, split the mesh into TWO material groups so a caller can paint the
   * interior room-facing surface (group 0) differently from everything else
   * (group 1 — the top edge, the opposite/outer face, ends and opening jambs).
   * The value is the sign (+1/−1) of the LOCAL +Z whose extrude cap faces the
   * room interior (the room-editor body straddles its centreline, so its two
   * thickness caps are the inner + outer faces). Omit for a single-material body
   * (the orbit scene, which paints the interior via separate face planes).
   */
  innerFaceZSign?: number,
  /** Mitre one or both ends to the 45° corner diagonal (see {@link WallMiter}). */
  miter?: WallMiter,
): ExtrudeGeometry {
  const geo = new ExtrudeGeometry(wallBodyShape(body), {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  })
  // ExtrudeGeometry runs the profile along +Z from 0..depth; centre it on the
  // wall's thickness so the body straddles the centreline.
  geo.translate(0, 0, -thickness / 2)
  // Mitre BEFORE computing normals so the diagonal end-faces get correct normals
  // (their opposite winding is what lets backface culling render a seamless join).
  if (
    miter &&
    ((miter.startSlope !== undefined && miter.startAt !== undefined) ||
      (miter.endSlope !== undefined && miter.endAt !== undefined))
  ) {
    applyMiter(geo, miter)
  }
  geo.computeVertexNormals()
  if (innerFaceZSign !== undefined) groupInnerFace(geo, innerFaceZSign)
  return geo
}

/**
 * Reorder a (non-indexed) extruded wall body into two contiguous material
 * groups: group 0 = the inner CAP triangles (the room-facing thickness face,
 * whose face normal points along `innerZSign` on local Z), group 1 = everything
 * else (outer cap, top/bottom, ends, opening jambs). Lets the room editor paint
 * only the interior with the finish and keep the rest structural white.
 */
function groupInnerFace(geo: ExtrudeGeometry, innerZSign: number): void {
  const pos = geo.getAttribute('position')
  const triCount = Math.floor(pos.count / 3)
  const inner: number[] = []
  const other: number[] = []
  for (let t = 0; t < triCount; t++) {
    const i = t * 3
    const ax = pos.getX(i)
    const ay = pos.getY(i)
    const az = pos.getZ(i)
    const e1x = pos.getX(i + 1) - ax
    const e1y = pos.getY(i + 1) - ay
    const e1z = pos.getZ(i + 1) - az
    const e2x = pos.getX(i + 2) - ax
    const e2y = pos.getY(i + 2) - ay
    const e2z = pos.getZ(i + 2) - az
    const nz = e1x * e2y - e1y * e2x
    const nlen = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, nz) || 1
    // A cap face lies in a Z=const plane → its normal is (near) pure ±Z.
    const isInnerCap = Math.abs(nz) / nlen > 0.9 && Math.sign(nz) === innerZSign
    ;(isInnerCap ? inner : other).push(t)
  }
  const order = [...inner, ...other]
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = geo.getAttribute(name)
    if (!attr) continue
    const is = attr.itemSize
    const src = attr.array as ArrayLike<number>
    const out = new Float32Array(order.length * 3 * is)
    let o = 0
    for (const t of order) {
      const base = t * 3 * is
      for (let k = 0; k < 3 * is; k++) out[o++] = src[base + k]
    }
    geo.setAttribute(name, new BufferAttribute(out, is))
  }
  geo.clearGroups()
  geo.addGroup(0, inner.length * 3, 0) // interior room-facing → finish
  geo.addGroup(inner.length * 3, other.length * 3, 1) // top / outer / ends / jambs → white
}
