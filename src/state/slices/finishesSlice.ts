import { ROOMS } from '../../apartment/constants'
import type { RoomId } from '../../apartment/types'
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
export interface FinishesSlice {
  finishes: {
    floor: Record<RoomId, MaterialId>
    walls: Record<RoomId, MaterialId>
    /** Accent-wall overrides keyed `${wallId}:${roomId}` — paints one wall
     *  face (the side facing that room) differently from the room default. */
    wallAccents: Record<string, MaterialId>
  }
  setFloorFinish: (room: RoomId, id: MaterialId) => void
  setWallFinish: (room: RoomId, id: MaterialId) => void
  /** Apply one floor/wall finish to every interior (non-external) room at once. */
  setAllFloorFinish: (id: MaterialId) => void
  setAllWallFinish: (id: MaterialId) => void
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
    }))
  },
  setWallFinish: (room, id) => {
    get().pushHistory()
    set((s) => ({
      finishes: {
        ...s.finishes,
        walls: { ...s.finishes.walls, [room]: id },
      },
    }))
  },
  setAllFloorFinish: (id) => {
    get().pushHistory()
    set((s) => {
      const floor = { ...s.finishes.floor }
      for (const [rid, room] of Object.entries(ROOMS)) {
        if (!room.external) floor[rid as RoomId] = id
      }
      return { finishes: { ...s.finishes, floor } }
    })
  },
  setAllWallFinish: (id) => {
    get().pushHistory()
    set((s) => {
      const walls = { ...s.finishes.walls }
      for (const [rid, room] of Object.entries(ROOMS)) {
        if (!room.external) walls[rid as RoomId] = id
      }
      return { finishes: { ...s.finishes, walls } }
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
