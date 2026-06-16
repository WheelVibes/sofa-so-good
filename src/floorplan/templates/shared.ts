/** Shared geometry + builder helpers for the starter floor-plan templates
 *  (`./hdb`, `./condo`). Pure functions over the plan model. */
import type { FloorPlan, HousingType, PlanOpening, PlanWall } from '../types'

export const T = 0.1 // inset of walls from the nominal footprint edge

/** Four external perimeter walls around a W×D footprint (inset by T). */
export function perimeter(prefix: string, W: number, D: number): PlanWall[] {
  const a: [number, number] = [T, T]
  const b: [number, number] = [W - T, T]
  const c: [number, number] = [W - T, D - T]
  const d: [number, number] = [T, D - T]
  const ext: PlanWall['thickness'] = 'external'
  return [
    { id: `${prefix}-n`, start: a, end: b, thickness: ext },
    { id: `${prefix}-e`, start: b, end: c, thickness: ext },
    { id: `${prefix}-s`, start: c, end: d, thickness: ext },
    { id: `${prefix}-w`, start: d, end: a, thickness: ext },
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
): FloorPlan['rooms'][number] {
  return { id, name, origin: [x, z], width: w, depth: d, floor }
}

export const PARAPET = 1.0 // balcony parapet height (m)

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
  return { ...plan, category: { housingType, projectName, apartmentType } }
}
