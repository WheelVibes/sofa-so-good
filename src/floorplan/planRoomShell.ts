import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from './types'
import { pointInRoom, wallLength } from './types'

/** Axis-aligned interior rect covering (part of) a room. */
export interface PlanRect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** A plan wall trimmed to the span bounding the room (shared long walls clipped
 *  to just the portion adjacent to the isolated room). */
export interface PlanClippedWall {
  wallId: string
  start: [number, number]
  end: [number, number]
  thickness: PlanWall['thickness']
  topHeight?: number
}

/** An opening attributed to a room, with its world placement resolved (so a
 *  renderer needs no access to the source walls). `angle` is the host wall's
 *  direction `atan2(dx, dz)`. */
export interface PlanRoomOpening {
  opening: PlanOpening
  center: [number, number]
  angle: number
}

/** Plan-based analogue of `apartment/roomShell`'s `RoomShell`, derived from the
 *  editable floor plan (custom apartments) rather than the built-in constants.
 *  Renderer-agnostic so a plan-aware per-room editor scene can consume it. */
export interface PlanRoomShell {
  roomId: string
  room: PlanRoom
  /** Bounding rects (main + optional L-extension) — used for camera framing and
   *  rectangular floors. A polygon room exposes its bbox here. */
  rects: PlanRect[]
  /** The room's own (clipped) walls. */
  walls: PlanClippedWall[]
  /** Openings (doors/windows) attributed to this room's walls, placed. */
  openings: PlanRoomOpening[]
  center: [number, number]
  radius: number
  contains: (x: number, z: number) => boolean
}

// Edge collinearity tolerance: spans half an external wall thickness (~0.1) plus
// margin, while staying under the smallest sensible room dimension.
const EDGE_EPS = 0.18
const POINT_EPS = 0.06

/** Bounding rects for a room: the main rect + an optional L-extension. For a
 *  polygon room, the polygon's bounding box (used only for framing/clip extent;
 *  containment still uses the true polygon via `pointInRoom`). */
export function planRoomRects(room: PlanRoom): PlanRect[] {
  if (room.polygon && room.polygon.length >= 3) {
    const xs = room.polygon.map((p) => p[0])
    const zs = room.polygon.map((p) => p[1])
    return [{ x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }]
  }
  const rects: PlanRect[] = [
    {
      x0: room.origin[0],
      z0: room.origin[1],
      x1: room.origin[0] + room.width,
      z1: room.origin[1] + room.depth,
    },
  ]
  if (room.extension) {
    const ox = room.origin[0] + room.extension.offset[0]
    const oz = room.origin[1] + room.extension.offset[1]
    rects.push({ x0: ox, z0: oz, x1: ox + room.extension.width, z1: oz + room.extension.depth })
  }
  return rects
}

/** Clip an axis-aligned wall to the sub-segment overlapping a room rect edge.
 *  Returns null for non-axis-aligned walls or no overlap. Picks the longest
 *  overlap across the room's rects (handles shared long walls). */
function clipWallToRects(
  wall: PlanWall,
  rects: PlanRect[],
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
      if (len > EDGE_EPS && (!best || len > best.len))
        best = { start: [lo, sz], end: [hi, sz], len }
    } else {
      const onEdge = Math.abs(sx - r.x0) < EDGE_EPS || Math.abs(sx - r.x1) < EDGE_EPS
      if (!onEdge) continue
      const lo = Math.max(Math.min(sz, ez), r.z0)
      const hi = Math.min(Math.max(sz, ez), r.z1)
      const len = hi - lo
      if (len > EDGE_EPS && (!best || len > best.len))
        best = { start: [sx, lo], end: [sx, hi], len }
    }
  }
  return best ? { start: best.start, end: best.end } : null
}

/** World [x,z] centre of an opening along its parent wall. */
function openingCenter(op: PlanOpening, wall: PlanWall): [number, number] | null {
  const len = wallLength(wall)
  if (len < 1e-6) return null
  const ux = (wall.end[0] - wall.start[0]) / len
  const uz = (wall.end[1] - wall.start[1]) / len
  const at = op.offset + op.width / 2
  return [wall.start[0] + ux * at, wall.start[1] + uz * at]
}

function pointOnSpan(p: [number, number], a: [number, number], b: [number, number]): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) - POINT_EPS &&
    p[0] <= Math.max(a[0], b[0]) + POINT_EPS &&
    p[1] >= Math.min(a[1], b[1]) - POINT_EPS &&
    p[1] <= Math.max(a[1], b[1]) + POINT_EPS
  )
}

/**
 * Build a per-room shell from an editable floor plan: the room's footprint
 * rects, its walls clipped to that footprint (shared walls trimmed), and the
 * doors/windows attributed to those walls. Returns null when the room id isn't
 * in the plan. Pure — no rendering.
 */
export function planRoomShell(plan: FloorPlan, roomId: string): PlanRoomShell | null {
  const room = plan.rooms.find((r) => r.id === roomId)
  if (!room) return null
  const rects = planRoomRects(room)

  const walls: PlanClippedWall[] = []
  for (const w of plan.walls) {
    if (wallLength(w) < 1e-4) continue
    const clip = clipWallToRects(w, rects)
    if (clip) {
      walls.push({
        wallId: w.id,
        start: clip.start,
        end: clip.end,
        thickness: w.thickness,
        topHeight: w.topHeight,
      })
    }
  }

  const wallById = new Map(plan.walls.map((w) => [w.id, w]))
  const clippedById = new Map(walls.map((cw) => [cw.wallId, cw]))
  const openings: PlanRoomOpening[] = []
  for (const op of plan.openings) {
    const cw = clippedById.get(op.wallId)
    const src = wallById.get(op.wallId)
    if (!cw || !src) continue
    const c = openingCenter(op, src)
    if (c && pointOnSpan(c, cw.start, cw.end)) {
      const len = wallLength(src)
      const angle = Math.atan2((src.end[0] - src.start[0]) / len, (src.end[1] - src.start[1]) / len)
      openings.push({ opening: op, center: c, angle })
    }
  }

  const x0 = Math.min(...rects.map((r) => r.x0))
  const z0 = Math.min(...rects.map((r) => r.z0))
  const x1 = Math.max(...rects.map((r) => r.x1))
  const z1 = Math.max(...rects.map((r) => r.z1))
  const center: [number, number] = [(x0 + x1) / 2, (z0 + z1) / 2]
  const radius = Math.hypot(x1 - x0, z1 - z0) / 2

  return {
    roomId,
    room,
    rects,
    walls,
    openings,
    center,
    radius,
    contains: (x, z) => pointInRoom(room, x, z),
  }
}
