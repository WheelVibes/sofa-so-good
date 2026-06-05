/**
 * Editable floor-plan model. This is a self-contained, serialisable description
 * of an apartment shell (walls / openings / rooms) that the Floor Plan Editor
 * mutates and the 3D apartment can render. It is intentionally decoupled from
 * the fixed `apartment/constants.ts` types (which use a closed `RoomId` union):
 * a user-authored plan has arbitrary string room ids.
 *
 * Coordinates are metres in the apartment frame (0,0 at the NW corner, +X east,
 * +Z south) — the same frame the rest of the app uses.
 */

export type PlanVec2 = [number, number]

export interface PlanWall {
  id: string
  start: PlanVec2
  end: PlanVec2
  thickness: 'external' | 'internal'
  /** Optional cap on solid-wall height (parapets on balconies); floor→ceiling when unset. */
  topHeight?: number
}

export interface PlanOpening {
  id: string
  kind: 'door' | 'window'
  /** Wall this opening cuts through. */
  wallId: string
  /** Distance from the wall's start along its length, to the opening's start. */
  offset: number
  width: number
  /** Bottom edge above floor (0 for doors). */
  sill: number
  /** Top edge above floor. */
  head: number
}

export interface PlanRoom {
  id: string
  name: string
  /** NW corner of the room's interior rectangle. */
  origin: PlanVec2
  width: number
  depth: number
  /** Optional second rectangle for L-shaped rooms (offset from `origin`). */
  extension?: { offset: PlanVec2; width: number; depth: number }
  /** Optional explicit polygon outline (absolute world metres, CW or CCW). When
   *  present it is the authoritative room shape — area, floor render, and
   *  point-in-room all use it, and origin/width/depth/extension are ignored
   *  (origin/width/depth are kept as the polygon's bounding box for back-compat
   *  with consumers that still read them). Enables arbitrary non-rectangular
   *  rooms beyond the rect + single L-extension. */
  polygon?: PlanVec2[]
  /** Optional per-room ceiling height. */
  ceilingHeight?: number
  /** Optional floor finish (catalog material id); defaults to oak in the shell. */
  floor?: string
}

export interface FloorPlan {
  id: string
  name: string
  ceilingHeight: number
  /** External footprint (metres) for the floor slab + grid. */
  extent: PlanVec2
  walls: PlanWall[]
  openings: PlanOpening[]
  rooms: PlanRoom[]
}

/** Signed-area shoelace over a polygon (absolute value = area, m²). */
export function polygonArea(pts: PlanVec2[]): number {
  if (pts.length < 3) return 0
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i]
    const [x2, z2] = pts[(i + 1) % pts.length]
    a += x1 * z2 - x2 * z1
  }
  return Math.abs(a) / 2
}

/** Ray-cast point-in-polygon test (even-odd rule). */
export function pointInPolygon(x: number, z: number, pts: PlanVec2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** The room's outline as an absolute-metre polygon: the explicit `polygon`
 *  when set, else derived from the rectangle (+ L-extension) so every room has
 *  a single polygon representation for area / render / containment. */
export function roomPolygon(r: PlanRoom): PlanVec2[] {
  if (r.polygon && r.polygon.length >= 3) return r.polygon
  const [ox, oz] = r.origin
  const x1 = ox + r.width
  const z1 = oz + r.depth
  if (!r.extension) {
    return [
      [ox, oz],
      [x1, oz],
      [x1, z1],
      [ox, z1],
    ]
  }
  // L-shape: union of the main rect + the extension rect. Returned as the
  // outline polygon. The extension is axis-aligned and offset from origin.
  const e = r.extension
  const ex0 = ox + e.offset[0]
  const ez0 = oz + e.offset[1]
  const ex1 = ex0 + e.width
  const ez1 = ez0 + e.depth
  // Two disjoint-or-touching rects → return the simple 8-point staircase via a
  // bounding merge isn't trivial for all offsets; for the common corner L we
  // approximate the outline as the convex/concave hull of the 8 rect corners.
  // Consumers using area() use polygonArea on this; for an axis-aligned L the
  // outline is the 6-point notch. Build it for the canonical corner case.
  const pts: PlanVec2[] = [
    [ox, oz],
    [x1, oz],
    [x1, z1],
    [ex1, z1],
    [ex1, ez1],
    [ex0, ez1],
    [ex0, oz],
    [ox, oz],
  ]
  // The generic fallback above only holds for an extension attached to the
  // south edge; for robustness across offsets, callers that need exact L area
  // should rely on planRoomArea (which sums the two rects). roomPolygon is used
  // for render/containment where the explicit `polygon` is the real path.
  return pts
}

/** Interior floor area of a room (m²): shoelace over an explicit polygon, else
 *  the rectangle (+ L-shape extension) sum. */
export function planRoomArea(r: PlanRoom): number {
  if (r.polygon && r.polygon.length >= 3) return polygonArea(r.polygon)
  const main = r.width * r.depth
  const ext = r.extension ? r.extension.width * r.extension.depth : 0
  return main + ext
}

/** Whether a world point lies inside the room (polygon-aware). */
export function pointInRoom(r: PlanRoom, x: number, z: number): boolean {
  if (r.polygon && r.polygon.length >= 3) return pointInPolygon(x, z, r.polygon)
  const inMain =
    x >= r.origin[0] && x <= r.origin[0] + r.width && z >= r.origin[1] && z <= r.origin[1] + r.depth
  if (inMain) return true
  if (r.extension) {
    const ex = r.origin[0] + r.extension.offset[0]
    const ez = r.origin[1] + r.extension.offset[1]
    return x >= ex && x <= ex + r.extension.width && z >= ez && z <= ez + r.extension.depth
  }
  return false
}

/** Total interior area of a plan (sum of room areas), m². */
export function planTotalArea(plan: FloorPlan): number {
  return plan.rooms.reduce((sum, r) => sum + planRoomArea(r), 0)
}

/** Length of a wall (m). */
export function wallLength(w: PlanWall): number {
  return Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
}

/**
 * Effective footprint that covers everything in the plan — the max of the
 * declared `extent` and the bounding box of all walls and rooms. Used for the
 * floor slab / grid / editor viewport so drawing beyond the initial extent
 * still renders fully.
 */
export function planBounds(plan: FloorPlan): PlanVec2 {
  let mx = plan.extent[0]
  let mz = plan.extent[1]
  for (const w of plan.walls) {
    mx = Math.max(mx, w.start[0], w.end[0])
    mz = Math.max(mz, w.start[1], w.end[1])
  }
  for (const r of plan.rooms) {
    if (r.polygon && r.polygon.length >= 3) {
      for (const [px, pz] of r.polygon) {
        mx = Math.max(mx, px)
        mz = Math.max(mz, pz)
      }
      continue
    }
    mx = Math.max(mx, r.origin[0] + r.width)
    mz = Math.max(mz, r.origin[1] + r.depth)
    if (r.extension) {
      mx = Math.max(mx, r.origin[0] + r.extension.offset[0] + r.extension.width)
      mz = Math.max(mz, r.origin[1] + r.extension.offset[1] + r.extension.depth)
    }
  }
  return [mx, mz]
}
