/**
 * The ONE reader for a curated-flat room's shape.
 *
 * `RoomDef` (apartment/constants.ts) lets a room be a rectangle, a union of ANY
 * NUMBER of rectangles (`extensions`), or an explicit free-form `polygon`. Every
 * consumer that draws or measures a room — floor meshes, ceiling tiles, the
 * room-editor shell, wall-side probes, point-in-room tests, area accounting,
 * `buildDefaultPlan` — must resolve the shape through the helpers here rather
 * than reading `origin`/`width`/`depth`/`extensions` itself. That is what keeps
 * a room's rendered footprint, its highlighted footprint and its reported area
 * the same shape: the historical split (floor renderer resolving one shape, the
 * plan another) is exactly how living/dining came to overlap the corridor.
 *
 * Pure — no three/React imports, so it stays unit-testable.
 */
import { decomposeRectilinear, isRectilinear } from '../floorplan/rectilinear'
import { type PlanVec2, pointInPolygon, polygonArea, rectUnionOutline } from '../floorplan/types'
import type { RoomDef, Vec2 } from './types'

/** `Vec2` is readonly, the plan helpers take mutable `PlanVec2` — copy across
 *  the boundary rather than casting away the room data's immutability. */
function mutable(pts: readonly Vec2[]): PlanVec2[] {
  return pts.map(([x, z]) => [x, z])
}

/** An axis-aligned piece of a room, in absolute world metres. */
export interface RoomRect {
  x0: number
  z0: number
  x1: number
  z1: number
}

function rectsFromParts(room: RoomDef): RoomRect[] {
  const [ox, oz] = room.origin
  const rects: RoomRect[] = [{ x0: ox, z0: oz, x1: ox + room.width, z1: oz + room.depth }]
  for (const e of room.extensions ?? []) {
    const ex = ox + e.offset[0]
    const ez = oz + e.offset[1]
    rects.push({ x0: ex, z0: ez, x1: ex + e.width, z1: ez + e.depth })
  }
  return rects
}

/**
 * The room's footprint as non-overlapping axis-aligned rects — what every
 * rect-based renderer (floor planes, ceiling tiles, wall-edge clipping) draws.
 *
 * A rect/`extensions` room returns its declared parts verbatim. An explicit
 * rectilinear `polygon` is decomposed back into rects. A NON-rectilinear polygon
 * has no exact rect cover, so it returns its bounding box — those rooms must be
 * rendered from {@link roomOutline} instead (see `Floor.tsx`), and callers that
 * can only handle rects degrade to the bbox rather than dropping the room.
 */
const partsCache = new WeakMap<RoomDef, RoomRect[]>()

export function roomParts(room: RoomDef): RoomRect[] {
  // `ROOMS` is static module data and this runs inside render loops (floor,
  // ceiling, wall probes), so resolving a polygon room's decomposition once per
  // definition is worth a WeakMap. Copies out — callers mutate their own rects.
  const cached = partsCache.get(room)
  if (cached) return cached.map((r) => ({ ...r }))
  const poly = room.polygon
  // A rectilinear outline decomposes exactly; a diagonal one has no rect cover,
  // so rect-only callers get the bbox (and `needsTriangulatedFloor` warns them).
  const parts =
    poly && poly.length >= 3
      ? isRectilinear(mutable(poly))
        ? decomposeRectilinear(mutable(poly))
        : [roomBounds(room)]
      : rectsFromParts(room)
  partsCache.set(room, parts)
  return parts.map((r) => ({ ...r }))
}

/** True when the room can only be drawn as a triangulated shape (it declares a
 *  polygon with at least one diagonal edge). */
export function needsTriangulatedFloor(room: RoomDef): boolean {
  return !!room.polygon && room.polygon.length >= 3 && !isRectilinear(mutable(room.polygon))
}

/** The room's outline as an absolute-metre polygon: the explicit `polygon` when
 *  set, else the rectilinear union of its parts. The single shape used for the
 *  floor outline, the hover highlight, area and perimeter. */
export function roomOutline(room: RoomDef): Vec2[] {
  if (room.polygon && room.polygon.length >= 3) return room.polygon.map((p) => [p[0], p[1]])
  const parts = rectsFromParts(room)
  if (parts.length === 1) {
    const r = parts[0]
    return [
      [r.x0, r.z0],
      [r.x1, r.z0],
      [r.x1, r.z1],
      [r.x0, r.z1],
    ]
  }
  return rectUnionOutline(parts.map((r) => [r.x0, r.z0, r.x1, r.z1]))
}

/** Bounding box over the room's whole footprint (all parts / the polygon) —
 *  camera framing, occluders, label placement. */
export function roomBounds(room: RoomDef): RoomRect {
  const pts = room.polygon?.length ? room.polygon : null
  const xs: number[] = []
  const zs: number[] = []
  if (pts) {
    for (const [x, z] of pts) {
      xs.push(x)
      zs.push(z)
    }
  } else {
    for (const r of rectsFromParts(room)) {
      xs.push(r.x0, r.x1)
      zs.push(r.z0, r.z1)
    }
  }
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }
}

/** Whether a world point lies inside the room, with an optional tolerance (for
 *  a probe just inside a wall, or an item placed flush against one). */
export function roomContains(room: RoomDef, x: number, z: number, tol = 0): boolean {
  if (room.polygon && room.polygon.length >= 3) {
    if (pointInPolygon(x, z, mutable(room.polygon))) return true
    if (tol <= 0) return false
    // Tolerance for a polygon: inside if any padded decomposed part holds it.
    return roomParts(room).some(
      (r) => x >= r.x0 - tol && x <= r.x1 + tol && z >= r.z0 - tol && z <= r.z1 + tol,
    )
  }
  return rectsFromParts(room).some(
    (r) => x >= r.x0 - tol && x <= r.x1 + tol && z >= r.z0 - tol && z <= r.z1 + tol,
  )
}

/** Interior floor area (m²) — the shoelace over {@link roomOutline}, so parts
 *  that touch or overlap are counted ONCE (a naive part-area sum double-counts).
 *  Invariant: `roomFloorArea(r) === polygonArea(roomOutline(r))`. */
export function roomFloorArea(room: RoomDef): number {
  return polygonArea(mutable(roomOutline(room)))
}

/** Centre of the room's bounding box. */
export function roomCenter(room: RoomDef): Vec2 {
  const b = roomBounds(room)
  return [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]
}
