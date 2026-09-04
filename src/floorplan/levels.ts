/**
 * Multi-storey resolution layer (F13) — the ONE place that knows a plan can
 * have levels. The plan's top-level walls/openings/rooms are the ground
 * floor; `upperLevels` adds storeys at an elevation offset. Everything here
 * is pure; consumers stay level-agnostic by resolving through these helpers.
 * Design: docs/research/multi-level-design.md.
 */

import type { FurnitureItem } from '../furniture/types'
import {
  type FloorPlan,
  type PlanOpening,
  type PlanRoom,
  type PlanUpperLevel,
  type PlanWall,
  planTotalArea,
  pointInRoom,
} from './types'

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
    name: plan.groundName?.trim() || 'Ground floor',
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
  // Notes are top-level + level-tagged; scope them to this storey so per-level
  // consumers (the drawing-set sheets) don't show every storey's annotations.
  const notesFor = (id: string) =>
    plan.notes ? plan.notes.filter((n) => (n.levelId ?? GROUND_LEVEL_ID) === id) : undefined
  if (level.id === GROUND_LEVEL_ID) {
    // Strip upperLevels so the result is genuinely single-storey — recursive
    // consumers (e.g. daylight's per-level fan-out) must terminate. Keep the
    // same reference for already-single-storey plans (the common case).
    return isMultiLevel(plan)
      ? { ...plan, upperLevels: undefined, notes: notesFor(GROUND_LEVEL_ID) }
      : plan
  }
  return {
    ...plan,
    walls: level.walls,
    openings: level.openings,
    rooms: level.rooms,
    ceilingHeight: level.ceilingHeight ?? plan.ceilingHeight,
    upperLevels: undefined,
    notes: notesFor(level.id),
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

/**
 * Storeys to render while WALKING a selected level: the walked one plus everything below it.
 *
 * **The defect this fixes (item `(g)`).** `visibleLevels` returns only the matching level, and
 * storeys unmount when hidden so picking cannot hit them — correct for the dollhouse and the 2D
 * editor, where isolating a floor is the point. It is wrong in first person, where you are standing
 * inside the building: `walkLevel(plan, 'all')` walks the GROUND floor, so the only way to walk an
 * upper storey is to select it, which is exactly what hides the storey beneath. Walk `tpl-loft`'s
 * mezzanine and there is **no floor, no far wall and no room below over the guard rail — just a
 * pale sky gradient**, measured at ceiling-band luma **28.2** against 129–185 for the rest of the
 * storey.
 *
 * Only storeys BELOW are added, never above: standing on the ground floor of a maisonette should
 * not render the upper storey's furniture hanging over your head, and the ceiling above you is the
 * thing that makes an interior read as enclosed.
 *
 * The caller must also suppress the CEILING of every storey below the walked one, or the sky hole
 * is merely replaced by the top of a ceiling slab seen from above.
 */
export function visibleLevelsForWalk(plan: FloorPlan, viewLevelId: string): PlanLevel[] {
  const levels = planLevels(plan)
  if (viewLevelId === 'all') return levels
  const walked = levels.find((l) => l.id === viewLevelId)
  if (!walked) return levels
  return levels.filter((l) => l.elevation <= walked.elevation)
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

/** A deep clone of one storey's geometry with **fresh ids** for every wall,
 *  opening and room, plus the old→new id maps so callers can re-key per-room /
 *  per-wall data (finishes, items). Used by `duplicateLevel`. */
export interface ClonedLevelGeometry extends LevelGeometry {
  /** old room id → new room id (room ids are plan-unique across storeys). */
  roomIdMap: Record<string, string>
  /** old wall id → new wall id (wall-accent finish keys embed the wall id). */
  wallIdMap: Record<string, string>
}

/**
 * Deep-clone a storey's walls/openings/rooms with brand-new ids, preserving
 * internal references: each opening's `wallId` is re-pointed at the cloned wall.
 * Pure — `genId(prefix)` supplies fresh ids so the caller controls id format.
 * Returns the clones plus the id maps for re-keying finishes/items.
 */
export function cloneLevelGeometry(
  geom: LevelGeometry,
  genId: (prefix: string) => string,
): ClonedLevelGeometry {
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
  const wallIdMap: Record<string, string> = {}
  const roomIdMap: Record<string, string> = {}
  const walls = geom.walls.map((w) => {
    const c = clone(w)
    c.id = genId('w')
    wallIdMap[w.id] = c.id
    return c
  })
  const rooms = geom.rooms.map((r) => {
    const c = clone(r)
    c.id = genId('r')
    roomIdMap[r.id] = c.id
    return c
  })
  const openings = geom.openings.map((o) => {
    const c = clone(o)
    c.id = genId('o')
    c.wallId = wallIdMap[o.wallId] ?? o.wallId
    return c
  })
  return { walls, openings, rooms, roomIdMap, wallIdMap }
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

/** Default floor-to-floor gap between two stacked storeys (m) — the concrete
 *  slab thickness added atop a storey's ceiling before the next floor starts. */
const LEVEL_SLAB_HEIGHT = 0.3

/**
 * Recompute every upper level's `elevation` from a (possibly reordered) array
 * so each storey's floor sits directly above the storey BELOW it: level i's
 * elevation is `(elevation of level i-1) + (ceiling height of level i-1) +
 * slab` — the ground floor (elevation 0) stands in as "level 0" for the first
 * upper storey, using the plan's ground `ceilingHeight`. A level's OWN ceiling
 * height only ever affects the storey ABOVE it, never its own elevation.
 * Pure — returns fresh level objects; the input array/objects are untouched.
 * Used by `moveLevel` after a reorder (BUG-6: the previous implementation
 * kept each level's own ceiling height for its own elevation, which uses the
 * wrong storey's height and mis-stacks the whole array above the first edit).
 */
export function restackLevelElevations(
  levels: PlanUpperLevel[],
  groundCeilingHeight: number,
  slab: number = LEVEL_SLAB_HEIGHT,
): PlanUpperLevel[] {
  let top = 0
  let belowCeiling = groundCeilingHeight
  return levels.map((l) => {
    const elevation = top + belowCeiling + slab
    top = elevation
    belowCeiling = l.ceilingHeight ?? groundCeilingHeight
    return { ...l, elevation }
  })
}

/**
 * Total interior floor area across EVERY storey (m²).
 *
 * `types.ts:planTotalArea` is a legitimate SINGLE-LEVEL helper — the plan editor
 * calls it per storey to show that storey's total, which is correct — and it
 * lives in `types.ts`, which cannot import this module without a cycle. This is
 * the whole-home counterpart, for callers that mean "the area of the home".
 * Passing a whole plan to `planTotalArea` silently reports the ground floor only
 * (F13); that was the bug at three call sites fixed in v0.31.5.276.
 */
export function planTotalAreaAllLevels(plan: FloorPlan): number {
  return planLevels(plan).reduce((sum, level) => sum + planTotalArea(levelAsPlan(plan, level)), 0)
}

/**
 * Every wall in the home, across all storeys.
 *
 * The companion to {@link allPlanRooms}. `plan.walls` is the GROUND FLOOR ONLY
 * (F13), so a whole-home consumer needs this — and before it existed the
 * `planLevels(plan).flatMap(l => l.walls)` idiom was hand-written in five
 * modules, which is exactly how the ground-only reads spread in the first place.
 */
export function allPlanWalls(plan: FloorPlan): PlanWall[] {
  return planLevels(plan).flatMap((l) => (Array.isArray(l.walls) ? l.walls : []))
}

/** Every opening in the home, across all storeys. See {@link allPlanWalls}. */
export function allPlanOpenings(plan: FloorPlan): PlanOpening[] {
  return planLevels(plan).flatMap((l) => (Array.isArray(l.openings) ? l.openings : []))
}

/**
 * The room an item stands in, searched on the item's OWN storey only.
 *
 * The naive `plan.rooms.find((r) => pointInRoom(r, x, z))` is wrong twice over
 * in a multi-storey home: it cannot see an upstairs room at all, and once it
 * could (via `allPlanRooms`) it would match a room DIRECTLY ABOVE OR BELOW the
 * item, because a plan's storeys share one XZ coordinate space. Room ids are
 * plan-unique, so the mis-attribution is silent — a bed upstairs would be
 * costed into the living room beneath it.
 *
 * Returns `null` for an item outside every room on its storey (the callers'
 * "Unassigned" bucket).
 */
export function roomAtItem(
  plan: FloorPlan,
  item: Pick<FurnitureItem, 'levelId' | 'position'>,
): PlanRoom | null {
  const level = levelOfItem(plan, item)
  const [x, z] = item.position
  return level.rooms.find((r) => pointInRoom(r, x, z)) ?? null
}

/**
 * The items standing in one room, searched on THAT ROOM's storey only.
 *
 * The inverse of {@link roomAtItem}, and wrong in the same way when
 * hand-rolled: `items.filter((it) => pointInRoom(room, x, z))` sweeps up
 * furniture from every storey that happens to overlap the room's XZ, so a
 * ground-floor "Clear room" would delete the loft's furniture too.
 *
 * Returns `[]` for an unknown room id.
 */
export function itemsInRoom<T extends Pick<FurnitureItem, 'levelId' | 'position'>>(
  plan: FloorPlan,
  items: readonly T[],
  roomId: string,
): T[] {
  const level = levelOfRoom(plan, roomId)
  if (!level) return []
  const room = level.rooms.find((r) => r.id === roomId)
  if (!room) return []
  return items.filter(
    (it) =>
      (it.levelId ?? GROUND_LEVEL_ID) === level.id &&
      pointInRoom(room, it.position[0], it.position[1]),
  )
}

/**
 * A copy of the plan with `fn` applied to EVERY storey's rooms.
 *
 * The bare `{ ...plan, rooms: plan.rooms.map(fn) }` is ground-only, so a
 * whole-home room rewrite (a finish preset, an OCS re-finish, a screed pass)
 * silently left every upstairs room untouched. Levels with no rooms array are
 * passed through unchanged rather than gaining an empty one.
 */
export function mapPlanRooms(plan: FloorPlan, fn: (room: PlanRoom) => PlanRoom): FloorPlan {
  const next: FloorPlan = { ...plan, rooms: (plan.rooms ?? []).map(fn) }
  if (!isMultiLevel(plan)) return next
  return {
    ...next,
    upperLevels: plan.upperLevels?.map((l) =>
      Array.isArray(l.rooms) ? { ...l, rooms: l.rooms.map(fn) } : l,
    ),
  }
}

/**
 * The single-storey plan a NEW item should be placed against.
 *
 * `itemsSlice.addItem` derives an item's `levelId` from the open room editor, so
 * anything that resolves geometry at placement time (opening snaps, wall
 * clearance) has to resolve the SAME storey or the two disagree: a curtain
 * dropped while editing an upstairs room is tagged upstairs, but a snap searched
 * against `plan.walls` either finds no window at all or snaps it to a GROUND
 * window's coordinates. Mirrors `collision/placementWalls.ts`'s level rule.
 */
export function placementLevelPlan(s: {
  floorPlan: FloorPlan
  roomEditor: { active: boolean; roomId: string | null }
}): FloorPlan {
  if (s.roomEditor.active && s.roomEditor.roomId) {
    const level = levelOfRoom(s.floorPlan, s.roomEditor.roomId)
    if (level && level.id !== GROUND_LEVEL_ID) return levelAsPlan(s.floorPlan, level)
  }
  return s.floorPlan
}

/**
 * The room containing a level-tagged POINT, searched on that point's own storey.
 *
 * The counterpart of {@link roomAtItem} for records that carry `{x, z}` rather
 * than a `position` tuple — MEP points, lights, comment pins. Same hazard: a
 * plan's storeys share one XZ space, so a bare `pointInRoom` over
 * `allPlanRooms` returns whichever room happens to sit at that coordinate on
 * any floor.
 */
export function roomAtPoint(
  plan: FloorPlan,
  x: number,
  z: number,
  levelId?: string,
): PlanRoom | null {
  const level = levelById(plan, levelId)
  return level.rooms.find((r) => pointInRoom(r, x, z)) ?? null
}
