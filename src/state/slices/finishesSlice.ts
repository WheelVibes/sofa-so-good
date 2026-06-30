import { ROOMS } from '../../apartment/constants'
import type { RoomId } from '../../apartment/types'
import { allPlanRooms, levelOfRoom, withLevelGeometry } from '../../floorplan/levels'
import type { FloorPlan } from '../../floorplan/types'
import {
  DEFAULT_FLOOR,
  DEFAULT_ROOM_FLOOR,
  DEFAULT_ROOM_WALL,
  DEFAULT_WALL,
} from '../../materials/builtinCatalog'
import type { MaterialId } from '../../materials/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Per-room finish picks — separate maps for floor and wall surfaces.
 *  AC ledge is external and not finishable; entries are seeded for
 *  every interior room so picker UIs never have to deal with absent
 *  keys. */
/** Write a floor/wall finish through to the active plan's room entry, so plan
 *  data (template saves, the plan library, the 2D inspector) stays in sync with
 *  the live finishes slice. Returns the same plan object when nothing changes,
 *  so plan-keyed memos don't rebuild on a no-op. */
function planWithRoomFinish(
  plan: FloorPlan,
  roomId: string,
  surface: 'floor' | 'wall' | 'ceiling',
  id: MaterialId | undefined,
): FloorPlan {
  // The room can live on any storey (F13) — resolve its level first so an
  // upper-level room's finish writes through too, not just ground rooms.
  // The ceiling finish lives on `ceilingFinish` (the `ceiling` field is the
  // tray/coffered *config*), so map the surface to the right plan field.
  const field = surface === 'ceiling' ? 'ceilingFinish' : surface
  const level = levelOfRoom(plan, roomId)
  const room = level?.rooms.find((r) => r.id === roomId)
  if (!level || !room || room[field] === id) return plan
  return withLevelGeometry(plan, level.id, (g) => ({
    rooms: g.rooms.map((r) => (r.id === roomId ? { ...r, [field]: id } : r)),
  }))
}

/** Drop finish entries for room ids that belong to neither the fixed flat nor
 *  the given plan — hygiene when a different plan is activated, so a stale
 *  custom-room key from the previous plan can't shadow the new plan's own
 *  per-room finishes. Returns the same maps object when nothing was pruned. */
export function pruneFinishesForPlan(
  finishes: FinishesSlice['finishes'],
  plan: FloorPlan,
): FinishesSlice['finishes'] {
  const valid = new Set<string>([...Object.keys(ROOMS), ...allPlanRooms(plan).map((r) => r.id)])
  const stale = (k: string) => !valid.has(k)
  const floorStale = Object.keys(finishes.floor).some(stale)
  const wallStale = Object.keys(finishes.walls).some(stale)
  const ceilStale = Object.keys(finishes.ceiling).some(stale)
  if (!floorStale && !wallStale && !ceilStale) return finishes
  const keep = <V>(rec: Record<string, V>): Record<string, V> =>
    Object.fromEntries(Object.entries(rec).filter(([k]) => valid.has(k)))
  return {
    ...finishes,
    floor: keep(finishes.floor) as Record<RoomId, MaterialId>,
    walls: keep(finishes.walls) as Record<RoomId, MaterialId>,
    ceiling: keep(finishes.ceiling) as Record<RoomId, MaterialId>,
  }
}

export interface FinishesSlice {
  finishes: {
    floor: Record<RoomId, MaterialId>
    walls: Record<RoomId, MaterialId>
    /** Per-room ceiling finish — absent key → the default plain white ceiling. */
    ceiling: Record<RoomId, MaterialId>
    /** Accent-wall overrides keyed `${wallId}:${roomId}` — paints one wall
     *  face (the side facing that room) differently from the room default. */
    wallAccents: Record<string, MaterialId>
  }
  setFloorFinish: (room: RoomId, id: MaterialId) => void
  setWallFinish: (room: RoomId, id: MaterialId) => void
  /** Remove a room's wall finish (back to the neutral plaster shell). */
  clearWallFinish: (room: RoomId) => void
  /** Paint/texture a room's ceiling, or clear back to the default white. */
  setCeilingFinish: (room: RoomId, id: MaterialId) => void
  clearCeilingFinish: (room: RoomId) => void
  /** Apply one floor/wall/ceiling finish to every interior (non-external) room at once. */
  setAllFloorFinish: (id: MaterialId) => void
  setAllWallFinish: (id: MaterialId) => void
  setAllCeilingFinish: (id: MaterialId) => void
  /** Apply a whole-home floor + wall finish in ONE undo step (one-tap style
   *  transfer). Like setAllFloorFinish + setAllWallFinish but a single history
   *  entry, since it's one logical action. */
  applyHomeStyle: (floorId: MaterialId, wallId: MaterialId) => void
  setWallAccent: (key: string, id: MaterialId) => void
  clearWallAccent: (key: string) => void
}

function initialMap(
  fallback: MaterialId,
  overrides: Partial<Record<RoomId, MaterialId>>,
): Record<RoomId, MaterialId> {
  const out = {} as Record<RoomId, MaterialId>
  for (const id of Object.keys(ROOMS) as RoomId[]) out[id] = overrides[id] ?? fallback
  return out
}

export const FINISHES_INITIAL: Pick<FinishesSlice, 'finishes'> = {
  finishes: {
    floor: initialMap(DEFAULT_FLOOR, DEFAULT_ROOM_FLOOR),
    walls: initialMap(DEFAULT_WALL, DEFAULT_ROOM_WALL),
    // No seed: an absent key means the plain white ceiling (the prior default).
    ceiling: {} as Record<RoomId, MaterialId>,
    wallAccents: {},
  },
}

export const createFinishesSlice: SliceCreator<FinishesSlice, RootState> = (set, get) => ({
  ...FINISHES_INITIAL,
  setFloorFinish: (room, id) => {
    get().pushHistory()
    set((s) => ({
      finishes: {
        ...s.finishes,
        floor: { ...s.finishes.floor, [room]: id },
      },
      // Keep the active plan's room entry in sync (see planWithRoomFinish).
      floorPlan: planWithRoomFinish(s.floorPlan, room, 'floor', id),
    }))
  },
  setWallFinish: (room, id) => {
    get().pushHistory()
    set((s) => ({
      finishes: {
        ...s.finishes,
        walls: { ...s.finishes.walls, [room]: id },
      },
      floorPlan: planWithRoomFinish(s.floorPlan, room, 'wall', id),
    }))
  },
  clearWallFinish: (room) => {
    get().pushHistory()
    set((s) => {
      const walls = { ...s.finishes.walls }
      delete walls[room]
      return {
        finishes: { ...s.finishes, walls },
        floorPlan: planWithRoomFinish(s.floorPlan, room, 'wall', undefined),
      }
    })
  },
  setCeilingFinish: (room, id) => {
    get().pushHistory()
    set((s) => ({
      finishes: {
        ...s.finishes,
        ceiling: { ...s.finishes.ceiling, [room]: id },
      },
      floorPlan: planWithRoomFinish(s.floorPlan, room, 'ceiling', id),
    }))
  },
  clearCeilingFinish: (room) => {
    get().pushHistory()
    set((s) => {
      const ceiling = { ...s.finishes.ceiling }
      delete ceiling[room]
      return {
        finishes: { ...s.finishes, ceiling },
        floorPlan: planWithRoomFinish(s.floorPlan, room, 'ceiling', undefined),
      }
    })
  },
  setAllFloorFinish: (id) => {
    get().pushHistory()
    // Iterate EVERY room across ALL storeys (default or custom) so "apply to
    // every room" reaches upper levels too (F13); skip the default flat's
    // external ledges. `planWithRoomFinish` resolves each room's own level.
    const rooms = allPlanRooms(get().floorPlan)
    set((s) => {
      const floor = { ...s.finishes.floor }
      let plan = s.floorPlan
      for (const room of rooms) {
        if (ROOMS[room.id as RoomId]?.external) continue
        floor[room.id as RoomId] = id
        plan = planWithRoomFinish(plan, room.id, 'floor', id)
      }
      return { finishes: { ...s.finishes, floor }, floorPlan: plan }
    })
  },
  setAllWallFinish: (id) => {
    get().pushHistory()
    // Every room across all storeys (F13), not just the ground floor.
    const rooms = allPlanRooms(get().floorPlan)
    set((s) => {
      const walls = { ...s.finishes.walls }
      let plan = s.floorPlan
      for (const room of rooms) {
        if (ROOMS[room.id as RoomId]?.external) continue
        walls[room.id as RoomId] = id
        plan = planWithRoomFinish(plan, room.id, 'wall', id)
      }
      return { finishes: { ...s.finishes, walls }, floorPlan: plan }
    })
  },
  applyHomeStyle: (floorId, wallId) => {
    get().pushHistory()
    // Set floor AND wall for every interior room across all storeys in one
    // snapshot → a single undo reverts the whole style.
    const rooms = allPlanRooms(get().floorPlan)
    set((s) => {
      const floor = { ...s.finishes.floor }
      const walls = { ...s.finishes.walls }
      let plan = s.floorPlan
      for (const room of rooms) {
        if (ROOMS[room.id as RoomId]?.external) continue
        floor[room.id as RoomId] = floorId
        walls[room.id as RoomId] = wallId
        plan = planWithRoomFinish(plan, room.id, 'floor', floorId)
        plan = planWithRoomFinish(plan, room.id, 'wall', wallId)
      }
      return { finishes: { ...s.finishes, floor, walls }, floorPlan: plan }
    })
  },
  setAllCeilingFinish: (id) => {
    get().pushHistory()
    // Every room across all storeys (F13), not just the ground floor.
    const rooms = allPlanRooms(get().floorPlan)
    set((s) => {
      const ceiling = { ...s.finishes.ceiling }
      let plan = s.floorPlan
      for (const room of rooms) {
        if (ROOMS[room.id as RoomId]?.external) continue
        ceiling[room.id as RoomId] = id
        plan = planWithRoomFinish(plan, room.id, 'ceiling', id)
      }
      return { finishes: { ...s.finishes, ceiling }, floorPlan: plan }
    })
  },
  setWallAccent: (key, id) => {
    get().pushHistory()
    set((s) => ({
      finishes: { ...s.finishes, wallAccents: { ...s.finishes.wallAccents, [key]: id } },
    }))
  },
  clearWallAccent: (key) => {
    get().pushHistory()
    set((s) => {
      const next = { ...s.finishes.wallAccents }
      delete next[key]
      return { finishes: { ...s.finishes, wallAccents: next } }
    })
  },
})
