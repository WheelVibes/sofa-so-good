import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import {
  cloneLevelGeometry,
  GROUND_LEVEL_ID,
  itemsOnLevel,
  levelAsPlan,
  levelById,
  levelOfRoom,
  planLevels,
  withLevelGeometry,
} from '../../floorplan/levels'
import { DEFAULT_PLAN_ID } from '../../floorplan/planGeometry'
import { type RescaleOptions, type RescaleSpec, rescalePlan } from '../../floorplan/rescalePlan'
import { assignRoomOpeningNames, assignRoomWallNames } from '../../floorplan/roomWallNames'
import type {
  CeilingConfig,
  FloorPlan,
  PlanDimension,
  PlanNote,
  PlanOpening,
  PlanPolyline,
  PlanRoom,
  PlanUpperLevel,
  PlanWall,
} from '../../floorplan/types'
import { joinAdjacentWalls, reverseWallGeometry } from '../../floorplan/wallOps'
import type { PlanLabelMode } from '../../ui/floorplan/planLabels'
import { nextPlanLabelMode } from '../../ui/floorplan/planLabels'
import type { RootState } from '../store'
import { pruneFinishesForPlan } from './finishesSlice'
import type { SliceCreator } from './types'

/** Selected element in the floor-plan editor (for the inspector panel). */
export type PlanSelection =
  | { type: 'wall'; id: string }
  | { type: 'room'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'note'; id: string }
  | { type: 'dim'; id: string }
  | { type: 'polyline'; id: string }
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

/** Make plan edits "bind" to the 3D scene. The scene renders the curated
 *  `<Apartment/>` only while the plan id is the seeded default (`isDefaultPlan`);
 *  every other plan renders live via `<PlanShell/>`. So the first structural
 *  edit re-ids the default plan to a custom one — switching orbit + walk to the
 *  edited geometry. The default plan's geometry reproduces the curated shell, so
 *  the swap is seamless (and the 3D scene is hidden behind the editor anyway).
 *  Idempotent once forked (a no-op for already-custom plans). */
function forkIfDefault(plan: FloorPlan): FloorPlan {
  return plan.id === DEFAULT_PLAN_ID ? { ...plan, id: planId('plan') } : plan
}

/** Apply a room's auto-naming to its boundary walls + the doors/windows on them
 *  (`<room> wall ##` / `<room> door ##` / `<room> window ##`). A user-set name
 *  (its `nameAuto` flag cleared) is never overwritten — only unset / previously
 *  auto-assigned names are (re)written, so renaming a room re-flows the autos
 *  while custom names stay put. Returns the patched walls + openings. */
function applyRoomElementNames(
  walls: PlanWall[],
  openings: PlanOpening[],
  room: PlanRoom,
): { walls: PlanWall[]; openings: PlanOpening[] } {
  const wallNames = new Map(assignRoomWallNames(walls, room).map((a) => [a.id, a.name]))
  const nextWalls = walls.map((w) => {
    const name = wallNames.get(w.id)
    if (name && (!w.name || w.nameAuto)) return { ...w, name, nameAuto: true as const }
    return w
  })
  const openNames = new Map(
    assignRoomOpeningNames(walls, openings, room).map((a) => [a.id, a.name]),
  )
  const nextOpenings = openings.map((o) => {
    const name = openNames.get(o.id)
    if (name && (!o.name || o.nameAuto)) return { ...o, name, nameAuto: true as const }
    return o
  })
  return { walls: nextWalls, openings: nextOpenings }
}

export interface FloorPlanSlice {
  /** The active, rendered floor plan. */
  floorPlan: FloorPlan
  /** The plan as it was when last LOADED (template / saved / reset / new) —
   *  the "as-built" baseline the demolition/hacking plan diffs against. Updated
   *  only on a plan load, never on a wall edit. Session-only (not persisted). */
  baselinePlan: FloorPlan
  /** Whether the 2D Floor Plan Editor overlay is open. */
  floorPlanEditing: boolean
  /** 2D-plan furniture label mode (off / name / name+price). Session-only. */
  planLabels: PlanLabelMode
  setPlanLabels: (mode: PlanLabelMode) => void
  /** Advance the plan-label mode (off → name → price → off). */
  cyclePlanLabels: () => void
  /** Currently-selected element in the editor (the "primary" selection that the
   *  inspector edits). */
  planSelection: PlanSelection
  /** Additional walls in a multi-selection, *beyond* the primary `planSelection`
   *  wall. The full wall selection = primary wall (if any) ∪ these. Session-only
   *  (not persisted, not in history); cleared by any plain (non-additive)
   *  selection. */
  selectedWallIds: string[]
  /** When on, a tap/click on a wall toggles it in the multi-selection instead of
   *  replacing it (the touch-friendly equivalent of Shift-click). Session-only. */
  planWallMultiAdd: boolean
  setPlanWallMultiAdd: (on: boolean) => void
  /** Toggle a wall in the multi-selection (Shift/⌘-click or multi-add mode):
   *  adds it as the new primary, or removes it (promoting another to primary). */
  toggleWallSelection: (id: string) => void
  /** Bulk-delete walls (skips locked ones); one history step; clears selection. */
  removeWalls: (ids: string[], levelId?: string) => void
  /** Bulk lock/unlock walls; one history step. */
  setWallsLocked: (ids: string[], locked: boolean, levelId?: string) => void
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
  /** Patch the top-level plan metadata (name, ceilingHeight, extent, wallColor). */
  updateFloorPlanMeta: (
    patch: Partial<
      Pick<
        FloorPlan,
        'name' | 'ceilingHeight' | 'extent' | 'wallColor' | 'category' | 'wallThickness'
      >
    >,
  ) => void

  addWall: (wall: Omit<PlanWall, 'id'>, levelId?: string) => string
  updateWall: (id: string, patch: Partial<PlanWall>, levelId?: string) => void
  removeWall: (id: string, levelId?: string) => void
  /** Split a wall into two segments at parameter `t` (0..1 along its length,
   *  default 0.5 = midpoint). Openings are re-homed onto whichever segment
   *  contains them. Used to build L-shapes by then dragging one half. */
  splitWall: (id: string, t?: number, levelId?: string) => void
  /** Reverse a wall's direction in place (openings keep their position). */
  reverseWall: (id: string, levelId?: string) => void
  /** Duplicate a wall, offset slightly so the copy is visible, and select it.
   *  A custom name is NOT copied (the duplicate gets its own default). Returns
   *  the new wall's id, or undefined when the source is missing. */
  duplicateWall: (id: string, levelId?: string) => string | undefined
  /** Merge a wall with a collinear neighbour that shares an endpoint (inverse of
   *  split); selects the merged wall. No-op when there's no collinear neighbour. */
  joinWall: (id: string, levelId?: string) => void
  /** Move a wall endpoint to a new position, dragging every other wall
   *  endpoint that shared the old position with it (so corners stay joined). */
  moveWallVertex: (
    id: string,
    which: 'start' | 'end',
    to: [number, number],
    levelId?: string,
  ) => void
  /** Move a whole wall to new endpoints (drag/rotate), dragging any connected
   *  walls that shared the old start/end so corners stay joined. */
  moveWallTo: (
    id: string,
    newStart: [number, number],
    newEnd: [number, number],
    levelId?: string,
  ) => void

  addRoom: (room: Omit<PlanRoom, 'id'>, levelId?: string) => string
  /** Patch a room by id — searches EVERY storey (rooms ids are plan-unique
   *  across levels), so callers stay level-agnostic. */
  updateRoom: (id: string, patch: Partial<PlanRoom>) => void
  /** Patch a room's ceiling treatment (coalesced for slider drags). `null`
   *  clears it back to a flat ceiling. Searches every storey, like updateRoom. */
  setRoomCeiling: (id: string, patch: Partial<CeilingConfig> | null) => void
  removeRoom: (id: string, levelId?: string) => void

  addOpening: (opening: Omit<PlanOpening, 'id'>, levelId?: string) => string
  updateOpening: (id: string, patch: Partial<PlanOpening>, levelId?: string) => void
  removeOpening: (id: string, levelId?: string) => void
  /** Duplicate an opening on the same wall, nudged along it so the copy is
   *  visible, clamped within the wall; selects the copy. A custom name is not
   *  copied. Returns the new opening's id, or undefined when the source/wall is
   *  missing. */
  duplicateOpening: (id: string, levelId?: string) => string | undefined

  /** Add a free-text note to the plan (PARITY-DIMTEXT); returns its id. */
  addNote: (note: Omit<PlanNote, 'id'>) => string
  /** Patch a note's text / position (coalesced for drags). */
  updateNote: (id: string, patch: Partial<Omit<PlanNote, 'id'>>) => void
  /** Remove a note; clears the selection if it was selected. */
  removeNote: (id: string) => void

  /** Add a custom dimension line (PARITY-DIMTEXT); returns its id. */
  addDimension: (dim: Omit<PlanDimension, 'id'>) => string
  /** Remove a dimension; clears the selection if it was selected. */
  removeDimension: (id: string) => void

  /** Add a free-form polyline annotation (PARITY-POLYLINE); returns its id. */
  addPolyline: (poly: Omit<PlanPolyline, 'id'>) => string
  /** Patch a polyline's style flags (closed / dashed / arrow). */
  updatePolyline: (id: string, patch: Partial<Omit<PlanPolyline, 'id'>>) => void
  /** Remove a polyline; clears the selection if it was selected. */
  removePolyline: (id: string) => void

  /** Add an empty storey above the highest level; returns its id (F13/ML4). */
  addLevel: (name?: string) => string
  /** Duplicate a storey (walls/rooms/openings + its furniture + per-room/-wall
   *  finishes) into a new storey above the highest level; returns its id, or
   *  `null` for an unknown source. Undoable (PARITY-LEVELOPS). */
  duplicateLevel: (sourceId: string) => string | null
  /** Remove a storey: its rooms/walls/openings, its items, and its finish keys.
   *  Undoable (history snapshot first). No-op for 'ground' or unknown ids. */
  removeLevel: (id: string) => void

  /** Rescale the WHOLE plan (every storey) + the furniture by a factor or to a
   *  target wall length, about an anchor point (PARITY-PLAN-SCALE). Scales wall
   *  endpoints, room polygons, opening offsets, notes/dims/polylines, and item
   *  positions; item SIZES are preserved unless `opts.scaleFurnitureSize`. ONE
   *  undo step (snapshots plan + items first). No-op for factor 1; throws on an
   *  invalid factor / unmeetable target (the caller validates first). */
  rescaleFloorPlan: (spec: RescaleSpec, opts?: RescaleOptions) => void
}

export const FLOOR_PLAN_INITIAL: Pick<
  FloorPlanSlice,
  | 'floorPlan'
  | 'baselinePlan'
  | 'floorPlanEditing'
  | 'planLabels'
  | 'planSelection'
  | 'selectedWallIds'
  | 'planWallMultiAdd'
  | 'savedPlans'
> = {
  floorPlan: buildDefaultPlan(),
  baselinePlan: buildDefaultPlan(),
  floorPlanEditing: false,
  planLabels: 'off',
  planSelection: null,
  selectedWallIds: [],
  planWallMultiAdd: false,
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

  setFloorPlan: (plan) =>
    set((s) => ({
      floorPlan: plan,
      baselinePlan: clonePlan(plan),
      // Activating a different plan: drop finish entries keyed by the previous
      // plan's room ids so they can't shadow the new plan's per-room finishes.
      finishes: pruneFinishesForPlan(s.finishes, plan),
    })),
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
  loadSavedPlan: (id) => {
    const found = get().savedPlans.find((p) => p.id === id)
    if (!found) return
    // Snapshot first so loading a saved plan over the current one is undoable.
    get().pushHistory()
    set((s) => {
      const fresh = clonePlan(found)
      return {
        floorPlan: fresh,
        baselinePlan: clonePlan(found),
        planSelection: null,
        finishes: pruneFinishesForPlan(s.finishes, fresh),
      }
    })
  },
  deleteSavedPlan: (id) => set((s) => ({ savedPlans: s.savedPlans.filter((p) => p.id !== id) })),
  // Opening or closing the editor starts with a clean slate — clear any element
  // selection (and multi-selection) so re-entering never resurfaces a stale
  // inspector for something the user can no longer see.
  setFloorPlanEditing: (open) =>
    set({ floorPlanEditing: open, planSelection: null, selectedWallIds: [] }),
  toggleFloorPlanEditing: () =>
    set((s) => ({
      floorPlanEditing: !s.floorPlanEditing,
      planSelection: null,
      selectedWallIds: [],
    })),
  setPlanLabels: (planLabels) => set({ planLabels }),
  cyclePlanLabels: () => set((s) => ({ planLabels: nextPlanLabelMode(s.planLabels) })),
  // A plain selection always replaces the multi-selection (clears the extras),
  // so single-click select behaves exactly as before. Selecting a plan element
  // (wall/room/opening/…) also clears any placed-item selection so the furniture
  // inspector (driven by `selectedItemId`) and the element inspector never both
  // render; a null selection leaves the item selection alone (clicking empty
  // canvas already clears items via `selectItem(null)` where relevant).
  setPlanSelection: (sel) =>
    set(
      sel
        ? { planSelection: sel, selectedWallIds: [], selectedItemId: null, selectedItemIds: [] }
        : { planSelection: sel, selectedWallIds: [] },
    ),
  setPlanWallMultiAdd: (on) => set({ planWallMultiAdd: on }),
  toggleWallSelection: (id) =>
    set((s) => {
      const primary = s.planSelection?.type === 'wall' ? s.planSelection.id : null
      const combined = [...new Set([...(primary ? [primary] : []), ...s.selectedWallIds])]
      if (combined.includes(id)) {
        // Remove it; promote the first remaining wall to primary.
        const rest = combined.filter((w) => w !== id)
        return {
          planSelection: rest.length ? { type: 'wall', id: rest[0] } : null,
          selectedWallIds: rest.slice(1),
        }
      }
      // Add it as the new primary; everything previously selected becomes extra.
      return { planSelection: { type: 'wall', id }, selectedWallIds: combined }
    }),
  removeWalls: (ids, levelId) => {
    const s0 = get()
    const g = levelAsPlan(s0.floorPlan, levelById(s0.floorPlan, levelId))
    const removable = new Set(ids.filter((id) => !g.walls.find((w) => w.id === id)?.locked))
    if (removable.size === 0) return
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (gg) => ({
        walls: gg.walls.filter((w) => !removable.has(w.id)),
        openings: gg.openings.filter((o) => !removable.has(o.wallId)),
      })),
      planSelection: null,
      selectedWallIds: [],
    }))
  },
  setWallsLocked: (ids, locked, levelId) => {
    const set0 = new Set(ids)
    if (set0.size === 0) return
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (gg) => ({
        walls: gg.walls.map((w) => (set0.has(w.id) ? { ...w, locked: locked || undefined } : w)),
      })),
    }))
  },
  resetFloorPlan: () => {
    // Snapshot first so "Reset to HDB" is undoable — otherwise a hand-built
    // custom plan is destroyed with no way back.
    get().pushHistory()
    const fresh = buildDefaultPlan()
    set((s) => ({
      floorPlan: fresh,
      baselinePlan: clonePlan(fresh),
      planSelection: null,
      finishes: pruneFinishesForPlan(s.finishes, fresh),
    }))
  },
  newFloorPlan: (name = 'New apartment') => {
    // Snapshot first so starting a blank plan is undoable — consistent with
    // resetFloorPlan / loadSavedPlan; otherwise the prior plan is lost with no
    // way back (BUG-013).
    get().pushHistory()
    const fresh = blankPlan(name)
    set((s) => ({
      floorPlan: fresh,
      baselinePlan: clonePlan(fresh),
      planSelection: null,
      finishes: pruneFinishesForPlan(s.finishes, fresh),
    }))
  },
  updateFloorPlanMeta: (patch) => {
    get().pushHistoryCoalesced('plan-meta')
    set((s) => ({ floorPlan: { ...forkIfDefault(s.floorPlan), ...patch } }))
  },

  addWall: (wall, levelId) => {
    const id = planId('w')
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => ({
        walls: [...g.walls, { ...wall, id }],
      })),
    }))
    return id
  },
  updateWall: (id, patch, levelId) => {
    get().pushHistoryCoalesced(`plan-wall-${id}`)
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => ({
        walls: g.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      })),
    }))
  },
  removeWall: (id, levelId) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => ({
        walls: g.walls.filter((w) => w.id !== id),
        // Drop openings that referenced the deleted wall.
        openings: g.openings.filter((o) => o.wallId !== id),
      })),
      planSelection: null,
    }))
  },
  duplicateWall: (id, levelId) => {
    const s0 = get()
    const g = levelAsPlan(s0.floorPlan, levelById(s0.floorPlan, levelId))
    const src = g.walls.find((w) => w.id === id)
    if (!src) return undefined
    const newId = planId('w')
    const off = 0.3 // visible offset so the copy doesn't sit exactly on the source
    // A copy is its own element: drop the custom name (+ auto flag) + lock so it's editable.
    const { name: _n, nameAuto: _na, locked: _l, ...rest } = src
    const copy: PlanWall = {
      ...rest,
      id: newId,
      start: [src.start[0] + off, src.start[1] + off],
      end: [src.end[0] + off, src.end[1] + off],
    }
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (gg) => ({
        walls: [...gg.walls, copy],
      })),
      planSelection: { type: 'wall', id: newId },
      selectedWallIds: [],
    }))
    return newId
  },

  splitWall: (id, t = 0.5, levelId) => {
    get().pushHistory()
    set((s) => {
      let selection = s.planSelection
      const floorPlan = withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => {
        const wall = g.walls.find((w) => w.id === id)
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
        selection = { type: 'wall', id: idA }
        return {
          walls: g.walls.flatMap((w) => (w.id === id ? [wallA, wallB] : [w])),
          // Re-home openings onto whichever new segment contains them.
          openings: g.openings.map((o) => {
            if (o.wallId !== id) return o
            if (o.offset + o.width <= so) return { ...o, wallId: idA }
            if (o.offset >= so) return { ...o, wallId: idB, offset: o.offset - so }
            // Straddles the split — clamp it onto the first segment.
            return { ...o, wallId: idA, width: Math.max(0.1, so - o.offset) }
          }),
        }
      })
      return { floorPlan, planSelection: selection, selectedWallIds: [] }
    })
  },

  reverseWall: (id, levelId) => {
    const s0 = get()
    const g = levelAsPlan(s0.floorPlan, levelById(s0.floorPlan, levelId))
    const res = reverseWallGeometry(g.walls, g.openings, id)
    if (!res) return // missing/degenerate — no-op, no history step
    s0.pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, () => ({
        walls: res.walls,
        openings: res.openings,
      })),
    }))
  },

  joinWall: (id, levelId) => {
    const s0 = get()
    const g = levelAsPlan(s0.floorPlan, levelById(s0.floorPlan, levelId))
    const res = joinAdjacentWalls(g.walls, g.openings, id, planId)
    if (!res) return // no collinear neighbour — no-op, no history step
    s0.pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, () => ({
        walls: res.walls,
        openings: res.openings,
      })),
      planSelection: { type: 'wall', id: res.mergedId },
      selectedWallIds: [],
    }))
  },

  moveWallVertex: (id, which, to, levelId) => {
    get().pushHistoryCoalesced(`plan-vertex-${id}-${which}`)
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => {
        const target = g.walls.find((w) => w.id === id)
        if (!target) return {}
        const from = which === 'start' ? target.start : target.end
        const EPS = 1e-3
        const shared = (p: [number, number]) =>
          Math.abs(p[0] - from[0]) < EPS && Math.abs(p[1] - from[1]) < EPS
        return {
          walls: g.walls.map((w) => {
            const next = { ...w }
            if (shared(w.start)) next.start = [...to] as [number, number]
            if (shared(w.end)) next.end = [...to] as [number, number]
            return next
          }),
        }
      }),
    }))
  },

  moveWallTo: (id, newStart, newEnd, levelId) => {
    get().pushHistoryCoalesced(`plan-wall-move-${id}`)
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => {
        const target = g.walls.find((w) => w.id === id)
        if (!target) return {}
        const cs = target.start
        const ce = target.end
        const EPS = 1e-3
        const near = (p: [number, number], q: [number, number]) =>
          Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS
        // Endpoints coincident with the wall's OLD start move to newStart; with
        // the old end → newEnd. This drags the wall itself plus every wall that
        // shared either corner, so the network stays connected.
        const remap = (p: [number, number]): [number, number] =>
          near(p, cs) ? [...newStart] : near(p, ce) ? [...newEnd] : p
        return {
          walls: g.walls.map((w) => ({ ...w, start: remap(w.start), end: remap(w.end) })),
        }
      }),
    }))
  },

  addRoom: (room, levelId) => {
    const id = planId('r')
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => {
        const newRoom = { ...room, id }
        // Auto-name the room's boundary walls + the doors/windows on them
        // (`<room> wall/door/window ##`) — but never overwrite a user-set name
        // (only unset / previously auto-assigned ones).
        const named = applyRoomElementNames(g.walls, g.openings, newRoom)
        return { rooms: [...g.rooms, newRoom], walls: named.walls, openings: named.openings }
      }),
    }))
    return id
  },
  updateRoom: (id, patch) => {
    get().pushHistoryCoalesced(`plan-room-${id}`)
    set((s) => ({
      // The room can sit on any storey — resolve its level so an upper-level
      // room patches in place (room ids are plan-unique across levels).
      floorPlan: withLevelGeometry(
        forkIfDefault(s.floorPlan),
        levelOfRoom(s.floorPlan, id)?.id,
        (g) => {
          const rooms = g.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r))
          // Renaming a room re-flows its auto-assigned wall/door/window names so
          // they track the new room name; elements the user named themselves keep
          // their names (their `nameAuto` flag is cleared — see applyRoomElementNames).
          if (patch.name !== undefined) {
            const room = rooms.find((r) => r.id === id)
            if (room) {
              const named = applyRoomElementNames(g.walls, g.openings, room)
              return { rooms, walls: named.walls, openings: named.openings }
            }
          }
          return { rooms }
        },
      ),
    }))
  },
  setRoomCeiling: (id, patch) => {
    get().pushHistoryCoalesced(`plan-ceiling-${id}`)
    set((s) => ({
      floorPlan: withLevelGeometry(
        forkIfDefault(s.floorPlan),
        levelOfRoom(s.floorPlan, id)?.id,
        (g) => ({
          rooms: g.rooms.map((r) => {
            if (r.id !== id) return r
            if (patch === null) {
              const { ceiling: _drop, ...rest } = r
              return rest
            }
            const base: CeilingConfig = r.ceiling ?? { style: 'flat' }
            return { ...r, ceiling: { ...base, ...patch } }
          }),
        }),
      ),
    }))
  },
  removeRoom: (id, levelId) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => ({
        rooms: g.rooms.filter((r) => r.id !== id),
      })),
      planSelection: null,
    }))
  },

  addOpening: (opening, levelId) => {
    const id = planId(opening.kind === 'door' ? 'door' : 'win')
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => ({
        openings: [...g.openings, { ...opening, id }],
      })),
    }))
    return id
  },
  updateOpening: (id, patch, levelId) => {
    get().pushHistoryCoalesced(`plan-open-${id}`)
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => ({
        openings: g.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      })),
    }))
  },
  removeOpening: (id, levelId) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (g) => ({
        openings: g.openings.filter((o) => o.id !== id),
      })),
      planSelection: null,
    }))
  },
  duplicateOpening: (id, levelId) => {
    const s0 = get()
    const g = levelAsPlan(s0.floorPlan, levelById(s0.floorPlan, levelId))
    const src = g.openings.find((o) => o.id === id)
    if (!src) return undefined
    const wall = g.walls.find((w) => w.id === src.wallId)
    if (!wall) return undefined
    const wlen = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    // Nudge the copy along the wall by ~one width, clamped within the wall span.
    const maxOff = Math.max(0, wlen - src.width)
    const nudged = src.offset + src.width
    const offset = nudged <= maxOff ? nudged : Math.max(0, src.offset - src.width)
    const newId = planId(src.kind === 'door' ? 'door' : 'win')
    const { name: _n, nameAuto: _na, locked: _l, ...rest } = src
    const copy: PlanOpening = { ...rest, id: newId, offset }
    get().pushHistory()
    set((s) => ({
      floorPlan: withLevelGeometry(forkIfDefault(s.floorPlan), levelId, (gg) => ({
        openings: [...gg.openings, copy],
      })),
      planSelection: { type: 'opening', id: newId },
    }))
    return newId
  },

  // Notes are a top-level plan array (level-tagged via `note.levelId`), not part
  // of a storey's wall/room/opening geometry — so they edit the plan directly.
  addNote: (note) => {
    const id = planId('note')
    get().pushHistory()
    set((s) => ({
      floorPlan: { ...s.floorPlan, notes: [...(s.floorPlan.notes ?? []), { ...note, id }] },
    }))
    return id
  },
  updateNote: (id, patch) => {
    get().pushHistoryCoalesced(`plan-note-${id}`)
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        notes: (s.floorPlan.notes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)),
      },
    }))
  },
  removeNote: (id) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        notes: (s.floorPlan.notes ?? []).filter((n) => n.id !== id),
      },
      planSelection:
        s.planSelection?.type === 'note' && s.planSelection.id === id ? null : s.planSelection,
    }))
  },

  addDimension: (dim) => {
    const id = planId('dim')
    get().pushHistory()
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        dimensions: [...(s.floorPlan.dimensions ?? []), { ...dim, id }],
      },
    }))
    return id
  },
  removeDimension: (id) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        dimensions: (s.floorPlan.dimensions ?? []).filter((d) => d.id !== id),
      },
      planSelection:
        s.planSelection?.type === 'dim' && s.planSelection.id === id ? null : s.planSelection,
    }))
  },

  // Polylines are a top-level plan array (level-tagged via `levelId`), like
  // notes/dimensions — free-form markup, not storey geometry.
  addPolyline: (poly) => {
    const id = planId('poly')
    get().pushHistory()
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        polylines: [...(s.floorPlan.polylines ?? []), { ...poly, id }],
      },
    }))
    return id
  },
  updatePolyline: (id, patch) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        polylines: (s.floorPlan.polylines ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    }))
  },
  removePolyline: (id) => {
    get().pushHistory()
    set((s) => ({
      floorPlan: {
        ...s.floorPlan,
        polylines: (s.floorPlan.polylines ?? []).filter((p) => p.id !== id),
      },
      planSelection:
        s.planSelection?.type === 'polyline' && s.planSelection.id === id ? null : s.planSelection,
    }))
  },

  addLevel: (name) => {
    const id = planId('lvl')
    get().pushHistory()
    set((s) => {
      const existing = s.floorPlan.upperLevels ?? []
      const slab = 0.3
      const top = existing.reduce(
        (m, l) => Math.max(m, l.elevation),
        0, // ground floor slab top
      )
      const level: PlanUpperLevel = {
        id,
        name: name ?? `Level ${existing.length + 2}`,
        elevation: top + s.floorPlan.ceilingHeight + slab,
        walls: [],
        openings: [],
        rooms: [],
      }
      return { floorPlan: { ...forkIfDefault(s.floorPlan), upperLevels: [...existing, level] } }
    })
    return id
  },
  duplicateLevel: (sourceId) => {
    const s0 = get()
    const plan = s0.floorPlan
    // Only duplicate a real storey (levelById falls back to ground for unknowns).
    if (!planLevels(plan).some((l) => l.id === sourceId)) return null
    const src = levelById(plan, sourceId)
    s0.pushHistory()
    const newId = planId('lvl')
    const cloned = cloneLevelGeometry(
      { walls: src.walls, openings: src.openings, rooms: src.rooms },
      planId,
    )
    const existing = plan.upperLevels ?? []
    const slab = 0.3
    const top = existing.reduce((m, l) => Math.max(m, l.elevation), 0)
    const level: PlanUpperLevel = {
      id: newId,
      name: `${src.name} copy`,
      elevation: top + plan.ceilingHeight + slab,
      ...(src.ceilingHeight !== undefined ? { ceilingHeight: src.ceilingHeight } : {}),
      walls: cloned.walls,
      openings: cloned.openings,
      rooms: cloned.rooms,
    }
    // Clone the source storey's furniture onto the new level (fresh ids).
    const newItems = itemsOnLevel(s0.items, sourceId).map((it) => ({
      ...(JSON.parse(JSON.stringify(it)) as typeof it),
      id: planId('item'),
      levelId: newId,
    }))
    set((s) => {
      const f = s.finishes
      // Room ids are plan-unique strings; the finish maps are typed by the
      // known-room union, so work over string-keyed copies and cast back.
      const floor = { ...f.floor } as Record<string, string>
      const walls = { ...f.walls } as Record<string, string>
      for (const [oldR, newR] of Object.entries(cloned.roomIdMap)) {
        if (floor[oldR] !== undefined) floor[newR] = floor[oldR]
        if (walls[oldR] !== undefined) walls[newR] = walls[oldR]
      }
      // Wall-accent keys are `${wallId}:${roomId}` — remap both halves.
      const wallAccents = { ...f.wallAccents }
      for (const [key, mat] of Object.entries(f.wallAccents)) {
        const [wid, rid] = key.split(':')
        const nw = cloned.wallIdMap[wid]
        const nr = cloned.roomIdMap[rid]
        if (nw && nr) wallAccents[`${nw}:${nr}`] = mat
      }
      return {
        floorPlan: {
          ...forkIfDefault(s.floorPlan),
          upperLevels: [...(s.floorPlan.upperLevels ?? []), level],
        },
        items: [...s.items, ...newItems],
        finishes: {
          ...f,
          floor: floor as typeof f.floor,
          walls: walls as typeof f.walls,
          wallAccents,
        },
      }
    })
    return newId
  },
  removeLevel: (id) => {
    if (id === GROUND_LEVEL_ID) return
    const s0 = get()
    if (!s0.floorPlan.upperLevels?.some((l) => l.id === id)) return
    s0.pushHistory()
    set((s) => {
      const floorPlan = {
        ...s.floorPlan,
        upperLevels: (s.floorPlan.upperLevels ?? []).filter((l) => l.id !== id),
      }
      return {
        floorPlan,
        // The storey's items go with it (undoable via the snapshot above).
        items: s.items.filter((it) => it.levelId !== id),
        // Its rooms' finish keys are now stale — prune against the new plan.
        finishes: pruneFinishesForPlan(s.finishes, floorPlan),
        planSelection: null,
      }
    })
  },
  rescaleFloorPlan: (spec, opts) => {
    const s0 = get()
    // Validate up front so a bad factor / unmeetable target throws BEFORE any
    // history snapshot or fork — the action stays a clean no-op on failure.
    const result = rescalePlan(s0.floorPlan, spec, s0.items, opts)
    // Factor 1 is a structural no-op — don't fork the default plan or push an
    // empty undo step for it.
    if (result.factor === 1) return
    s0.pushHistory()
    set((s) => {
      // Re-id the seeded default plan on the first structural edit (forkIfDefault),
      // then carry over the rescaled geometry. Items + plan are replaced in one
      // set() so a single undo reverts the whole rescale.
      const forked = forkIfDefault(s.floorPlan)
      return {
        floorPlan: { ...result.plan, id: forked.id },
        items: result.items,
        planSelection: null,
        selectedWallIds: [],
      }
    })
  },
})
