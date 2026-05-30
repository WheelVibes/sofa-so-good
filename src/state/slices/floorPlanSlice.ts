import type { SliceCreator } from './types';
import type { RootState } from '../store';
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../../floorplan/types';
import { buildDefaultPlan } from '../../floorplan/defaultPlan';

/** Selected element in the floor-plan editor (for the inspector panel). */
export type PlanSelection =
  | { type: 'wall'; id: string }
  | { type: 'room'; id: string }
  | { type: 'opening'; id: string }
  | null;

let idCounter = 0;
/** Short unique id for newly-authored plan elements. */
function planId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export interface FloorPlanSlice {
  /** The active, rendered floor plan. */
  floorPlan: FloorPlan;
  /** Whether the 2D Floor Plan Editor overlay is open. */
  floorPlanEditing: boolean;
  /** Currently-selected element in the editor. */
  planSelection: PlanSelection;

  setFloorPlan: (plan: FloorPlan) => void;
  setFloorPlanEditing: (open: boolean) => void;
  toggleFloorPlanEditing: () => void;
  setPlanSelection: (sel: PlanSelection) => void;
  /** Reset the active plan back to the default HDB flat. */
  resetFloorPlan: () => void;
  /** Replace the active plan with a fresh blank room shell. */
  newFloorPlan: (name?: string) => void;
  /** Patch the top-level plan metadata (name, ceilingHeight, extent). */
  updateFloorPlanMeta: (patch: Partial<Pick<FloorPlan, 'name' | 'ceilingHeight' | 'extent'>>) => void;

  addWall: (wall: Omit<PlanWall, 'id'>) => string;
  updateWall: (id: string, patch: Partial<PlanWall>) => void;
  removeWall: (id: string) => void;

  addRoom: (room: Omit<PlanRoom, 'id'>) => string;
  updateRoom: (id: string, patch: Partial<PlanRoom>) => void;
  removeRoom: (id: string) => void;

  addOpening: (opening: Omit<PlanOpening, 'id'>) => string;
  updateOpening: (id: string, patch: Partial<PlanOpening>) => void;
  removeOpening: (id: string) => void;
}

export const FLOOR_PLAN_INITIAL: Pick<
  FloorPlanSlice,
  'floorPlan' | 'floorPlanEditing' | 'planSelection'
> = {
  floorPlan: buildDefaultPlan(),
  floorPlanEditing: false,
  planSelection: null,
};

/** A minimal starter plan: one 5×4 m room inside a 5.4×4.4 m external shell. */
function blankPlan(name: string): FloorPlan {
  const W = 5.4;
  const D = 4.4;
  const t: PlanWall['thickness'] = 'external';
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
    rooms: [{ id: planId('r'), name: 'Room 1', origin: [0.2, 0.2], width: W - 0.4, depth: D - 0.4 }],
  };
}

export const createFloorPlanSlice: SliceCreator<FloorPlanSlice, RootState> = (set) => ({
  ...FLOOR_PLAN_INITIAL,

  setFloorPlan: (plan) => set({ floorPlan: plan }),
  setFloorPlanEditing: (open) => set({ floorPlanEditing: open }),
  toggleFloorPlanEditing: () => set((s) => ({ floorPlanEditing: !s.floorPlanEditing })),
  setPlanSelection: (sel) => set({ planSelection: sel }),
  resetFloorPlan: () => set({ floorPlan: buildDefaultPlan(), planSelection: null }),
  newFloorPlan: (name = 'New apartment') => set({ floorPlan: blankPlan(name), planSelection: null }),
  updateFloorPlanMeta: (patch) => set((s) => ({ floorPlan: { ...s.floorPlan, ...patch } })),

  addWall: (wall) => {
    const id = planId('w');
    set((s) => ({ floorPlan: { ...s.floorPlan, walls: [...s.floorPlan.walls, { ...wall, id }] } }));
    return id;
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
    const id = planId('r');
    set((s) => ({ floorPlan: { ...s.floorPlan, rooms: [...s.floorPlan.rooms, { ...room, id }] } }));
    return id;
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
    const id = planId(opening.kind === 'door' ? 'door' : 'win');
    set((s) => ({
      floorPlan: { ...s.floorPlan, openings: [...s.floorPlan.openings, { ...opening, id }] },
    }));
    return id;
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
});
