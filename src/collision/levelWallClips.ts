/**
 * Level-aware wall-clip scan (F13/ML3). `findWallClips` tests items against ONE
 * wall set; on a multi-storey plan that would falsely flag an upper-storey item
 * as "embedded in" a ground wall directly below it. This wrapper groups items by
 * storey and resolves each storey's own collision walls (ground keeps the
 * caller's precomputed set — door-aware on the default flat — and each upper
 * level builds its walls via `levelAsPlan` + `planCollisionWalls`, the same
 * routing placement collision uses in `placementWalls.ts`).
 *
 * Single-storey plans short-circuit to a plain `findWallClips` call, so every
 * existing caller's behaviour is byte-identical there.
 */
import { GROUND_LEVEL_ID, isMultiLevel, levelAsPlan, planLevels } from '../floorplan/levels'
import { planCollisionWalls } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { findWallClips } from './placement'
import type { CollisionWall } from './walls'

/**
 * Ids of items poking into a wall body **on their own storey**.
 *
 * @param groundWalls the resolved collision walls for the ground floor (the
 *        one wall set callers already compute today — fixed default-flat walls
 *        or `planCollisionWalls(plan, doors)`); may be `[]` for partial plans,
 *        which skips the ground check exactly as before.
 * @param doors door open-states used to resolve each upper storey's walls.
 */
export function findWallClipsByLevel(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
  doors: Record<string, { open: boolean }>,
  groundWalls: CollisionWall[],
): string[] {
  if (!isMultiLevel(plan)) return findWallClips(items, defs, groundWalls)

  // Group items by storey; unknown/stale level ids degrade to ground, matching
  // `levelById`'s resolution (the item renders on the ground floor too).
  const levels = planLevels(plan)
  const known = new Set(levels.map((l) => l.id))
  const byLevel = new Map<string, FurnitureItem[]>()
  for (const it of items) {
    const id = it.levelId && known.has(it.levelId) ? it.levelId : GROUND_LEVEL_ID
    const list = byLevel.get(id)
    if (list) list.push(it)
    else byLevel.set(id, [it])
  }

  const out: string[] = []
  for (const level of levels) {
    const levelItems = byLevel.get(level.id)
    if (!levelItems) continue
    const walls =
      level.id === GROUND_LEVEL_ID
        ? groundWalls
        : planCollisionWalls(levelAsPlan(plan, level), doors)
    out.push(...findWallClips(levelItems, defs, walls))
  }
  return out
}
