import { walkLevel } from '../../floorplan/levels'
import type { FloorPlan } from '../../floorplan/types'
import type { AttenuationWall } from './windowLightModifiers'

/**
 * Attenuation walls for the storey currently being viewed.
 *
 * SUN-CURTAIN-PLAN. `CurtainLightController` used to pass the default flat's
 * hardcoded `WALLS` no matter which plan was loaded, so on the other eighteen
 * templates the sun attenuation was computed against **a different building**.
 * That is worse than doing nothing: `curtainWindowOverlap` matches a curtain to
 * a window by position (within 0.5 m of the wall, angularly aligned, overlapping
 * its span), and both plans occupy overlapping coordinate space near the origin,
 * so a template curtain silently attenuated whichever DEFAULT-FLAT window it
 * happened to sit near. Measured: a blackout curtain drawn over the maisonette's
 * `em-kit-win` moved the scene factor to 0.878 — a real number produced by a
 * window that is not in the plan.
 *
 * Scoped to `walkLevel` for the same reason the aim ray is (WALK-AIM-PLAN):
 * curtains drawn upstairs should not be averaged against open windows on the
 * storey below.
 */
export function planAttenuationWalls(plan: FloorPlan, viewLevelId: string): AttenuationWall[] {
  const level = walkLevel(plan, viewLevelId)
  type Cut = AttenuationWall['cutouts'][number]
  const byWall = new Map<string, Cut[]>()
  for (const o of level.openings) {
    const list = byWall.get(o.wallId) ?? []
    list.push({
      kind: o.kind,
      offset: o.offset,
      width: o.width,
      sill: o.sill,
      head: o.head,
      refId: o.id,
    })
    byWall.set(o.wallId, list)
  }
  return level.walls.map((w) => ({
    id: w.id,
    start: w.start,
    end: w.end,
    cutouts: byWall.get(w.id) ?? [],
  }))
}
