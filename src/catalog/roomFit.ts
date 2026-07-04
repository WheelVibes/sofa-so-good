/**
 * CATALOG-FITS — "does this catalog item fit the room being edited?"
 *
 * Pure, render/store-agnostic predicate. Reuses the same real-metre footprint
 * (`FurnitureDef.defaultFootprint`, seeded pre-render by `catalog/packs/footprint.ts`
 * for GLBs) and the same clearance constants (`layout/designRules.ts` `CLEARANCE`)
 * the rest of the app already uses for placement/collision — this module does NOT
 * invent a parallel geometry system. It does not do full furniture-vs-furniture
 * collision (that's `collision/placement.ts`'s job for actually-placed items); it
 * only answers the cheaper, catalog-browsing question of whether the item's
 * footprint could plausibly fit *somewhere* in the room's free rects at all.
 *
 * Callers resolve the room's free-space rects (e.g. via
 * `scene/roomEditorShell.ts:getRoomEditorShell(...).shell.rects`, which already
 * unifies the built-in-apartment `RoomShell` and custom-plan `PlanRoomShell`) and
 * pass plain `{w, d}` pairs here via `freeRectsFromShellRects` — this module has no
 * dependency on the scene/apartment/floorplan modules.
 */
import { CLEARANCE } from '../layout/designRules'

export type RoomFitLevel = 'fits' | 'tight' | 'wont-fit' | 'unknown'

/** A room's usable interior rect, reduced to just its plan dimensions. */
export interface RoomFreeRect {
  w: number
  d: number
}

/** An axis-aligned rect shape shared by `apartment/roomShell.ts`'s `Rect` and
 *  `floorplan/planRoomShell.ts`'s `PlanRect` — accepted structurally so this
 *  module doesn't need to import either. */
export interface AxisAlignedRect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** Reduce a room shell's axis-aligned rects (main + optional L-extension) to
 *  plain width/depth pairs. Pure adapter — accepts either `RoomShell.rects` or
 *  `PlanRoomShell.rects` (identical shape). */
export function freeRectsFromShellRects(rects: readonly AxisAlignedRect[]): RoomFreeRect[] {
  return rects.map((r) => ({ w: r.x1 - r.x0, d: r.z1 - r.z0 }))
}

/** Clearance margins for the fit check, sourced from the shared `CLEARANCE`
 *  constants so this stays consistent with the rest of the app's space-planning
 *  rules rather than inventing its own numbers. */
export const ROOM_FIT_MARGIN = {
  /** Minimum slack an item's footprint must leave on BOTH axes within a
   *  candidate rect to be physically placeable at all — a bare skirting gap on
   *  each side (`CLEARANCE.wallGap`, doubled for both sides of the axis).
   *  Anything tighter than this is "won't fit", not merely "tight". */
  minimum: CLEARANCE.wallGap * 2,
  /** Slack that also leaves a comfortable walkway around the item on both axes
   *  (`CLEARANCE.walkwayMin`) — meeting `minimum` but falling short of this is
   *  "tight" rather than a clean "fits". */
  comfortable: CLEARANCE.walkwayMin,
} as const

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

/**
 * Does a `{w, d}` footprint fit within any of the room's free rects?
 *
 * - `unknown` — no footprint, a non-finite/zero/negative footprint (never seen
 *   in practice since `defaultFootprint` is a required field, but guards a bad
 *   upload seed), or no room rects (no room being edited, or an unresolved
 *   room id) — i.e. anywhere real fit data is missing. **Never reported as
 *   `wont-fit`** so a data gap can't wrongly discourage a placement.
 * - `fits` — some rect (in either axis orientation — an item can be rotated
 *   90°) has room for the footprint plus a comfortable walkway on both axes.
 * - `tight` — fits in some rect/orientation with at least a bare skirting gap,
 *   but not the full comfortable margin on both axes.
 * - `wont-fit` — no rect/orientation has even the bare minimum margin.
 */
export function itemFitsRoom(
  footprint: { w: number; d: number } | null | undefined,
  rects: readonly RoomFreeRect[] | null | undefined,
): RoomFitLevel {
  if (!footprint) return 'unknown'
  const { w, d } = footprint
  if (!isPositiveFinite(w) || !isPositiveFinite(d)) return 'unknown'
  if (!rects || rects.length === 0) return 'unknown'

  let sawValidRect = false
  let sawMinimumFit = false
  for (const rect of rects) {
    if (!isPositiveFinite(rect.w) || !isPositiveFinite(rect.d)) continue
    sawValidRect = true
    // Try both orientations — the item can be rotated 90° to fit a room.
    for (const [iw, id] of [
      [w, d],
      [d, w],
    ] as const) {
      const slackW = rect.w - iw
      const slackD = rect.d - id
      if (slackW < ROOM_FIT_MARGIN.minimum || slackD < ROOM_FIT_MARGIN.minimum) continue
      sawMinimumFit = true
      if (slackW >= ROOM_FIT_MARGIN.comfortable && slackD >= ROOM_FIT_MARGIN.comfortable) {
        return 'fits'
      }
    }
  }
  // Every rect was degenerate (zero/negative/non-finite) — a data problem, not
  // a real "too big for the room" verdict, so this stays 'unknown' too.
  if (!sawValidRect) return 'unknown'
  return sawMinimumFit ? 'tight' : 'wont-fit'
}
