import { ROOMS, WALLS } from '../../apartment/constants'
import type { RoomId } from '../../apartment/types'
import { allPlanRooms, levelOfRoom, planLevels, withLevelGeometry } from '../../floorplan/levels'
import type { FloorPlan } from '../../floorplan/types'
import {
  DEFAULT_FLOOR,
  DEFAULT_ROOM_FLOOR,
  DEFAULT_ROOM_WALL,
  DEFAULT_WALL,
} from '../../materials/builtinCatalog'
import type { MaterialId } from '../../materials/types'
import type { RootState } from '../store'
import { cleanPalette } from './colorPaletteSlice'
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

/**
 * Write a floor/wall texture transform (tile size + angle) through to the
 * active plan's room entry. Same no-fork discipline as `planWithRoomFinish`:
 * this is design data that rides along with the finish, so picking a grain
 * direction must not convert the curated flat into a custom plan. A dial set to
 * its default (`undefined`, or a 1× scale / 0° angle) is REMOVED rather than
 * stored, so an untouched room serialises exactly as before.
 */
function planWithRoomTexture(
  plan: FloorPlan,
  roomId: string,
  surface: 'floor' | 'wall',
  patch: { scale?: number; angle?: number },
): FloorPlan {
  const level = levelOfRoom(plan, roomId)
  const room = level?.rooms.find((r) => r.id === roomId)
  if (!level || !room) return plan
  const scaleKey = surface === 'floor' ? 'floorTexScale' : 'wallTexScale'
  const angleKey = surface === 'floor' ? 'floorTexAngle' : 'wallTexAngle'
  const next: Record<string, unknown> = { ...room }
  if ('scale' in patch) {
    if (patch.scale === undefined || Math.abs(patch.scale - 1) < 1e-3) delete next[scaleKey]
    else next[scaleKey] = patch.scale
  }
  if ('angle' in patch) {
    if (patch.angle === undefined || Math.abs(patch.angle) < 1e-4) delete next[angleKey]
    else next[angleKey] = patch.angle
  }
  if (next[scaleKey] === room[scaleKey] && next[angleKey] === room[angleKey]) return plan
  return withLevelGeometry(plan, level.id, (g) => ({
    rooms: g.rooms.map((r) => (r.id === roomId ? (next as unknown as typeof r) : r)),
  }))
}

/** Drop finish entries whose room — or, for the per-face maps, whose wall — no
 *  longer exists in either the fixed flat or the given plan. Hygiene when a
 *  different plan is activated, so a stale key from the previous plan can't
 *  shadow the new plan's own finishes (or resurrect an accent wall when a later
 *  plan happens to reuse an id). Covers the per-ROOM maps (floor/walls/ceiling)
 *  AND the per-FACE ones (`wallAccents`/`wallTex`, keyed `${wallId}:${roomId}` —
 *  these were left untouched, so a swapped plan carried the old plan's accent
 *  walls around forever). Returns the same maps object when nothing was pruned. */
export function pruneFinishesForPlan(
  finishes: FinishesSlice['finishes'],
  plan: FloorPlan,
): FinishesSlice['finishes'] {
  const valid = new Set<string>([...Object.keys(ROOMS), ...allPlanRooms(plan).map((r) => r.id)])
  const validWalls = new Set<string>([
    ...WALLS.map((w) => w.id),
    ...planLevels(plan).flatMap((l) => l.walls.map((w) => w.id)),
  ])
  // A face key is `${wallId}:${roomId}`; the wall id may itself contain no
  // colon in any plan we author, but split from the RIGHT so an odd id can't
  // silently mis-parse into a "valid" pair.
  const faceValid = (k: string) => {
    const i = k.lastIndexOf(':')
    if (i < 0) return false
    return validWalls.has(k.slice(0, i)) && valid.has(k.slice(i + 1))
  }
  const stale = (k: string) => !valid.has(k)
  const anyStale =
    Object.keys(finishes.floor).some(stale) ||
    Object.keys(finishes.walls).some(stale) ||
    Object.keys(finishes.ceiling).some(stale) ||
    Object.keys(finishes.wallAccents ?? {}).some((k) => !faceValid(k)) ||
    Object.keys(finishes.wallTex ?? {}).some((k) => !faceValid(k))
  if (!anyStale) return finishes
  const keep = <V>(rec: Record<string, V>): Record<string, V> =>
    Object.fromEntries(Object.entries(rec).filter(([k]) => valid.has(k)))
  const keepFace = <V>(rec: Record<string, V> | undefined): Record<string, V> =>
    Object.fromEntries(Object.entries(rec ?? {}).filter(([k]) => faceValid(k)))
  return {
    ...finishes,
    floor: keep(finishes.floor) as Record<RoomId, MaterialId>,
    walls: keep(finishes.walls) as Record<RoomId, MaterialId>,
    ceiling: keep(finishes.ceiling) as Record<RoomId, MaterialId>,
    wallAccents: keepFace(finishes.wallAccents),
    wallTex: keepFace(finishes.wallTex),
  }
}

export interface FinishesSlice {
  finishes: {
    floor: Record<RoomId, MaterialId>
    walls: Record<RoomId, MaterialId>
    /** Per-room ceiling finish — absent key → the default plain white ceiling. */
    ceiling: Record<RoomId, MaterialId>
    /**
     * Per-wall-FACE texture transform, keyed `${wallId}:${roomId}` exactly like
     * `wallAccents`. An accent wall usually wants its own lay direction too —
     * panelling turned 90° against the room's brick, a feature wall run
     * vertically — and that is a property of the one face, not the room.
     * Absent → the face follows the room's `wallTexAngle`/`wallTexScale`.
     */
    wallTex: Record<string, { scale?: number; angle?: number }>
    /** Accent-wall overrides keyed `${wallId}:${roomId}` — paints one wall
     *  face (the side facing that room) differently from the room default. */
    wallAccents: Record<string, MaterialId>
  }
  setFloorFinish: (room: RoomId, id: MaterialId) => void
  setWallFinish: (room: RoomId, id: MaterialId) => void
  /** Remove a room's wall finish (back to the neutral plaster shell). */
  clearWallFinish: (room: RoomId) => void
  /**
   * Set the LAY DIRECTION (and tile size) of a room's floor or wall finish —
   * the angle a plank run, a tile course or a panel grain follows.
   *
   * Real floors are laid one way across the whole room, so this is the control
   * that makes a picked direction stick; the repetition break-up only ever
   * varies the stagger around it (`materials/finishDirection.ts`). Values live
   * on the plan room beside the finish itself (so they travel with a saved
   * design and show up in the finish schedule) and are written WITHOUT forking
   * the default plan — choosing a grain direction is a finish decision, not a
   * geometry edit. `undefined` clears a dial back to its default.
   */
  setSurfaceTexture: (
    /** Plan room id — a plain string, since a custom plan's rooms are not
     *  drawn from the curated flat's `RoomId` union. */
    room: string,
    surface: 'floor' | 'wall',
    patch: { scale?: number; angle?: number },
  ) => void
  /** Paint/texture a room's ceiling, or clear back to the default white. */
  setCeilingFinish: (room: RoomId, id: MaterialId) => void
  clearCeilingFinish: (room: RoomId) => void
  /** Apply one floor/wall/ceiling finish to every interior (non-external) room at once. */
  setAllFloorFinish: (id: MaterialId) => void
  setAllWallFinish: (id: MaterialId) => void
  setAllCeilingFinish: (id: MaterialId) => void
  /** Apply a whole-home floor + wall finish (+ optional master palette) in ONE
   *  undo step (one-tap style transfer). Folds the palette in so the whole style
   *  is a single history entry — `setMasterPalette` would otherwise push its own,
   *  leaving a single undo unable to revert the finishes. */
  applyHomeStyle: (floorId: MaterialId, wallId: MaterialId, palette?: string[]) => void
  setWallAccent: (key: string, id: MaterialId) => void
  clearWallAccent: (key: string) => void
  /** Set ONE wall face's lay direction / tile size (`${wallId}:${roomId}`).
   *  A dial at its default is dropped; a face left with neither follows the
   *  room again, so this needs no separate "clear" for the common case. */
  setWallFaceTexture: (key: string, patch: { scale?: number; angle?: number }) => void
  /** Drop a face's whole override — "match room" for the direction dials. */
  clearWallFaceTexture: (key: string) => void
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
    wallTex: {},
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
  setSurfaceTexture: (room, surface, patch) => {
    // Coalesced: dragging a stepper is one undo step, like the plan inspector's
    // own dials.
    get().pushHistoryCoalesced(`surface-tex-${room}-${surface}`)
    set((s) => ({ floorPlan: planWithRoomTexture(s.floorPlan, room, surface, patch) }))
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
  applyHomeStyle: (floorId, wallId, palette) => {
    get().pushHistory()
    // Set floor AND wall for every interior room across all storeys (and the
    // master palette) in one snapshot → a single undo reverts the whole style.
    // The palette is set HERE rather than via `setMasterPalette` so it doesn't
    // push a second history entry that would shadow the finish revert.
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
      return {
        finishes: { ...s.finishes, floor, walls },
        floorPlan: plan,
        ...(palette ? { masterPalette: cleanPalette(palette) } : {}),
      }
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
  setWallFaceTexture: (key, patch) => {
    get().pushHistoryCoalesced(`wall-face-tex-${key}`)
    set((s) => {
      const prev = s.finishes.wallTex?.[key] ?? {}
      const next: { scale?: number; angle?: number } = { ...prev }
      if ('scale' in patch) {
        if (patch.scale === undefined || Math.abs(patch.scale - 1) < 1e-3) delete next.scale
        else next.scale = patch.scale
      }
      if ('angle' in patch) {
        if (patch.angle === undefined || Math.abs(patch.angle) < 1e-4) delete next.angle
        else next.angle = patch.angle
      }
      const wallTex = { ...s.finishes.wallTex }
      // An override with nothing left in it IS "follow the room" — don't keep
      // an empty object around to serialise.
      if (next.scale === undefined && next.angle === undefined) delete wallTex[key]
      else wallTex[key] = next
      return { finishes: { ...s.finishes, wallTex } }
    })
  },
  clearWallFaceTexture: (key) => {
    get().pushHistory()
    set((s) => {
      if (!s.finishes.wallTex?.[key]) return {}
      const wallTex = { ...s.finishes.wallTex }
      delete wallTex[key]
      return { finishes: { ...s.finishes, wallTex } }
    })
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
