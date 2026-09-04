/** Shared geometry + builder helpers for the starter floor-plan templates
 *  (`./hdb`, `./condo`). Pure functions over the plan model. */
import { withInwardDoorSwings } from '../doorSwing'
import type { FloorPlan, HousingType, PlanOpening, PlanWall, RoomCategory } from '../types'

export const T = 0.1 // inset of walls from the nominal footprint edge

/** Four external perimeter walls around a W×D footprint (inset by T). */
/**
 * The four external walls of a storey, N and E laid out forwards, S and W backwards.
 *
 * `topHeight` exists for MULTI-STOREY plans. A wall is built at
 * `wall.topHeight ?? plan.ceilingHeight` (`planGeometry.ts`), so a ground storey with a 2.6 m
 * ceiling under an upper storey whose floor sits at 2.9 m leaves a **0.3 m band of envelope with
 * no wall in it** — the floor-slab zone. Measured on every multi-storey template
 * (`v0.31.7.209`): `tpl-hdb-maisonette` and `tpl-terrace-ground` both had exactly 0.3 m open,
 * and a horizontal ray at 2.75 m hit nothing by construction. Pass the NEXT storey's elevation
 * and the envelope is continuous. Single-storey plans pass nothing and are unchanged.
 */
export function perimeter(prefix: string, W: number, D: number, topHeight?: number): PlanWall[] {
  const a: [number, number] = [T, T]
  const b: [number, number] = [W - T, T]
  const c: [number, number] = [W - T, D - T]
  const d: [number, number] = [T, D - T]
  const ext: PlanWall['thickness'] = 'external'
  const top = topHeight === undefined ? {} : { topHeight }
  return [
    { id: `${prefix}-n`, start: a, end: b, thickness: ext, ...top },
    { id: `${prefix}-e`, start: b, end: c, thickness: ext, ...top },
    { id: `${prefix}-s`, start: c, end: d, thickness: ext, ...top },
    { id: `${prefix}-w`, start: d, end: a, thickness: ext, ...top },
  ]
}

export function iwall(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'internal' }
}

export function door(id: string, wallId: string, offset: number, width = 0.9): PlanOpening {
  return { id, kind: 'door', wallId, offset, width, sill: 0, head: 2.1 }
}
export function window(id: string, wallId: string, offset: number, width = 1.4): PlanOpening {
  return { id, kind: 'window', wallId, offset, width, sill: 0.95, head: 2.1 }
}

export function room(
  id: string,
  name: string,
  x: number,
  z: number,
  w: number,
  d: number,
  floor: string,
  category?: RoomCategory,
): FloorPlan['rooms'][number] {
  return { id, name, origin: [x, z], width: w, depth: d, floor, category }
}

const PARAPET = 1.0 // balcony parapet height (m)

/** Balcony parapet wall (low solid wall via topHeight). */
export function parapet(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'internal', topHeight: PARAPET }
}

export function cat(
  plan: FloorPlan,
  housingType: HousingType,
  projectName: string,
  apartmentType: string,
): FloorPlan {
  // Bake the inward swing side into every door that doesn't declare one, so a
  // bath/WC door folds into the bathroom rather than out into the corridor (and
  // every consumer — 3D leaf, 2D symbol, clearance, schedule — reads one value).
  return { ...withInwardDoorSwings(plan), category: { housingType, projectName, apartmentType } }
}
