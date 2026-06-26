/**
 * Pure plan mirroring (PARITY-PLAN-MIRROR-REGION).
 *
 * Mirror-image HDB stacks (and many condo unit pairs) are the left↔right
 * reflection of their neighbour: the SAME walls, rooms, openings and furniture,
 * flipped about a vertical line. Re-drawing the mirror by hand is tedious and
 * error-prone, so `mirrorPlanRegion` reflects an ENTIRE plan region — every
 * wall endpoint, room shape, opening, annotation and furniture item — across the
 * world line `x = axisX` in one pure pass.
 *
 * `mirrorPlanRegion(plan, items, axisX)` returns a NEW plan + items whose every
 * X coordinate `x` becomes `2·axisX − x` (Z is untouched). Reflection is an
 * orientation-REVERSING transform, so handedness flips alongside the coordinates:
 *   - wall endpoints (`start`/`end`) reflect; the signed `arc` bulge (a
 *     perpendicular offset, whose sign encodes which side it bulges to) negates;
 *   - room `origin` reflects, and `width`/`depth` are unchanged (a reflection is
 *     an isometry — lengths and areas are preserved). An axis-aligned room's NW
 *     (min-X) corner becomes its NE corner under the flip, so the new `origin` is
 *     taken from the reflected rectangle's min-X corner; an explicit `polygon`
 *     reflects vertex-by-vertex. The L-`extension` offset (a vector) reflects so
 *     the extension lands on the mirrored side. `labelOffset` reflects in X (a
 *     nudged label keeps its mirrored place); `labelAngle` (a CW 2D rotation)
 *     negates;
 *   - opening `offset`/`width`/`sill`/`head` are unchanged (offset is the
 *     distance from the wall's `start` along it, and the wall keeps its endpoint
 *     identity), but a door's `hinge` jamb (start↔end) AND `swing` side
 *     (left↔right) flip so a mirrored door reads as the mirror image rather than
 *     the same door slid over;
 *   - notes / dimensions / polyline vertices reflect in X;
 *   - every upper storey mirrors consistently about the same axis (its geometry
 *     reflects; `elevation`/`ceilingHeight` are vertical → untouched);
 *   - furniture POSITION reflects in X, the Y-heading negates (`rotation` →
 *     `-rotation`; equivalently a facing θ maps to π−θ once the piece is flipped),
 *     and the item's own geometry mirrors (`flipX` toggles) so an asymmetric
 *     L-desk / chaise reads as its mirror image. `z`, `elevation`, sizes and
 *     everything else are preserved.
 *
 * Pure + composable: mirroring twice about the same axis is the identity (modulo
 * fresh object refs) — `mirrorPlanRegion(mirrorPlanRegion(p, i, a).plan, …, a)`
 * equals the original. `axisX` must be finite (NaN/Infinity throws). Geometry
 * only — no three / React imports. Unit-tested in isolation.
 */
import type { FurnitureItem } from '../furniture/types'
import type { FloorPlan, PlanOpening, PlanRoom, PlanUpperLevel, PlanVec2, PlanWall } from './types'

/** Reflect a single X coordinate across the vertical line `x = axisX`. */
function mirrorX(x: number, axisX: number): number {
  return 2 * axisX - x
}

/** Reflect a 2D point across `x = axisX` (Z unchanged). */
function mirrorPoint([x, z]: PlanVec2, axisX: number): PlanVec2 {
  return [mirrorX(x, axisX), z]
}

function mirrorWall(w: PlanWall, axisX: number): PlanWall {
  const next: PlanWall = {
    ...w,
    start: mirrorPoint(w.start, axisX),
    end: mirrorPoint(w.end, axisX),
  }
  // The arc bulge is a SIGNED perpendicular offset from the chord; a reflection
  // reverses which side it bulges to, so its sign flips.
  if (w.arc !== undefined) next.arc = -w.arc
  return next
}

/** Flip a door's hinge jamb / swing side under a reflection (orientation
 *  reverses, so both handedness flags invert). */
function flipHinge(h: NonNullable<PlanOpening['hinge']>): NonNullable<PlanOpening['hinge']> {
  return h === 'end' ? 'start' : 'end'
}
function flipSwing(s: NonNullable<PlanOpening['swing']>): NonNullable<PlanOpening['swing']> {
  return s === 'left' ? 'right' : 'left'
}

function mirrorOpening(o: PlanOpening): PlanOpening {
  // offset (distance from the wall's start) + width + sill + head are isometric
  // invariants — the wall keeps its start/end identity, so they don't change.
  // Only a door's handedness flips.
  const next: PlanOpening = { ...o }
  if (o.kind === 'door') {
    // Default hinge='start', swing='right' when unset (matches the renderer);
    // make the flip explicit so a mirrored default door is visibly handed.
    next.hinge = flipHinge(o.hinge ?? 'start')
    next.swing = flipSwing(o.swing ?? 'right')
  }
  return next
}

function mirrorRoom(r: PlanRoom, axisX: number): PlanRoom {
  const next: PlanRoom = {
    ...r,
    // The rect's NW (min-X) corner reflects to the NE corner of the mirrored
    // rect; the new min-X origin is the reflection of the original max-X corner.
    origin: [mirrorX(r.origin[0] + r.width, axisX), r.origin[1]],
    width: r.width,
    depth: r.depth,
  }
  if (r.extension) {
    // The extension offset is a vector RELATIVE to origin. Map the extension's
    // absolute X-span under the reflection, then re-express its min-X corner
    // relative to the NEW origin: offsetX' = -(offsetX + extWidth) + roomWidth.
    const e = r.extension
    next.extension = {
      offset: [-(e.offset[0] + e.width) + r.width, e.offset[1]],
      width: e.width,
      depth: e.depth,
    }
  }
  if (r.polygon && r.polygon.length >= 3) {
    next.polygon = r.polygon.map((p) => mirrorPoint(p, axisX))
  }
  if (r.labelOffset) next.labelOffset = [-r.labelOffset[0], r.labelOffset[1]]
  // labelAngle is a 2D label rotation (CW on the plan); under an X-reflection a
  // CW angle becomes CCW, so it negates (absent → still absent).
  if (r.labelAngle !== undefined) next.labelAngle = -r.labelAngle
  return next
}

function mirrorLevelGeometry(lvl: PlanUpperLevel, axisX: number): PlanUpperLevel {
  return {
    ...lvl,
    walls: lvl.walls.map((w) => mirrorWall(w, axisX)),
    openings: lvl.openings.map((o) => mirrorOpening(o)),
    rooms: lvl.rooms.map((r) => mirrorRoom(r, axisX)),
  }
}

/**
 * Mirror a single furniture item across `x = axisX`: position reflects in X, the
 * Y-heading negates, and the piece's own geometry mirrors (`flipX` toggles) so an
 * asymmetric item reads as its mirror image. `z`, sizes and everything else are
 * preserved.
 */
export function mirrorItem(item: FurnitureItem, axisX: number): FurnitureItem {
  return {
    ...item,
    position: [mirrorX(item.position[0], axisX), item.position[1]],
    rotation: -item.rotation,
    flipX: !item.flipX,
  }
}

export interface MirrorPlanResult {
  plan: FloorPlan
  items: FurnitureItem[]
  /** The axis the region was mirrored about (echoed for the caller). */
  axisX: number
}

/**
 * Mirror a whole plan region (walls + rooms + openings + annotations + furniture)
 * across the vertical world line `x = axisX`. Pure — returns fresh objects, never
 * mutates the inputs.
 */
export function mirrorPlanRegion(
  plan: FloorPlan,
  items: readonly FurnitureItem[] = [],
  axisX = 0,
): MirrorPlanResult {
  if (!Number.isFinite(axisX)) {
    throw new RangeError(`mirrorPlanRegion: axisX must be finite (got ${axisX})`)
  }

  const next: FloorPlan = {
    ...plan,
    // extent is a footprint SIZE (not a position) — a reflection preserves it.
    extent: [plan.extent[0], plan.extent[1]],
    walls: plan.walls.map((w) => mirrorWall(w, axisX)),
    openings: plan.openings.map((o) => mirrorOpening(o)),
    rooms: plan.rooms.map((r) => mirrorRoom(r, axisX)),
  }
  if (plan.upperLevels) {
    next.upperLevels = plan.upperLevels.map((l) => mirrorLevelGeometry(l, axisX))
  }
  if (plan.notes) {
    next.notes = plan.notes.map((n) => ({ ...n, x: mirrorX(n.x, axisX) }))
  }
  if (plan.dimensions) {
    next.dimensions = plan.dimensions.map((d) => ({
      ...d,
      a: mirrorPoint(d.a, axisX),
      b: mirrorPoint(d.b, axisX),
    }))
  }
  if (plan.polylines) {
    next.polylines = plan.polylines.map((p) => ({
      ...p,
      points: p.points.map((pt) => mirrorPoint(pt, axisX)),
    }))
  }

  const nextItems = items.map((it) => mirrorItem(it, axisX))
  return { plan: next, items: nextItems, axisX }
}
