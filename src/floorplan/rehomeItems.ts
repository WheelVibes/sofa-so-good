/**
 * Pull furniture back inside the home after the plan under it changed.
 *
 * Items are stored in WORLD coordinates with no room back-pointer, so swapping
 * the plan (reset to the default flat, load a saved apartment, apply a template,
 * import) can leave a piece standing in a void — outside every room of its
 * storey, or buried in what is now a wall. This finds those and clamps each to
 * the nearest point inside the nearest room; items already inside a room are
 * returned untouched (same object reference, so an unchanged list is cheap to
 * detect).
 *
 * Shared by the load path (`state/schema.ts`, where a saved design meets a newer
 * plan revision) and every in-session plan replacement (`floorPlanSlice`'s
 * `replaceFloorPlan`) so the two can't drift — the load path used to be the only
 * one that did this, which is why an in-session "Reset to HDB" left the old
 * furniture floating.
 *
 * Pure: takes the plan + items and a `skip` predicate for defs that are anchored
 * to something other than the floor (wall-mounted, non-colliding), so it needs
 * no furniture-catalog import.
 */
import { GROUND_LEVEL_ID, levelAsPlan, planLevels } from './levels'
import { planRoomRects } from './planRoomShell'
import { decomposeRectilinear, type Rect2 } from './rectilinear'
import { type FloorPlan, type PlanRoom, pointInRoom } from './types'

/** The minimum an item's centre may sit outside a room rect before it counts as
 *  stranded — a little slack for a piece placed flush against a wall. */
export const REHOME_OUT_TOL = 0.2

/** How far inside the room edge a rescued item is placed, so its BODY lands
 *  inside too rather than its centre landing exactly on the wall line. */
const REHOME_INSET = 0.3

/** The minimum an item needs from a plan item to be re-homed. */
export interface RehomableItem {
  defId: string
  position: [number, number]
  levelId?: string
}

/**
 * Returns `items` with every stranded piece moved inside the nearest room of its
 * storey. Untouched items keep their identity, and the array itself is returned
 * unchanged when nothing moved.
 *
 * `skip` marks defs that must not be moved — wall-mounted and no-clip pieces are
 * positioned against geometry other than the floor, so "outside every room" is a
 * normal state for them.
 */
export function rehomeStrandedItems<T extends RehomableItem>(
  plan: FloorPlan,
  items: readonly T[],
  opts: { skip?: (defId: string) => boolean } = {},
): T[] {
  if (items.length === 0) return items as T[]
  const levelPlans = new Map(planLevels(plan).map((l) => [l.id, levelAsPlan(plan, l)]))
  let moved = false
  const out = items.map((it) => {
    const next = rehomeOne(it, levelPlans, opts.skip)
    if (next !== it) moved = true
    return next
  })
  return moved ? out : (items as T[])
}

/**
 * Rects covering a room, used BOTH for the flush-to-wall tolerance and as the
 * clamp targets. A polygon room is decomposed into its real rects rather than
 * taking `planRoomRects`' bounding box: for an L-shaped room the box also covers
 * the notch — the neighbouring room — so a padded box would call a stranded item
 * "inside" and, worse, could clamp one INTO the neighbour.
 */
function roomCoverRects(r: PlanRoom): Rect2[] {
  if (r.polygon && r.polygon.length >= 3) return decomposeRectilinear(r.polygon)
  return planRoomRects(r)
}

function rehomeOne<T extends RehomableItem>(
  it: T,
  levelPlans: Map<string, FloorPlan>,
  skip?: (defId: string) => boolean,
): T {
  if (skip?.(it.defId)) return it
  const lp = levelPlans.get(it.levelId ?? GROUND_LEVEL_ID) ?? levelPlans.get(GROUND_LEVEL_ID)
  // No plan / no rooms to move into: leave the item exactly where it is rather
  // than inventing a position (an empty canvas is a legitimate state).
  if (!lp || lp.rooms.length === 0) return it
  const [x, z] = it.position
  const rects = lp.rooms.flatMap(roomCoverRects)
  const inside =
    lp.rooms.some((r) => pointInRoom(r, x, z)) ||
    rects.some(
      (rc) =>
        x >= rc.x0 - REHOME_OUT_TOL &&
        x <= rc.x1 + REHOME_OUT_TOL &&
        z >= rc.z0 - REHOME_OUT_TOL &&
        z <= rc.z1 + REHOME_OUT_TOL,
    )
  if (inside) return it
  let best: [number, number] | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const rc of rects) {
    const inset = Math.min(REHOME_INSET, (rc.x1 - rc.x0) / 2, (rc.z1 - rc.z0) / 2)
    const cx = Math.min(Math.max(x, rc.x0 + inset), rc.x1 - inset)
    const cz = Math.min(Math.max(z, rc.z0 + inset), rc.z1 - inset)
    const d = Math.hypot(cx - x, cz - z)
    if (d < bestD) {
      bestD = d
      best = [cx, cz]
    }
  }
  return best ? { ...it, position: best } : it
}
