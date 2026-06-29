/**
 * Auto-naming a room's boundary walls `<room name> wall ##` (2-digit) when the
 * room is created/allocated (Room tool, Polygon, Auto room). A wall belongs to
 * the room when it lies along one of the room's boundary edges (collinear +
 * overlapping). Walls are numbered in boundary order, starting at 01.
 *
 * The caller decides whether to apply each assignment: a user-set name (with its
 * `nameAuto` flag cleared) takes absolute precedence and must never be
 * overwritten — only unset / auto-assigned names are replaced.
 *
 * Pure (no React/three) so it unit-tests in isolation.
 */
import { hash6 } from './planElementName'
import type { PlanOpening, PlanRoom, PlanVec2, PlanWall } from './types'

type Edge = [PlanVec2, PlanVec2]

const rectEdges = (ox: number, oz: number, w: number, d: number): Edge[] => [
  [
    [ox, oz],
    [ox + w, oz],
  ],
  [
    [ox + w, oz],
    [ox + w, oz + d],
  ],
  [
    [ox + w, oz + d],
    [ox, oz + d],
  ],
  [
    [ox, oz + d],
    [ox, oz],
  ],
]

/** The room's boundary edges, in order: the polygon when present, else the
 *  rectangle (plus the L-extension rectangle). */
export function roomBoundaryEdges(room: PlanRoom): Edge[] {
  if (room.polygon && room.polygon.length >= 2) {
    const p = room.polygon
    return p.map((v, i): Edge => [v, p[(i + 1) % p.length]])
  }
  const edges = rectEdges(room.origin[0], room.origin[1], room.width, room.depth)
  if (room.extension) {
    const e = room.extension
    edges.push(
      ...rectEdges(room.origin[0] + e.offset[0], room.origin[1] + e.offset[1], e.width, e.depth),
    )
  }
  return edges
}

/** Whether a wall lies along an edge: both endpoints near the edge's line, and
 *  their span overlaps the edge by at least half the shorter of the two. */
function wallOnEdge(wall: PlanWall, [a, b]: Edge, tol: number): boolean {
  const ex = b[0] - a[0]
  const ez = b[1] - a[1]
  const elen = Math.hypot(ex, ez)
  if (elen < 1e-6) return false
  const ux = ex / elen
  const uz = ez / elen
  const perp = (p: PlanVec2) => Math.abs((p[0] - a[0]) * -uz + (p[1] - a[1]) * ux)
  if (perp(wall.start) > tol || perp(wall.end) > tol) return false
  const proj = (p: PlanVec2) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uz
  let s = proj(wall.start)
  let e = proj(wall.end)
  if (s > e) [s, e] = [e, s]
  const wlen = e - s
  if (wlen < 1e-6) return false
  const overlap = Math.min(elen, e) - Math.max(0, s)
  return overlap >= 0.5 * Math.min(elen, wlen)
}

export interface RoomWallNameAssignment {
  id: string
  name: string
}

/**
 * Names for the walls bounding `room`, in boundary order: `<room name> wall 01`,
 * `02`, … Each wall is matched to at most one edge (first match wins). `tol` is
 * the collinearity tolerance in metres (walls can sit slightly off the room's
 * interior rectangle).
 */
export function assignRoomWallNames(
  walls: readonly PlanWall[],
  room: PlanRoom,
  tol = 0.25,
): RoomWallNameAssignment[] {
  const edges = roomBoundaryEdges(room)
  const used = new Set<string>()
  const out: RoomWallNameAssignment[] = []
  let n = 1
  for (const edge of edges) {
    for (const w of walls) {
      if (used.has(w.id)) continue
      if (wallOnEdge(w, edge, tol)) {
        used.add(w.id)
        out.push({ id: w.id, name: `${room.name} wall ${String(n).padStart(2, '0')}` })
        n++
      }
    }
  }
  return out
}

/** The first room whose boundary the wall lies along, or `null` when the wall
 *  is free-standing (belongs to no room yet). Used to room-prefix the name of a
 *  freshly-drawn wall/opening at creation time. */
export function roomForWall(
  rooms: readonly PlanRoom[],
  wall: PlanWall,
  tol = 0.25,
): PlanRoom | null {
  for (const room of rooms) {
    for (const edge of roomBoundaryEdges(room)) {
      if (wallOnEdge(wall, edge, tol)) return room
    }
  }
  return null
}

/** Auto-name for a newly-created wall: `<room name> wall <unique id>` when it
 *  lies on a room's boundary, else `undefined` (caller leaves it unnamed so the
 *  generic `defaultWallName` fallback applies). The id-hash keeps every name
 *  unique even when two walls share a room. */
export function newWallName(rooms: readonly PlanRoom[], wall: PlanWall): string | undefined {
  const room = roomForWall(rooms, wall)
  return room ? `${room.name} wall ${hash6(wall.id)}` : undefined
}

/** Auto-name for a newly-created door/window: `<room name> door|window <unique
 *  id>` based on the room its host wall belongs to, else `undefined`. */
export function newOpeningName(
  rooms: readonly PlanRoom[],
  walls: readonly PlanWall[],
  opening: PlanOpening,
): string | undefined {
  const host = walls.find((w) => w.id === opening.wallId)
  if (!host) return undefined
  const room = roomForWall(rooms, host)
  if (!room) return undefined
  const kind = opening.kind === 'door' ? 'door' : 'window'
  return `${room.name} ${kind} ${hash6(opening.id)}`
}

/**
 * Names for the doors + windows that sit on the room's boundary walls, in the
 * same boundary order as `assignRoomWallNames`: `<room name> door 01`, `02`, …
 * and `<room name> window 01`, … (doors + windows numbered independently). An
 * opening belongs to the room when its host wall lies along a room edge; on each
 * wall the openings are ordered by their offset along it. As with walls, the
 * caller only applies these over unset / auto-assigned names — a user-set name
 * always wins.
 */
export function assignRoomOpeningNames(
  walls: readonly PlanWall[],
  openings: readonly PlanOpening[],
  room: PlanRoom,
  tol = 0.25,
): RoomWallNameAssignment[] {
  const edges = roomBoundaryEdges(room)
  const usedWalls = new Set<string>()
  // Boundary walls in order (first edge match wins, mirroring the wall naming).
  const boundaryWallIds: string[] = []
  for (const edge of edges) {
    for (const w of walls) {
      if (usedWalls.has(w.id)) continue
      if (wallOnEdge(w, edge, tol)) {
        usedWalls.add(w.id)
        boundaryWallIds.push(w.id)
      }
    }
  }
  const out: RoomWallNameAssignment[] = []
  let doors = 1
  let windows = 1
  for (const wallId of boundaryWallIds) {
    const onWall = openings.filter((o) => o.wallId === wallId).sort((a, b) => a.offset - b.offset)
    for (const o of onWall) {
      if (o.kind === 'door') {
        out.push({ id: o.id, name: `${room.name} door ${String(doors).padStart(2, '0')}` })
        doors++
      } else {
        out.push({ id: o.id, name: `${room.name} window ${String(windows).padStart(2, '0')}` })
        windows++
      }
    }
  }
  return out
}
