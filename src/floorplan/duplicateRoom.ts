/**
 * Pure clone of a plan room (PARITY-PLAN-ROOM-DUP).
 *
 * Duplicating a room copies its polygon (offset slightly so the copy is visible),
 * its per-room floor/wall finishes, AND its *own* boundary walls + the openings
 * on them — so the copy is a self-contained room that never corrupts the walls
 * shared with neighbouring rooms (the editor models rooms + walls as independent
 * collinear geometry, so the copy gets fresh offset walls rather than re-pointing
 * the originals). All cloned elements get fresh, non-colliding ids and the room's
 * boundary walls/openings are re-named via `assignRoomWallNames` /
 * `assignRoomOpeningNames`.
 *
 * Pure (no React/three) — unit-tested in isolation.
 */
import { assignRoomOpeningNames, assignRoomWallNames } from './roomWallNames'
import type { PlanOpening, PlanRoom, PlanVec2, PlanWall } from './types'

/** Default cosmetic offset (m) applied to the duplicate's origin so it doesn't
 *  sit exactly on top of the source. */
export const DUPLICATE_ROOM_OFFSET = 0.5

/** Per-room finish picks that travel with a duplicated room. */
interface RoomFinishes {
  /** Floor material id keyed by room id (`finishes.floor`). */
  floor?: string
  /** Wall material id keyed by room id (`finishes.walls`). */
  wall?: string
  /** Wall-accent material ids keyed by source wall id (a subset of
   *  `finishes.wallAccents` whose key is `${wallId}:${sourceRoomId}`). */
  wallAccents?: Record<string, string>
}

export interface DuplicateRoomInput {
  room: PlanRoom
  /** All walls on the room's storey (the duplicate's boundary walls are picked
   *  from these by collinearity, then cloned). */
  walls: readonly PlanWall[]
  /** All openings on the room's storey (those on the boundary walls are cloned). */
  openings: readonly PlanOpening[]
  /** Source room's finishes, copied verbatim onto the clone. */
  finishes?: RoomFinishes
  /** Fresh-id generator (caller controls the id format). */
  genId: (prefix: string) => string
  /** Cosmetic origin offset (m). Defaults to `DUPLICATE_ROOM_OFFSET`. */
  offset?: number
}

export interface DuplicateRoomResult {
  /** The cloned room (fresh id, offset polygon/origin, copied finish fields). */
  room: PlanRoom
  /** Fresh boundary walls for the clone (offset, renamed, own ids). */
  walls: PlanWall[]
  /** Fresh openings on the cloned boundary walls (re-pointed + renamed). */
  openings: PlanOpening[]
  /** Source→clone finish picks re-keyed onto the clone's room id / wall ids. */
  finishes: {
    floor?: string
    wall?: string
    /** Keyed by `${newWallId}:${newRoomId}`. */
    wallAccents: Record<string, string>
  }
}

/** Offset a 2D point by `[dx, dz]`. */
function shift([x, z]: PlanVec2, dx: number, dz: number): PlanVec2 {
  return [x + dx, z + dz]
}

/** Translate a room's geometry by `[dx, dz]`. Origin shifts; the L-extension
 *  offset and (relative) shape stay attached; an explicit polygon shifts every
 *  vertex. */
function offsetRoom(room: PlanRoom, dx: number, dz: number, id: string): PlanRoom {
  const next: PlanRoom = {
    ...(JSON.parse(JSON.stringify(room)) as PlanRoom),
    id,
    name: `${room.name} copy`,
    origin: shift(room.origin, dx, dz),
  }
  if (room.polygon && room.polygon.length >= 3) {
    next.polygon = room.polygon.map((p) => shift(p, dx, dz))
  }
  return next
}

/**
 * Clone a room with its finishes + own boundary walls/openings, offset and
 * freshly named. Boundary walls are matched to the room by collinearity (the
 * same test `assignRoomWallNames` uses), so a room with no matching walls (e.g.
 * a room floating free of the wall network) simply duplicates the polygon +
 * finishes and returns no walls — never crashing.
 */
export function duplicateRoom(input: DuplicateRoomInput): DuplicateRoomResult {
  const { room, walls, openings, finishes, genId } = input
  const off = input.offset ?? DUPLICATE_ROOM_OFFSET
  const newRoomId = genId('r')
  const newRoom = offsetRoom(room, off, off, newRoomId)

  // Which existing walls bound the SOURCE room (collinear + overlapping). We
  // reuse assignRoomWallNames' matcher by asking it for the source room's wall
  // assignments and taking the matched ids in boundary order.
  const boundaryIds = assignRoomWallNames(walls, room).map((m) => m.id)
  const boundarySet = new Set(boundaryIds)

  // Clone each boundary wall, offset, with a fresh id. A user-set name is NOT
  // copied (the clone re-flows its own auto names below); locks are dropped so
  // the copy is editable, matching duplicateWall/duplicateOpening.
  const wallIdMap: Record<string, string> = {}
  const newWalls: PlanWall[] = boundaryIds.map((wid) => {
    const src = walls.find((w) => w.id === wid) as PlanWall
    const newId = genId('w')
    wallIdMap[wid] = newId
    const { name: _n, nameAuto: _na, locked: _l, ...rest } = src
    return {
      ...(JSON.parse(JSON.stringify(rest)) as Omit<PlanWall, 'id'>),
      id: newId,
      start: shift(src.start, off, off),
      end: shift(src.end, off, off),
    }
  })

  // Clone openings that sit on the cloned boundary walls (re-point wallId).
  const newOpenings: PlanOpening[] = openings
    .filter((o) => boundarySet.has(o.wallId))
    .map((o) => {
      const { name: _n, nameAuto: _na, locked: _l, ...rest } = o
      return {
        ...(JSON.parse(JSON.stringify(rest)) as Omit<PlanOpening, 'id' | 'wallId'>),
        id: genId(o.kind === 'door' ? 'door' : 'win'),
        wallId: wallIdMap[o.wallId],
      }
    })

  // Re-flow auto names for the clone's boundary walls + openings, keyed to the
  // copy's name so they never collide with the source's names.
  const wallNames = new Map(assignRoomWallNames(newWalls, newRoom).map((m) => [m.id, m.name]))
  for (const w of newWalls) {
    const name = wallNames.get(w.id)
    if (name) {
      w.name = name
      w.nameAuto = true
    }
  }
  const openNames = new Map(
    assignRoomOpeningNames(newWalls, newOpenings, newRoom).map((m) => [m.id, m.name]),
  )
  for (const o of newOpenings) {
    const name = openNames.get(o.id)
    if (name) {
      o.name = name
      o.nameAuto = true
    }
  }

  // Re-key the source wall-accent finishes onto the cloned walls + room.
  const wallAccents: Record<string, string> = {}
  if (finishes?.wallAccents) {
    for (const [srcWallId, mat] of Object.entries(finishes.wallAccents)) {
      const newWallId = wallIdMap[srcWallId]
      if (newWallId) wallAccents[`${newWallId}:${newRoomId}`] = mat
    }
  }

  return {
    room: newRoom,
    walls: newWalls,
    openings: newOpenings,
    finishes: {
      floor: finishes?.floor,
      wall: finishes?.wall,
      wallAccents,
    },
  }
}
