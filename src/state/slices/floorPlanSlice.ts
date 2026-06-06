import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../../floorplan/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Selected element in the floor-plan editor (for the inspector panel). */
export type PlanSelection =
  | { type: 'wall'; id: string }
  | { type: 'room'; id: string }
  | { type: 'opening'; id: string }
  | null

let idCounter = 0
/** Short unique id for newly-authored plan elements. */
function planId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

/** Deep clone a plan (plain serialisable data). */
function clonePlan(p: FloorPlan): FloorPlan {
  return JSON.parse(JSON.stringify(p)) as FloorPlan
}

export interface FloorPlanSlice {
  /** The active, rendered floor plan. */
  floorPlan: FloorPlan
  /** Whether the 2D Floor Plan Editor overlay is open. */
  floorPlanEditing: boolean
  /** Currently-selected element in the editor. */
  planSelection: PlanSelection
  /** Saved named floor plans (the apartment library). */
  savedPlans: FloorPlan[]
  /** Save the active plan into the library (new entry; returns its id). */
  saveCurrentPlan: (name?: string) => string
  /** Load a saved plan as the active plan (deep-copied). */
  loadSavedPlan: (id: string) => void
  /** Remove a saved plan from the library. */
  deleteSavedPlan: (id: string) => void

  setFloorPlan: (plan: FloorPlan) => void
  setFloorPlanEditing: (open: boolean) => void
  toggleFloorPlanEditing: () => void
  setPlanSelection: (sel: PlanSelection) => void
  /** Reset the active plan back to the default HDB flat. */
  resetFloorPlan: () => void
  /** Replace the active plan with a fresh blank room shell. */
  newFloorPlan: (name?: string) => void
  /** Patch the top-level plan metadata (name, ceilingHeight, extent). */
  updateFloorPlanMeta: (
    patch: Partial<Pick<FloorPlan, 'name' | 'ceilingHeight' | 'extent'>>,
  ) => void

  addWall: (wall: Omit<PlanWall, 'id'>) => string
  updateWall: (id: string, patch: Partial<PlanWall>) => void
  removeWall: (id: string) => void
  /** Split a wall into two segments at parameter `t` (0..1 along its length,
   *  default 0.5 = midpoint). Openings are re-homed onto whichever segment
   *  contains them. Used to build L-shapes by then dragging one half. */
  splitWall: (id: string, t?: number) => void
  /** Move a wall endpoint to a new position, dragging every other wall
   *  endpoint that shared the old position with it (so corners stay joined). */
  moveWallVertex: (id: string, which: 'start' | 'end', to: [number, number]) => void

  addRoom: (room: Omit<PlanRoom, 'id'>) => string
  updateRoom: (id: string, patch: Partial<PlanRoom>) => void
  removeRoom: (id: string) => void

  addOpening: (opening: Omit<PlanOpening, 'id'>) => string
  updateOpening: (id: string, patch: Partial<PlanOpening>) => void
  removeOpening: (id: string) => void
}

export const FLOOR_PLAN_INITIAL: Pick<
  FloorPlanSlice,
  'floorPlan' | 'floorPlanEditing' | 'planSelection' | 'savedPlans'
> = {
  floorPlan: buildDefaultPlan(),
  floorPlanEditing: false,
  planSelection: null,
  savedPlans: [],
}

/** A minimal starter plan: one 5×4 m room inside a 5.4×4.4 m external shell. */
function blankPlan(name: string): FloorPlan {
  const W = 5.4
  const D = 4.4
  const t: PlanWall['thickness'] = 'external'
  return {
    id: planId('plan'),
    name,
    ceilingHeight: 2.6,
    extent: [W, D],
    walls: [
      { id: planId('w'), start: [0.1, 0.1], end: [W - 0.1, 0.1], thickness: t },
      { id: planId('w'), start: [W - 0.1, 0.1], end: [W - 0.1, D - 0.1], thickness: t },
      { id: planId('w'), start: [W - 0.1, D - 0.1], end: [0.1, D - 0.1], thickness: t },
      { id: planId('w'), start: [0.1, D - 0.1], end: [0.1, 0.1], thickness: t },
    ],
    openings: [],
    rooms: [
      { id: planId('r'), name: 'Room 1', origin: [0.2, 0.2], width: W - 0.4, depth: D - 0.4 },
    ],
  }
}

export const createFloorPlanSlice: SliceCreator<FloorPlanSlice, RootState> = (set, get) => ({
  ...FLOOR_PLAN_INITIAL,

  setFloorPlan: (plan) => set({ floorPlan: plan }),
  saveCurrentPlan: (name) => {
    const id = planId('plan')
    let savedId = id
    set((s) => {
      const snapshot: FloorPlan = { ...clonePlan(s.floorPlan), id, name: name ?? s.floorPlan.name }
      // Replace an existing library entry with the same name, else append.
      const existing = s.savedPlans.findIndex((p) => p.name === snapshot.name)
      if (existing >= 0) {
        savedId = s.savedPlans[existing].id
        const next = s.savedPlans.slice()
        next[existing] = { ...snapshot, id: savedId }
        return { savedPlans: next }
      }
      return { savedPlans: [...s.savedPlans, snapshot] }
    })
    return savedId
  },
  loadSavedPlan: (id) =>
    set((s) => {
      const found = s.savedPlans.find((p) => p.id === id)
      return found ? { floorPlan: clonePlan(found), planSelection: null } : {}
    }),
  deleteSavedPlan: (id) => set((s) => ({ savedPlans: s.savedPlans.filter((p) => p.id !== id) })),
  setFloorPlanEditing: (open) => set({ floorPlanEditing: open }),
  toggleFloorPlanEditing: () => set((s) => ({ floorPlanEditing: !s.floorPlanEditing })),
  setPlanSelection: (sel) => set({ planSelection: sel }),
  resetFloorPlan: () => set({ floorPlan: buildDefaultPlan(), planSelection: null }),
  newFloorPlan: (name = 'New apartment') =>
    set({ floorPlan: blankPlan(name), planSelection: null }),
  updateFloorPlanMeta: (patch) => {
    get().pushHistoryCoalesced('plan-meta')
    set((s) => ({ floorPlan: { ...s.floorPlan, ...patch } }))
  },

  addWall: (wall) => {
    const id = planId('w')
    get().pushHistory()
    set((s) => ({ floorPlan: { ...s.floorPlan, walls: [...s.floorPlan.walls, { ...wall, id }] } }))
    return id
  },
  updateWall: (id, patch) => {
    get().pushHistoryCoalesced(`plan-wall-${id}`)
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        walls: s.floorPlan.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      },
    }))
  },
  removeWall: (id) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        walls: s.floorPlan.walls.filter((w) => w.id !== id),
        // Drop openings that referenced the deleted wall.
        openings: s.floorPlan.openings.filter((o) => o.wallId !== id),
      },
      planSelection: null,
    }))
  },

  splitWall: (id, t = 0.5) => {
    get().pushHistory()
    set((s) => {
      const wall = s.floorPlan.walls.find((w) => w.id === id)
      if (!wall) return {}
      const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
      const ct = Math.max(0.02, Math.min(0.98, t))
      const so = len * ct // split offset (m) from start
      const mid: [number, number] = [
        wall.start[0] + (wall.end[0] - wall.start[0]) * ct,
        wall.start[1] + (wall.end[1] - wall.start[1]) * ct,
      ]
      const idA = planId('w')
      const idB = planId('w')
      const wallA: PlanWall = { ...wall, id: idA, end: mid }
      const wallB: PlanWall = { ...wall, id: idB, start: mid }
      // Re-home openings onto whichever new segment contains them.
      const openings = s.floorPlan.openings.map((o) => {
        if (o.wallId !== id) return o
        if (o.offset + o.width <= so) return { ...o, wallId: idA }
        if (o.offset >= so) return { ...o, wallId: idB, offset: o.offset - so }
        // Straddles the split — clamp it onto the first segment.
        return { ...o, wallId: idA, width: Math.max(0.1, so - o.offset) }
      })
      return {
        floorPlan: {
          ...s.floorPlan,
          walls: s.floorPlan.walls.flatMap((w) => (w.id === id ? [wallA, wallB] : [w])),
          openings,
        },
        planSelection: { type: 'wall', id: idA } as PlanSelection,
      }
    })
  },

  moveWallVertex: (id, which, to) => {
    get().pushHistoryCoalesced(`plan-vertex-${id}-${which}`)
    set((s) => {
      const target = s.floorPlan.walls.find((w) => w.id === id)
      if (!target) return {}
      const from = which === 'start' ? target.start : target.end
      const EPS = 1e-3
      const shared = (p: [number, number]) =>
        Math.abs(p[0] - from[0]) < EPS && Math.abs(p[1] - from[1]) < EPS
      return {
        floorPlan: {
          ...s.floorPlan,
          walls: s.floorPlan.walls.map((w) => {
            const next = { ...w }
            if (shared(w.start)) next.start = [...to] as [number, number]
            if (shared(w.end)) next.end = [...to] as [number, number]
            return next
          }),
        },
      }
    })
  },

  addRoom: (room) => {
    const id = planId('r')
    get().pushHistory()
    set((s) => ({ floorPlan: { ...s.floorPlan, rooms: [...s.floorPlan.rooms, { ...room, id }] } }))
    return id
  },
  updateRoom: (id, patch) => {
    get().pushHistoryCoalesced(`plan-room-${id}`)
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        rooms: s.floorPlan.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      },
    }))
  },
  removeRoom: (id) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: { ...s.floorPlan, rooms: s.floorPlan.rooms.filter((r) => r.id !== id) },
      planSelection: null,
    }))
  },

  addOpening: (opening) => {
    const id = planId(opening.kind === 'door' ? 'door' : 'win')
    get().pushHistory()
    set((s) => ({
      floorPlan: { ...s.floorPlan, openings: [...s.floorPlan.openings, { ...opening, id }] },
    }))
    return id
  },
  updateOpening: (id, patch) => {
    get().pushHistoryCoalesced(`plan-open-${id}`)
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        openings: s.floorPlan.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      },
    }))
  },
  removeOpening: (id) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: { ...s.floorPlan, openings: s.floorPlan.openings.filter((o) => o.id !== id) },
      planSelection: null,
    }))
  },
})
