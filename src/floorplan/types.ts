/**
 * Editable floor-plan model. This is a self-contained, serialisable description
 * of an apartment shell (walls / openings / rooms) that the Floor Plan Editor
 * mutates and the 3D apartment can render. It is intentionally decoupled from
 * the fixed `apartment/constants.ts` types (which use a closed `RoomId` union):
 * a user-authored plan has arbitrary string room ids.
 *
 * Coordinates are metres in the apartment frame (0,0 at the NW corner, +X east,
 * +Z south) — the same frame the rest of the app uses.
 */

export type PlanVec2 = [number, number];

export interface PlanWall {
  id: string;
  start: PlanVec2;
  end: PlanVec2;
  thickness: 'external' | 'internal';
  /** Optional cap on solid-wall height (parapets on balconies); floor→ceiling when unset. */
  topHeight?: number;
}

export interface PlanOpening {
  id: string;
  kind: 'door' | 'window';
  /** Wall this opening cuts through. */
  wallId: string;
  /** Distance from the wall's start along its length, to the opening's start. */
  offset: number;
  width: number;
  /** Bottom edge above floor (0 for doors). */
  sill: number;
  /** Top edge above floor. */
  head: number;
}

export interface PlanRoom {
  id: string;
  name: string;
  /** NW corner of the room's interior rectangle. */
  origin: PlanVec2;
  width: number;
  depth: number;
  /** Optional second rectangle for L-shaped rooms (offset from `origin`). */
  extension?: { offset: PlanVec2; width: number; depth: number };
  /** Optional per-room ceiling height. */
  ceilingHeight?: number;
  /** Optional floor finish (catalog material id); defaults to oak in the shell. */
  floor?: string;
}

export interface FloorPlan {
  id: string;
  name: string;
  ceilingHeight: number;
  /** External footprint (metres) for the floor slab + grid. */
  extent: PlanVec2;
  walls: PlanWall[];
  openings: PlanOpening[];
  rooms: PlanRoom[];
}

/** Interior floor area of a room (m²), including any L-shape extension. */
export function planRoomArea(r: PlanRoom): number {
  const main = r.width * r.depth;
  const ext = r.extension ? r.extension.width * r.extension.depth : 0;
  return main + ext;
}

/** Total interior area of a plan (sum of room areas), m². */
export function planTotalArea(plan: FloorPlan): number {
  return plan.rooms.reduce((sum, r) => sum + planRoomArea(r), 0);
}

/** Length of a wall (m). */
export function wallLength(w: PlanWall): number {
  return Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
}
