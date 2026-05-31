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

export const createFloorPlanSlice: SliceCreator<FloorPlanSlice, RootState> = (set) => ({
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
  updateFloorPlanMeta: (patch) => set((s) => ({ floorPlan: { ...s.floorPlan, ...patch } })),

  addWall: (wall) => {
    const id = planId('w')
    set((s) => ({ floorPlan: { ...s.floorPlan, walls: [...s.floorPlan.walls, { ...wall, id }] } }))
    return id
  },
  updateWall: (id, patch) =>
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        walls: s.floorPlan.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      },
    })),
  removeWall: (id) =>
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        walls: s.floorPlan.walls.filter((w) => w.id !== id),
        // Drop openings that referenced the deleted wall.
        openings: s.floorPlan.openings.filter((o) => o.wallId !== id),
      },
      planSelection: null,
    })),

  addRoom: (room) => {
    const id = planId('r')
    set((s) => ({ floorPlan: { ...s.floorPlan, rooms: [...s.floorPlan.rooms, { ...room, id }] } }))
    return id
  },
  updateRoom: (id, patch) =>
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        rooms: s.floorPlan.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      },
    })),
  removeRoom: (id) =>
    set((s) => ({
      floorPlan: { ...s.floorPlan, rooms: s.floorPlan.rooms.filter((r) => r.id !== id) },
      planSelection: null,
    })),

  addOpening: (opening) => {
    const id = planId(opening.kind === 'door' ? 'door' : 'win')
    set((s) => ({
      floorPlan: { ...s.floorPlan, openings: [...s.floorPlan.openings, { ...opening, id }] },
    }))
    return id
  },
  updateOpening: (id, patch) =>
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        openings: s.floorPlan.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      },
    })),
  removeOpening: (id) =>
    set((s) => ({
      floorPlan: { ...s.floorPlan, openings: s.floorPlan.openings.filter((o) => o.id !== id) },
      planSelection: null,
    })),
})
