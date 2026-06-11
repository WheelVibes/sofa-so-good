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

/** The entries sitting on one storey (`levelId` absent = ground). Works for any
 *  level-tagged record (furniture items, plan lights, electrical points) — the
 *  per-storey filter every fanned-out 2D diagram uses. */
export function itemsOnLevel<T extends Pick<FurnitureItem, 'levelId'>>(
  items: T[],
  levelId: string,
): T[] {
  return items.filter((it) => (it.levelId ?? GROUND_LEVEL_ID) === levelId)
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

/** A pseudo-plan whose walls/openings/rooms/ceilingHeight are one level's —
 *  lets every existing single-level geometry helper (wallBoxes, room shells,
 *  collision walls, …) work per storey unchanged. Ground returns the plan
 *  itself (same reference, no realloc). */
export function levelAsPlan(plan: FloorPlan, level: PlanLevel): FloorPlan {
  if (level.id === GROUND_LEVEL_ID) {
    // Strip upperLevels so the result is genuinely single-storey — recursive
    // consumers (e.g. daylight's per-level fan-out) must terminate. Keep the
    // same reference for already-single-storey plans (the common case).
    return isMultiLevel(plan) ? { ...plan, upperLevels: undefined } : plan
  }
  return {
    ...plan,
    walls: level.walls,
    openings: level.openings,
    rooms: level.rooms,
    ceilingHeight: level.ceilingHeight ?? plan.ceilingHeight,
    upperLevels: undefined,
  }
}

/** The levels to render for a view selection ('all' | a level id). An unknown
 *  or stale id (plan switched) falls back to every level. */
export function visibleLevels(plan: FloorPlan, viewLevelId: string): PlanLevel[] {
  const levels = planLevels(plan)
  if (viewLevelId === 'all') return levels
  const match = levels.filter((l) => l.id === viewLevelId)
  return match.length > 0 ? match : levels
}

/** The storey a first-person walker stands on for a View→Levels selection
 *  (ML6c): 'all' (or an unknown/stale id) walks the ground floor; a level id
 *  walks that storey — the walker teleports there and collides with ITS
 *  walls/items, at ITS floor elevation. */
export function walkLevel(plan: FloorPlan, viewLevelId: string): PlanLevel {
  if (viewLevelId === 'all') return planLevels(plan)[0]!
  return levelById(plan, viewLevelId)
}

/** Spawn point for walking a storey: the centre of its first room (templates
 *  list a sensible arrival room first), with the room's depth as a framing
 *  span. Null when the storey has no rooms (nowhere sensible to stand). */
export function levelSpawnPoint(level: PlanLevel): { x: number; z: number; span: number } | null {
  const r = level.rooms[0]
  if (!r) return null
  return { x: r.origin[0] + r.width / 2, z: r.origin[1] + r.depth / 2, span: r.depth }
}

/** Fields of a storey the 2D editor mutates. */
export interface LevelGeometry {
  walls: PlanWall[]
  openings: PlanOpening[]
  rooms: PlanRoom[]
}

/**
 * Apply a geometry update to ONE storey of the plan (the 2D editor's level
 * routing — ML4). Ground (or absent/unknown ids) edits the plan's own arrays;
 * an upper level id maps the update over that entry in `upperLevels`. The
 * updater gets the level's current geometry and returns the changed fields.
 */
export function withLevelGeometry(
  plan: FloorPlan,
  levelId: string | undefined,
  update: (g: LevelGeometry) => Partial<LevelGeometry>,
): FloorPlan {
  const level = levelById(plan, levelId)
  if (level.id === GROUND_LEVEL_ID) {
    return { ...plan, ...update({ walls: plan.walls, openings: plan.openings, rooms: plan.rooms }) }
  }
  return {
    ...plan,
    upperLevels: (plan.upperLevels ?? []).map((l) =>
      l.id === level.id
        ? { ...l, ...update({ walls: l.walls, openings: l.openings, rooms: l.rooms }) }
        : l,
    ),
  }
}
