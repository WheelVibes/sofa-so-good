import { DOORS, ROOMS, WALLS, WINDOWS } from './constants'
import { roomBounds, roomContains, roomParts } from './roomGeometry'
import type { DoorSpec, RoomDef, RoomId, WallSpec, WindowSpec } from './types'
import type { WallCutoutSpan } from './walls/wallBodyShape'

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** A wall segment trimmed to the span that bounds the room. Shared long walls
 *  (e.g. the full north wall over all three bedrooms) are clipped so only the
 *  portion adjacent to the isolated room renders. */
export interface ClippedWall {
  /** Source wall id (multiple clips can share an id — keyed separately). */
  wallId: string
  start: [number, number]
  end: [number, number]
  spec: WallSpec
}

// Interior rect edges sit inside the wall centerlines by half the wall
// thickness (external 0.2 → 0.1; internal 0.1 → 0.05). The collinearity
// tolerance must bridge that gap to match a room edge to its wall, while
// staying well under the smallest room dimension so it never grabs the
// opposite parallel wall. 0.16 covers half an external wall plus margin.
const EDGE_EPS = 0.16 // wall-on-edge collinearity (spans wall half-thickness)
const POINT_EPS = 0.06 // point-in-room containment tolerance

/** The room's footprint as rects — re-exported from the shared reader so the
 *  room editor and the floor renderer can never resolve a room's shape
 *  differently. @see roomGeometry.ts */
export function roomRects(room: RoomDef): Rect[] {
  return roomParts(room)
}

/** For an axis-aligned wall on a rect edge, the sub-segment overlapping that
 *  rect's extent along the wall axis. Returns null when the wall isn't on any
 *  edge of the rects, or the overlap is degenerate. A wall on a SHARED edge
 *  (long span over several rooms) is clipped to the room's footprint here. */
function clipWallToRects(
  wall: WallSpec,
  rects: Rect[],
): { start: [number, number]; end: [number, number] } | null {
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const horizontal = Math.abs(sz - ez) < EDGE_EPS
  const vertical = Math.abs(sx - ex) < EDGE_EPS
  if (!horizontal && !vertical) return null

  let best: { start: [number, number]; end: [number, number]; len: number } | null = null
  for (const r of rects) {
    if (horizontal) {
      const onEdge = Math.abs(sz - r.z0) < EDGE_EPS || Math.abs(sz - r.z1) < EDGE_EPS
      if (!onEdge) continue
      const lo = Math.max(Math.min(sx, ex), r.x0)
      const hi = Math.min(Math.max(sx, ex), r.x1)
      const len = hi - lo
      if (len > EDGE_EPS && (!best || len > best.len)) {
        best = { start: [lo, sz], end: [hi, sz], len }
      }
    }
    if (vertical) {
      const onEdge = Math.abs(sx - r.x0) < EDGE_EPS || Math.abs(sx - r.x1) < EDGE_EPS
      if (!onEdge) continue
      const lo = Math.max(Math.min(sz, ez), r.z0)
      const hi = Math.min(Math.max(sz, ez), r.z1)
      const len = hi - lo
      if (len > EDGE_EPS && (!best || len > best.len)) {
        best = { start: [sx, lo], end: [sx, hi], len }
      }
    }
  }
  return best ? { start: best.start, end: best.end } : null
}

/**
 * A clipped wall's door/window cutouts, projected into the CLIP's centred
 * along-axis frame (metres) so the per-room-editor wall body can carve the same
 * holes the orbit scene does. The source cutouts are offsets along the FULL
 * wall, so each is mapped to a world point and re-projected onto the clipped
 * span's axis (which may run the opposite direction and start partway along the
 * wall). Openings outside the clip project beyond `±clipLen/2` and are dropped
 * later by {@link wallBodyOutlineFromSpans}'s clamp. Pure.
 */
export function clippedWallCutouts(wall: ClippedWall): WallCutoutSpan[] {
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const clipLen = Math.hypot(ex - sx, ez - sz)
  if (clipLen < 1e-6 || wall.spec.cutouts.length === 0) return []
  const vx = (ex - sx) / clipLen
  const vz = (ez - sz) / clipLen
  const mx = (sx + ex) / 2
  const mz = (sz + ez) / 2
  const [w0x, w0z] = wall.spec.start
  const fullLen = Math.hypot(wall.spec.end[0] - w0x, wall.spec.end[1] - w0z) || 1
  const ux = (wall.spec.end[0] - w0x) / fullLen
  const uz = (wall.spec.end[1] - w0z) / fullLen
  // Along-axis coordinate (in the clip's centred frame) of a point `dist` metres
  // from the full wall's start.
  const project = (dist: number) => (w0x + ux * dist - mx) * vx + (w0z + uz * dist - mz) * vz
  return wall.spec.cutouts.map((c) => {
    const p0 = project(c.offset)
    const p1 = project(c.offset + c.width)
    return { a: Math.min(p0, p1), b: Math.max(p0, p1), bottom: c.sill, top: c.head }
  })
}

/** World [x, z] center of an opening (window/door) along its parent wall. */
function openingCenter(spec: WindowSpec | DoorSpec, wall: WallSpec): [number, number] | null {
  const wdx = wall.end[0] - wall.start[0]
  const wdz = wall.end[1] - wall.start[1]
  const len = Math.hypot(wdx, wdz)
  if (len < 1e-6) return null
  const ux = wdx / len
  const uz = wdz / len
  const at = spec.offset + spec.width / 2
  return [wall.start[0] + ux * at, wall.start[1] + uz * at]
}

/** True when point p lies within the clipped span [a,b] (inclusive, tol). */
function pointOnSpan(p: [number, number], a: [number, number], b: [number, number]): boolean {
  const minX = Math.min(a[0], b[0]) - POINT_EPS
  const maxX = Math.max(a[0], b[0]) + POINT_EPS
  const minZ = Math.min(a[1], b[1]) - POINT_EPS
  const maxZ = Math.max(a[1], b[1]) + POINT_EPS
  return p[0] >= minX && p[0] <= maxX && p[1] >= minZ && p[1] <= maxZ
}

export interface RoomShell {
  roomId: RoomId
  rects: Rect[]
  /** Wall segments clipped to the room footprint (shared walls trimmed). */
  walls: ClippedWall[]
  windowIds: string[]
  doorIds: string[]
  /** Center of the bounding box over all rects, as [x, z]. */
  center: [number, number]
  /** Half-diagonal of the bounding box (camera framing radius). */
  radius: number
  /** Whether an [x, z] point lies inside the room (with tolerance). */
  contains: (x: number, z: number) => boolean
}

export function roomShell(roomId: RoomId): RoomShell {
  const room = ROOMS[roomId]
  const rects = roomParts(room)

  const walls: ClippedWall[] = []
  for (const w of WALLS) {
    const clip = clipWallToRects(w, rects)
    if (clip) walls.push({ wallId: w.id, start: clip.start, end: clip.end, spec: w })
  }

  // An opening belongs to the room when its parent wall is a room wall AND its
  // world position lies within that wall's clipped span — so a shared wall's
  // far-room windows/doors are excluded.
  const wallById = new Map(walls.map((cw) => [cw.wallId, cw]))
  const windowIds: string[] = []
  for (const win of WINDOWS) {
    const cw = wallById.get(win.wallId)
    if (!cw) continue
    const c = openingCenter(win, cw.spec)
    if (c && pointOnSpan(c, cw.start, cw.end)) windowIds.push(win.id)
  }
  const doorIds: string[] = []
  for (const d of DOORS) {
    const cw = wallById.get(d.wallId)
    if (!cw) continue
    const c = openingCenter(d, cw.spec)
    if (c && pointOnSpan(c, cw.start, cw.end)) doorIds.push(d.id)
  }

  const { x0, z0, x1, z1 } = roomBounds(room)
  const center: [number, number] = [(x0 + x1) / 2, (z0 + z1) / 2]
  const radius = Math.hypot(x1 - x0, z1 - z0) / 2

  return {
    roomId,
    rects,
    walls,
    windowIds,
    doorIds,
    center,
    radius,
    contains: (x, z) => roomContains(room, x, z, POINT_EPS),
  }
}
