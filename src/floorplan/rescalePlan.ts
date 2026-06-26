/**
 * Pure plan rescaling (PARITY-PLAN-SCALE).
 *
 * Sweet Home 3D / RoomSketcher "scale the walls to a target dimension": fix a
 * traced or imported plan that was drawn at the wrong scale, or resize a plan so
 * a known room/wall hits an exact length — in one action.
 *
 * `rescalePlan(plan, factor | {anchorWallId, targetLength}, items?, opts?)` returns
 * a NEW plan whose every geometric coordinate is multiplied by `factor` about an
 * **anchor point** (the world origin by default, or the START of `anchorWallId`).
 * Scaling about the anchor keeps that point fixed so the plan grows/shrinks in
 * place rather than drifting away from the origin.
 *
 * What scales:
 *   - wall endpoints (`start`/`end`), and a wall's own `thicknessM` override + its
 *     `arc` bulge so wall proportions are preserved;
 *   - room `origin`, `width`, `depth`, the L-`extension`, an explicit `polygon`,
 *     and the `labelOffset` (so a nudged label keeps its relative place);
 *   - opening `offset` + `width` — an opening stays at the SAME fraction along its
 *     wall (offset and the wall both scale by the same factor) and keeps the same
 *     proportion of the wall covered, so doors/windows stay proportionally placed;
 *   - notes / dimensions / polyline vertices;
 *   - every upper storey's geometry AND its `elevation` (so storeys stay stacked
 *     consistently about the same anchor) and the plan `extent` + `ceilingHeight`;
 *   - furniture item POSITIONS (about the SAME anchor) and `elevation`.
 *
 * Furniture SIZE: matching Sweet Home 3D's "scale walls", item POSITIONS scale
 * but item SIZES are PRESERVED by default — a wrong-scale traced plan is corrected
 * around the real furniture, and resizing a room shouldn't silently shrink a
 * standard-size bed. Pass `{ scaleFurnitureSize: true }` to also multiply each
 * item's footprint (`width`/`depth`/`length`/`height` props + any uniform `scale`)
 * by the factor — useful when the WHOLE design, furniture included, was authored
 * at the wrong scale.
 *
 * Pure + composable: `rescalePlan(rescalePlan(p, a).plan, b)` equals
 * `rescalePlan(p, a*b)` about the origin, so two successive scales compose into
 * one. Factor must be finite and > 0 (a `≤ 0` factor, NaN, or a target that can't
 * be met throws). Factor exactly `1` is a structural no-op (returns a deep clone
 * unchanged).
 *
 * Geometry only — no three / React imports. Unit-tested in isolation.
 */
import type { FurnitureItem } from '../furniture/types'
import type { FloorPlan, PlanOpening, PlanRoom, PlanUpperLevel, PlanVec2, PlanWall } from './types'
import { wallLength } from './types'

/** A scale request: a raw multiplier, or "make `anchorWallId` measure
 *  `targetLength` metres" (the factor is then `targetLength / currentLength`). */
export type RescaleSpec = number | { anchorWallId: string; targetLength: number }

export interface RescaleOptions {
  /** Fixed point the scale pivots about (metres). Defaults to the world origin
   *  `[0, 0]`. When a `{ anchorWallId }` spec is used the anchor defaults to that
   *  wall's `start` instead, so the anchored wall keeps one endpoint fixed and
   *  simply grows to the target length. */
  anchor?: PlanVec2
  /** Also scale furniture footprint sizes (not just positions). Default false —
   *  positions move, sizes are preserved (Sweet Home 3D parity). */
  scaleFurnitureSize?: boolean
}

/** Resolve a spec to a concrete positive factor against a plan, throwing on an
 *  invalid factor / unmeetable target. Exposed for the slice so the UI can
 *  validate before committing. */
export function resolveRescaleFactor(plan: FloorPlan, spec: RescaleSpec): number {
  if (typeof spec === 'number') {
    if (!Number.isFinite(spec) || spec <= 0) {
      throw new RangeError(`rescalePlan: factor must be finite and > 0 (got ${spec})`)
    }
    return spec
  }
  const { anchorWallId, targetLength } = spec
  if (!Number.isFinite(targetLength) || targetLength <= 0) {
    throw new RangeError(`rescalePlan: targetLength must be finite and > 0 (got ${targetLength})`)
  }
  const wall = findWall(plan, anchorWallId)
  if (!wall) throw new Error(`rescalePlan: anchor wall "${anchorWallId}" not found`)
  const len = wallLength(wall)
  if (!(len > 1e-9)) {
    throw new RangeError(`rescalePlan: anchor wall "${anchorWallId}" has ~zero length`)
  }
  return targetLength / len
}

/** Find a wall by id across the ground floor AND every upper storey. */
function findWall(plan: FloorPlan, id: string): PlanWall | undefined {
  const onGround = plan.walls.find((w) => w.id === id)
  if (onGround) return onGround
  for (const lvl of plan.upperLevels ?? []) {
    const hit = lvl.walls.find((w) => w.id === id)
    if (hit) return hit
  }
  return undefined
}

/** When `{ anchorWallId }` is given without an explicit anchor point, pivot about
 *  that wall's start so the anchored wall keeps an endpoint fixed. */
function resolveAnchor(plan: FloorPlan, spec: RescaleSpec, opts?: RescaleOptions): PlanVec2 {
  if (opts?.anchor) return opts.anchor
  if (typeof spec !== 'number') {
    const wall = findWall(plan, spec.anchorWallId)
    if (wall) return wall.start
  }
  return [0, 0]
}

/** Scale a 2D point about the anchor. */
function scalePoint([x, z]: PlanVec2, k: number, [ax, az]: PlanVec2): PlanVec2 {
  return [ax + (x - ax) * k, az + (z - az) * k]
}

function scaleWall(w: PlanWall, k: number, anchor: PlanVec2): PlanWall {
  const next: PlanWall = {
    ...w,
    start: scalePoint(w.start, k, anchor),
    end: scalePoint(w.end, k, anchor),
  }
  if (w.thicknessM !== undefined) next.thicknessM = w.thicknessM * k
  if (w.arc !== undefined) next.arc = w.arc * k
  // Vertical wall caps scale too, so a uniformly-rescaled plan keeps its vertical
  // proportions (heights track the scaled ceilingHeight below).
  if (w.topHeight !== undefined) next.topHeight = w.topHeight * k
  if (w.topHeightEnd !== undefined) next.topHeightEnd = w.topHeightEnd * k
  if (w.baseboard?.height !== undefined) {
    next.baseboard = { ...w.baseboard, height: w.baseboard.height * k }
  }
  return next
}

function scaleOpening(o: PlanOpening, k: number): PlanOpening {
  // offset + width scale by the same factor as the wall, so the opening stays at
  // the same fraction along the wall and covers the same proportion of it.
  return { ...o, offset: o.offset * k, width: o.width * k, sill: o.sill * k, head: o.head * k }
}

function scaleRoom(r: PlanRoom, k: number, anchor: PlanVec2): PlanRoom {
  const next: PlanRoom = {
    ...r,
    origin: scalePoint(r.origin, k, anchor),
    width: r.width * k,
    depth: r.depth * k,
  }
  if (r.extension) {
    // The extension offset is RELATIVE to origin (a vector), so it scales by k
    // directly (no anchor term); its width/depth scale too.
    next.extension = {
      offset: [r.extension.offset[0] * k, r.extension.offset[1] * k],
      width: r.extension.width * k,
      depth: r.extension.depth * k,
    }
  }
  if (r.polygon && r.polygon.length >= 3) {
    next.polygon = r.polygon.map((p) => scalePoint(p, k, anchor))
  }
  if (r.ceilingHeight !== undefined) next.ceilingHeight = r.ceilingHeight * k
  if (r.labelOffset) next.labelOffset = [r.labelOffset[0] * k, r.labelOffset[1] * k]
  if (r.ceiling) {
    next.ceiling = { ...r.ceiling }
    if (r.ceiling.drop !== undefined) next.ceiling.drop = r.ceiling.drop * k
    if (r.ceiling.margin !== undefined) next.ceiling.margin = r.ceiling.margin * k
    if (r.ceiling.slope) {
      next.ceiling.slope = { axis: r.ceiling.slope.axis, rise: r.ceiling.slope.rise * k }
    }
  }
  return next
}

function scaleLevelGeometry(lvl: PlanUpperLevel, k: number, anchor: PlanVec2): PlanUpperLevel {
  const next: PlanUpperLevel = {
    ...lvl,
    elevation: lvl.elevation * k,
    walls: lvl.walls.map((w) => scaleWall(w, k, anchor)),
    openings: lvl.openings.map((o) => scaleOpening(o, k)),
    rooms: lvl.rooms.map((r) => scaleRoom(r, k, anchor)),
  }
  if (lvl.ceilingHeight !== undefined) next.ceilingHeight = lvl.ceilingHeight * k
  return next
}

/**
 * Scale a single furniture item: position (about the anchor) + elevation always;
 * footprint props only when `scaleSize`.
 */
export function rescaleItem(
  item: FurnitureItem,
  k: number,
  anchor: PlanVec2,
  scaleSize: boolean,
): FurnitureItem {
  const next: FurnitureItem = { ...item, position: scalePoint(item.position, k, anchor) }
  if (item.elevation !== undefined) next.elevation = item.elevation * k
  if (scaleSize) {
    const props = { ...item.props }
    for (const key of ['width', 'depth', 'length', 'height'] as const) {
      const v = props[key]
      if (typeof v === 'number') props[key] = v * k
    }
    if (typeof props.scale === 'number') props.scale = props.scale * k
    next.props = props
  }
  return next
}

export interface RescaleResult {
  plan: FloorPlan
  items: FurnitureItem[]
  /** The concrete factor applied (resolved from a target-length spec). */
  factor: number
}

/**
 * Rescale a plan (and, optionally, its furniture) by a factor or to a target
 * wall length, about an anchor point. Pure — returns fresh objects, never
 * mutates the inputs.
 */
export function rescalePlan(
  plan: FloorPlan,
  spec: RescaleSpec,
  items: readonly FurnitureItem[] = [],
  opts?: RescaleOptions,
): RescaleResult {
  const k = resolveRescaleFactor(plan, spec)
  const anchor = resolveAnchor(plan, spec, opts)
  const scaleSize = opts?.scaleFurnitureSize ?? false

  // Factor 1 about any anchor is the identity — return deep clones unchanged so
  // callers always get fresh, safe-to-mutate objects (and no float drift).
  if (k === 1) {
    return {
      plan: JSON.parse(JSON.stringify(plan)) as FloorPlan,
      items: items.map((it) => JSON.parse(JSON.stringify(it)) as FurnitureItem),
      factor: 1,
    }
  }

  const next: FloorPlan = {
    ...plan,
    ceilingHeight: plan.ceilingHeight * k,
    extent: [plan.extent[0] * k, plan.extent[1] * k],
    walls: plan.walls.map((w) => scaleWall(w, k, anchor)),
    openings: plan.openings.map((o) => scaleOpening(o, k)),
    rooms: plan.rooms.map((r) => scaleRoom(r, k, anchor)),
  }
  if (plan.upperLevels) {
    next.upperLevels = plan.upperLevels.map((l) => scaleLevelGeometry(l, k, anchor))
  }
  if (plan.notes) {
    next.notes = plan.notes.map((n) => {
      const [x, z] = scalePoint([n.x, n.z], k, anchor)
      return { ...n, x, z }
    })
  }
  if (plan.dimensions) {
    next.dimensions = plan.dimensions.map((d) => ({
      ...d,
      a: scalePoint(d.a, k, anchor),
      b: scalePoint(d.b, k, anchor),
    }))
  }
  if (plan.polylines) {
    next.polylines = plan.polylines.map((p) => ({
      ...p,
      points: p.points.map((pt) => scalePoint(pt, k, anchor)),
    }))
  }

  const nextItems = items.map((it) => rescaleItem(it, k, anchor, scaleSize))
  return { plan: next, items: nextItems, factor: k }
}
