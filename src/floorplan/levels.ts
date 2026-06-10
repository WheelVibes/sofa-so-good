/**
 * Multi-storey resolution layer (F13) — the ONE place that knows a plan can
 * have levels. The plan's top-level walls/openings/rooms are the ground
 * floor; `upperLevels` adds storeys at an elevation offset. Everything here
 * is pure; consumers stay level-agnostic by resolving through these helpers.
 * Design: docs/research/multi-level-design.md.
 */

import type { FurnitureItem } from '../furniture/types'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from './types'

/** The ground floor's well-known level id (items/rooms with no explicit level). */
export const GROUND_LEVEL_ID = 'ground'

/** A uniform view of one storey (ground or upper). */
export interface PlanLevel {
  id: string
  name: string
  /** Floor-slab top height above the ground floor's y=0 (m). */
  elevation: number
  ceilingHeight?: number
  walls: PlanWall[]
  openings: PlanOpening[]
  rooms: PlanRoom[]
}

/** All storeys of a plan, ground first (always present), then upper levels. */
export function planLevels(plan: FloorPlan): PlanLevel[] {
  const ground: PlanLevel = {
    id: GROUND_LEVEL_ID,
    name: 'Ground floor',
    elevation: 0,
    walls: plan.walls,
    openings: plan.openings,
    rooms: plan.rooms,
  }
  return [ground, ...(plan.upperLevels ?? [])]
}

/** True when the plan has at least one storey above the ground floor. */
export function isMultiLevel(plan: FloorPlan): boolean {
  return (plan.upperLevels?.length ?? 0) > 0
}

/** One level by id; the ground level for `undefined`/'ground'/unknown ids
 *  (unknown ids degrade to ground rather than vanishing the geometry). */
export function levelById(plan: FloorPlan, levelId: string | undefined): PlanLevel {
  const levels = planLevels(plan)
  if (!levelId || levelId === GROUND_LEVEL_ID) return levels[0]
  return levels.find((l) => l.id === levelId) ?? levels[0]
}

/** Floor elevation (m above ground y=0) for a level id. */
export function levelElevation(plan: FloorPlan, levelId: string | undefined): number {
  return levelById(plan, levelId).elevation
}

/** The level an item sits on (ground when `levelId` is absent/unknown). */
export function levelOfItem(plan: FloorPlan, item: Pick<FurnitureItem, 'levelId'>): PlanLevel {
  return levelById(plan, item.levelId)
}

/** The level containing a room id, or null when no level has it. */
export function levelOfRoom(plan: FloorPlan, roomId: string): PlanLevel | null {
  for (const level of planLevels(plan)) {
    if (level.rooms.some((r) => r.id === roomId)) return level
  }
  return null
}

/** Every room across every storey (ground rooms first). Use this instead of
 *  `plan.rooms` wherever "all the home's rooms" is meant (reports, score,
 *  finishes pruning, room pickers) — `plan.rooms` is ground-floor-only. */
export function allPlanRooms(plan: FloorPlan): PlanRoom[] {
  if (!isMultiLevel(plan)) return plan.rooms
  return planLevels(plan).flatMap((l) => l.rooms)
}
