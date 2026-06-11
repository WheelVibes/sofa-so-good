/**
 * Stair-connectivity advisory for multi-storey plans (F13 / ML6b).
 *
 * Follows the HDB-compliance-hints pattern (`hdbCompliance.ts`): a pure,
 * non-binding check producing `Advisory` entries that the report surfaces
 * alongside the other plan advisories. It flags any upper storey that no
 * staircase reaches — a staircase "connects" two adjacent storeys when it
 * stands on the lower one (its `levelId`) and its footprint lands within BOTH
 * the lower storey's rooms and an upper room/landing in plan XZ (the
 * two-storey templates stack a 'Stair Landing' over the stair hall for
 * exactly this). Stairs are ordinary furniture (the parametric `staircase`
 * family, F8/C171) — this is advice, never a hard constraint, matching how
 * Sweet Home 3D / Planner 5D treat stairs.
 *
 * Pure + unit-testable: floorplan types + the OBB footprint helper only.
 */

import { type OBB, obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import { GROUND_LEVEL_ID, type PlanLevel, planLevels } from '../floorplan/levels'
import { type FloorPlan, pointInRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import type { Advisory } from './hdbCompliance'

/** The built-in parametric staircase family's def id (F8/C171). */
export const STAIRCASE_DEF_ID = 'staircase'

const CITE_STAIRS = 'Multi-storey layout — stair connectivity, guidance only'

/** An item counts as a staircase when it is the parametric staircase family
 *  (by def id, or any def rendering the Staircase primitive). */
export function isStaircaseItem(
  item: Pick<FurnitureItem, 'defId'>,
  def: FurnitureDef | undefined,
): boolean {
  if (item.defId === STAIRCASE_DEF_ID) return true
  return def?.kind === 'parametric' && def.primitive === 'Staircase'
}

/** Sample points of a footprint OBB: corners + centre + edge midpoints —
 *  enough resolution for "does the stair land inside this room" advice. */
function footprintSamples(obb: OBB): [number, number][] {
  const corners = obbCorners(obb)
  const pts: [number, number][] = [...corners, [obb.cx, obb.cz]]
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!
    const b = corners[(i + 1) % corners.length]!
    pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
  }
  return pts
}

/** Whether any sample of the footprint lies inside any room of the level. */
function footprintTouchesLevel(samples: [number, number][], level: PlanLevel): boolean {
  return samples.some(([x, z]) => level.rooms.some((r) => pointInRoom(r, x, z)))
}

/**
 * Advisories for upper storeys unreachable by any staircase. Empty for
 * single-level plans. Levels are checked bottom-up: each storey must be
 * served by a staircase standing on the storey directly below it whose
 * footprint overlaps rooms of both storeys.
 */
export function buildStairAdvisories(
  plan: FloorPlan,
  items: FurnitureItem[],
  getDef: (id: string) => FurnitureDef | undefined,
): Advisory[] {
  const levels = [...planLevels(plan)].sort((a, b) => a.elevation - b.elevation)
  if (levels.length < 2) return []

  // Precompute each staircase's level + footprint samples once.
  const stairs: Array<{ levelId: string; samples: [number, number][] }> = []
  for (const it of items) {
    const def = getDef(it.defId)
    if (!isStaircaseItem(it, def)) continue
    if (!def) continue // can't reason about a footprint without the def
    stairs.push({
      levelId: it.levelId ?? GROUND_LEVEL_ID,
      samples: footprintSamples(itemFootprint(it, def)),
    })
  }

  const out: Advisory[] = []
  for (let i = 1; i < levels.length; i++) {
    const below = levels[i - 1]!
    const above = levels[i]!
    const reachable = stairs.some(
      (s) =>
        s.levelId === below.id &&
        footprintTouchesLevel(s.samples, below) &&
        footprintTouchesLevel(s.samples, above),
    )
    if (reachable) continue
    out.push({
      id: `stair-unreachable:${above.id}`,
      severity: 'caution',
      title: `No staircase reaches ${above.name}`,
      detail:
        `${above.name} (at ${above.elevation.toFixed(1)} m) has no connecting staircase: ` +
        `place a Staircase (catalog → Others) on ${below.name} so that its run lands ` +
        `within one of ${above.name}'s rooms — typically the stair hall below and the ` +
        'landing above share the same footprint. This is layout guidance only; the ' +
        'design still works without it.',
      cite: CITE_STAIRS,
    })
  }
  return out
}
