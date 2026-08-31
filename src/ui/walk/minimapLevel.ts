import { levelAsPlan, walkLevel } from '../../floorplan/levels'
import type { FloorPlan } from '../../floorplan/types'

/** The storey the walk-mode minimap must draw, as a single-storey plan plus its
 *  level id.
 *
 *  MINIMAP-LEVEL. The minimap used to read `state.floorPlan` raw, so on a
 *  multi-storey plan it drew the GROUND floor no matter which storey the walker
 *  was standing on: measured on `tpl-hdb-maisonette` at the `emu-master` pose
 *  (upper level `em-up`, elevation 2.9 m), the map showed the ground shell, the
 *  live label read "LIVING / DINING", and the dots were the ground floor's
 *  furniture.
 *
 *  The lever is NOT to re-derive the storey here — `FirstPersonCamera` already
 *  picks the walked storey with `levelAsPlan(plan, walkLevel(plan, viewLevelId))`
 *  for its collision walls. Reusing that exact pair is what makes the map agree
 *  with the camera BY CONSTRUCTION rather than by coincidence: whatever storey
 *  the walker can collide with is the storey the map draws.
 *
 *  `walkLevel` maps the 'all' selection to the ground floor, matching where
 *  `FirstPersonCamera` stands the walker for 'all'. `levelAsPlan` returns the
 *  SAME plan reference for an already-single-storey plan, so the common case
 *  keeps `useMemo` identity and re-renders nothing extra. */
export interface MinimapLevelView {
  /** The storey as a self-contained single-storey plan (`upperLevels` stripped). */
  plan: FloorPlan
  /** That storey's id — filter furniture with `itemsOnLevel(items, levelId)`. */
  levelId: string
}

export function minimapLevelView(plan: FloorPlan, viewLevelId: string): MinimapLevelView {
  const level = walkLevel(plan, viewLevelId)
  return { plan: levelAsPlan(plan, level), levelId: level.id }
}
