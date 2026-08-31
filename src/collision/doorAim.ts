import { openingSegments } from '../floorplan/openingSegments'
import type { FloorPlan } from '../floorplan/types'
import type { AimSegment } from './aimRay'

/**
 * Walk-mode aim targets for the DOORS of a (single-storey) plan.
 *
 * WALK-AIM-PLAN. This used to be a module-level constant in `FirstPersonCamera`
 * built from `apartment/constants.ts` — the default 4-room flat's hardcoded
 * `DOORS`/`WALLS`. That is fine for exactly one of the nineteen shipped templates
 * and for no user-drawn plan at all: the maisonette's eight door ids (`em-main`,
 * `em-wc`, `em-study`, `emu-bed2-door`, ...) and the constants' eight
 * (`door-main`, `door-mainBedroom`, ...) overlap by ZERO, so walking any other
 * plan offered prompts at phantom doorways from a different apartment, wrote
 * `doors[...]` under ids the plan never uses, and left every real door
 * un-openable.
 *
 * Built from `openingSegments` — the same spans the minimap draws doorways with —
 * so what reads as a gap on the map is what the walker can actually open. Pass a
 * plan already narrowed to the walked storey (`levelAsPlan(plan, walkLevel(...))`);
 * an `AimSegment` is 2D, so an unscoped plan would let the walker open a door on
 * the floor below through the floor.
 */
export function doorAimSegments(plan: FloorPlan): AimSegment[] {
  const out: AimSegment[] = []
  for (const seg of openingSegments(plan)) {
    if (seg.kind !== 'door') continue
    out.push({
      id: seg.id,
      sx: seg.a[0],
      sz: seg.a[1],
      segDx: seg.b[0] - seg.a[0],
      segDz: seg.b[1] - seg.a[1],
    })
  }
  return out
}
