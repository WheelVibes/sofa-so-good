/**
 * Pure plan grid-snapping (PARITY-GRID-SNAP).
 *
 * Sweet Home 3D / Coohom "snap the whole plan to a grid": clean up a traced or
 * imported plan whose coordinates landed on messy fractional metres by rounding
 * every geometric coordinate to a chosen grid (e.g. 50 mm) — in one action.
 *
 * `snapPlanToGrid(plan, items, gridM, opts?)` returns a NEW plan whose every
 * coordinate is rounded to the nearest multiple of `gridM` via
 * `Math.round(v / gridM) * gridM`.
 *
 * What snaps:
 *   - wall endpoints (`start`/`end`);
 *   - room `origin`, `width`, `depth`, the L-`extension` (offset + size), an
 *     explicit `polygon`, and the `labelOffset` (so a nudged label stays aligned
 *     to the grid);
 *   - opening `offset` + `width` — then the offset is RE-MEASURED against the
 *     snapped wall so an opening stays on its (snapped) wall and doesn't slide
 *     off the end after the endpoints moved;
 *   - notes / dimensions / polyline vertices;
 *   - every upper storey's geometry (its `elevation` is snapped too so storeys
 *     stack on the grid) and the plan `extent`;
 *   - optionally furniture item POSITIONS (opt-in via `snapFurniture`) — sizes
 *     and everything else are always preserved.
 *
 * Re-threading openings: an opening's `offset` is the distance from its wall's
 * `start` along the wall. After snapping the wall's endpoints the wall length can
 * change, so we snap the offset to the grid AND clamp it so the opening still fits
 * within the (snapped) wall span — keeping doors/windows on their walls.
 *
 * Edge cases:
 *   - `gridM` must be finite and > 0 (a `≤ 0` grid, NaN, or Infinity throws).
 *   - An already-on-grid plan is unchanged — snapping is IDEMPOTENT:
 *     `snap(snap(p)) === snap(p)` (rounding a multiple of `gridM` is a fixed
 *     point), so the action is safe to re-run.
 *   - A wall that would collapse to ZERO length after snapping (both endpoints
 *     round to the same grid point — e.g. a sub-grid stub) is LEFT UNSNAPPED so
 *     the plan never loses a wall; its openings then re-thread against the
 *     original (un-collapsed) geometry. This is rare and documented.
 *
 * Pure + composable — geometry only, no three / React imports. Unit-tested in
 * isolation. Modelled on `rescalePlan.ts` / `mirrorPlanRegion.ts`.
 */
import type { FurnitureItem } from '../furniture/types'
import type { FloorPlan, PlanOpening, PlanRoom, PlanUpperLevel, PlanVec2, PlanWall } from './types'

export interface GridSnapOptions {
  /** Also snap furniture item POSITIONS to the grid. Default false — the plan
   *  shell snaps but the furniture is left in place (cleaning a traced shell
   *  shouldn't silently shift the furniture). Sizes are always preserved. */
  snapFurniture?: boolean
}

/** Round a single scalar to the nearest multiple of `gridM`. Avoids `-0` so a
 *  value that rounds to zero is always `0` (stable for equality / serialisation). */
function snapScalar(v: number, gridM: number): number {
  const r = Math.round(v / gridM) * gridM
  return r === 0 ? 0 : r
}

/** Snap a 2D point to the grid. */
function snapPoint([x, z]: PlanVec2, gridM: number): PlanVec2 {
  return [snapScalar(x, gridM), snapScalar(z, gridM)]
}

/** Whether two points are the same (exact — both are already grid multiples). */
function samePoint(a: PlanVec2, b: PlanVec2): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/** Validate the grid spacing; throws on a non-positive / non-finite value.
 *  Exposed so callers (the slice) can validate before committing. */
export function assertGrid(gridM: number): void {
  if (!Number.isFinite(gridM) || gridM <= 0) {
    throw new RangeError(`snapPlanToGrid: gridM must be finite and > 0 (got ${gridM})`)
  }
}

/** Snap a wall's endpoints. If snapping would collapse the wall to zero length
 *  (both endpoints round to the same grid point), the wall is left UNSNAPPED so
 *  the plan never silently loses a segment. */
function snapWall(w: PlanWall, gridM: number): PlanWall {
  const start = snapPoint(w.start, gridM)
  const end = snapPoint(w.end, gridM)
  if (samePoint(start, end)) return { ...w } // would collapse — leave geometry as-is
  return { ...w, start, end }
}

/** Re-thread an opening onto its (snapped) wall: snap the offset + width to the
 *  grid, then clamp the offset so the opening stays within the wall span. */
function snapOpening(o: PlanOpening, gridM: number, wallLenById: Map<string, number>): PlanOpening {
  const width = Math.max(gridM, snapScalar(o.width, gridM))
  let offset = snapScalar(o.offset, gridM)
  const wlen = wallLenById.get(o.wallId)
  if (wlen !== undefined) {
    // Keep the whole opening on the wall: offset ∈ [0, wlen − width]. When the
    // wall is shorter than the opening, pin to the start.
    const maxOff = Math.max(0, snapScalar(wlen - width, gridM))
    offset = Math.min(Math.max(0, offset), maxOff)
  } else {
    offset = Math.max(0, offset)
  }
  return { ...o, offset, width }
}

function snapRoom(r: PlanRoom, gridM: number): PlanRoom {
  const origin = snapPoint(r.origin, gridM)
  const next: PlanRoom = {
    ...r,
    origin,
    // Keep a room at least one grid cell in each dimension so it never degenerates.
    width: Math.max(gridM, snapScalar(r.width, gridM)),
    depth: Math.max(gridM, snapScalar(r.depth, gridM)),
  }
  if (r.extension) {
    next.extension = {
      offset: [snapScalar(r.extension.offset[0], gridM), snapScalar(r.extension.offset[1], gridM)],
      width: Math.max(gridM, snapScalar(r.extension.width, gridM)),
      depth: Math.max(gridM, snapScalar(r.extension.depth, gridM)),
    }
  }
  if (r.polygon && r.polygon.length >= 3) {
    next.polygon = r.polygon.map((p) => snapPoint(p, gridM))
  }
  if (r.labelOffset) {
    next.labelOffset = [snapScalar(r.labelOffset[0], gridM), snapScalar(r.labelOffset[1], gridM)]
  }
  return next
}

/** Map of wall id → snapped length, for re-threading openings on the same level. */
function wallLengthsAfterSnap(walls: PlanWall[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const w of walls) {
    m.set(w.id, Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]))
  }
  return m
}

function snapLevelGeometry(lvl: PlanUpperLevel, gridM: number): PlanUpperLevel {
  const walls = lvl.walls.map((w) => snapWall(w, gridM))
  const lens = wallLengthsAfterSnap(walls)
  return {
    ...lvl,
    elevation: snapScalar(lvl.elevation, gridM),
    walls,
    openings: lvl.openings.map((o) => snapOpening(o, gridM, lens)),
    rooms: lvl.rooms.map((r) => snapRoom(r, gridM)),
  }
}

/** Snap a single furniture item's POSITION to the grid (size preserved). */
export function snapItem(item: FurnitureItem, gridM: number): FurnitureItem {
  return { ...item, position: snapPoint(item.position, gridM) }
}

export interface GridSnapResult {
  plan: FloorPlan
  items: FurnitureItem[]
  /** The grid spacing applied (echoed for the caller). */
  gridM: number
}

/**
 * Snap a whole plan (and, optionally, its furniture) to a grid. Pure — returns
 * fresh objects, never mutates the inputs. Idempotent (re-snapping a snapped plan
 * is a no-op modulo fresh refs). `gridM` must be finite and > 0.
 */
export function snapPlanToGrid(
  plan: FloorPlan,
  items: readonly FurnitureItem[] = [],
  gridM = 0.05,
  opts?: GridSnapOptions,
): GridSnapResult {
  assertGrid(gridM)
  const snapFurniture = opts?.snapFurniture ?? false

  const walls = plan.walls.map((w) => snapWall(w, gridM))
  const lens = wallLengthsAfterSnap(walls)
  const next: FloorPlan = {
    ...plan,
    // extent is a footprint SIZE — snap it to the grid too (kept ≥ one cell).
    extent: [
      Math.max(gridM, snapScalar(plan.extent[0], gridM)),
      Math.max(gridM, snapScalar(plan.extent[1], gridM)),
    ],
    walls,
    openings: plan.openings.map((o) => snapOpening(o, gridM, lens)),
    rooms: plan.rooms.map((r) => snapRoom(r, gridM)),
  }
  if (plan.upperLevels) {
    next.upperLevels = plan.upperLevels.map((l) => snapLevelGeometry(l, gridM))
  }
  if (plan.notes) {
    next.notes = plan.notes.map((n) => ({
      ...n,
      x: snapScalar(n.x, gridM),
      z: snapScalar(n.z, gridM),
    }))
  }
  if (plan.dimensions) {
    next.dimensions = plan.dimensions.map((d) => ({
      ...d,
      a: snapPoint(d.a, gridM),
      b: snapPoint(d.b, gridM),
    }))
  }
  if (plan.polylines) {
    next.polylines = plan.polylines.map((p) => ({
      ...p,
      points: p.points.map((pt) => snapPoint(pt, gridM)),
    }))
  }

  const nextItems = snapFurniture
    ? items.map((it) => snapItem(it, gridM))
    : items.map((it) => ({ ...it }))
  return { plan: next, items: nextItems, gridM }
}
