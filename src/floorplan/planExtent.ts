import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { isDefaultPlan } from './planGeometry'
import type { FloorPlan } from './types'
import { planBounds } from './types'

/**
 * Plan footprint (width, depth) in metres: the default flat's fixed apartment
 * extents, or the plan's own bounds for anything else.
 *
 * PLAN-EXTENT. This one-liner already lived inside `OrbitCamera`, where it was
 * right. Two other places sized geometry from the bare `APARTMENT_EXT_W/D`
 * constants with no plan check — the transparent floor CLICK PLANES that
 * `CommentPins` and `TapeMeasure` raycast against. Those planes span the
 * apartment box plus a 4 m pad, i.e. z from -4 to 13.375, so on
 * `tpl-terrace-ground` (14.0 m deep) the last **0.625 m** of the house could
 * receive neither a comment pin nor a tape-measure pick, and `tpl-hdb-jumbo`
 * (13.2 m) had only 0.175 m of margin left — one template edit from the same
 * bug. Sharing the helper is what stops the three copies from drifting again.
 */
export function planExtent(plan: FloorPlan): [number, number] {
  return isDefaultPlan(plan) ? [APARTMENT_EXT_W, APARTMENT_EXT_D] : planBounds(plan)
}
