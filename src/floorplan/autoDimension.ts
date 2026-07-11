/**
 * Auto-dimension a floor plan (feature F15) — pure core.
 *
 * Mirrors competitors (RoomSketcher / Cedreo) that auto-generate continuous
 * dimension strings on a plan instead of relying on manually pinned tape.
 *
 * Self-contained: depends ONLY on `./types` (FloorPlan, PlanWall, PlanRoom,
 * PlanVec2, wallLength, planBounds). Produces metre-space geometry; an SVG
 * renderer (`./autoDimensionSvg`) turns it into a palette-injected string.
 */

import { formatLength, type UnitSystem } from '../utils/measurement'
import {
  type FloorPlan,
  type PlanRoom,
  type PlanVec2,
  type PlanWall,
  planBounds,
  wallLength,
} from './types'

/** Which side of the plan a dimension line sits on. */
type DimensionSide = 'top' | 'bottom' | 'left' | 'right' | 'interior'

/**
 * A single dimension line in metre space. `(x1,y1)→(x2,y2)` is the line the
 * tick marks span; `value` is its length in metres and `label` the formatted
 * text (e.g. `3.40 m`). `side` records the placement for renderers/legends.
 */
export interface Dimension {
  x1: number
  y1: number
  x2: number
  y2: number
  value: number
  label: string
  side: DimensionSide
}

/** Overall (external wall) lines + optional per-room interior pairs. */
export interface DimensionSet {
  overall: Dimension[]
  rooms: Dimension[]
}

/** Distance the overall dimension lines sit outside the plan bounds (metres). */
const DIMENSION_OFFSET = 0.6

/** Format a metre length as a fixed 2-decimal label, e.g. `3.40 m`.
 *  @deprecated Prefer `formatLength(value, units)` from `utils/measurement` for
 *  unit-aware output. This alias forwards to metric for backward compatibility. */
export function formatMetres(value: number): string {
  return formatLength(value, 'metric')
}

const EPS = 1e-6

/** Classify which outer edge a wall hugs, given the plan's min/max bounds. */
function wallSide(
  w: PlanWall,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): DimensionSide {
  const [sx, sz] = w.start
  const [ex, ez] = w.end
  const horizontal = Math.abs(ez - sz) < Math.abs(ex - sx)
  if (horizontal) {
    const z = (sz + ez) / 2
    return Math.abs(z - minZ) <= Math.abs(z - maxZ) ? 'top' : 'bottom'
  }
  const x = (sx + ex) / 2
  return Math.abs(x - minX) <= Math.abs(x - maxX) ? 'left' : 'right'
}

/**
 * Perpendicular offset vector pushing a dimension line outside the plan, away
 * from the plan interior, by `DIMENSION_OFFSET` metres.
 */
function offsetForSide(side: DimensionSide): PlanVec2 {
  switch (side) {
    case 'top':
      return [0, -DIMENSION_OFFSET]
    case 'bottom':
      return [0, DIMENSION_OFFSET]
    case 'left':
      return [-DIMENSION_OFFSET, 0]
    case 'right':
      return [DIMENSION_OFFSET, 0]
    default:
      return [0, 0]
  }
}

/** Is this an external (load-bearing perimeter) wall? */
function isExternal(w: PlanWall): boolean {
  return w.thickness === 'external'
}

/**
 * Build the dimension set for a plan: one overall line per external wall
 * (offset outside the plan, perpendicular to the wall), plus an interior
 * width×depth pair per room. Robust to missing/zero-length input.
 */
export function buildDimensions(plan: FloorPlan, units: UnitSystem = 'metric'): DimensionSet {
  const overall: Dimension[] = []
  const rooms: Dimension[] = []
  if (!plan || typeof plan !== 'object') return { overall, rooms }

  const walls = Array.isArray(plan.walls) ? plan.walls : []
  const roomList = Array.isArray(plan.rooms) ? plan.rooms : []

  // planBounds reads plan.walls/rooms; only call it once we know the plan shape
  // is array-safe. It returns the max corner; the plan frame's origin is (0,0).
  const [maxX, maxZ] = planBounds({ ...plan, walls, rooms: roomList })
  const minX = 0
  const minZ = 0

  for (const w of walls) {
    if (!isExternal(w)) continue
    const len = wallLength(w)
    if (len < EPS) continue
    const side = wallSide(w, minX, minZ, maxX, maxZ)
    const [ox, oz] = offsetForSide(side)
    overall.push({
      x1: w.start[0] + ox,
      y1: w.start[1] + oz,
      x2: w.end[0] + ox,
      y2: w.end[1] + oz,
      value: len,
      label: formatLength(len, units),
      side,
    })
  }

  for (const r of roomList) {
    rooms.push(...roomDimensions(r, units))
  }

  return { overall, rooms }
}

/** Interior width (top edge) + depth (left edge) lines for one room. */
function roomDimensions(r: PlanRoom, units: UnitSystem = 'metric'): Dimension[] {
  const out: Dimension[] = []
  if (!r || typeof r !== 'object') return out
  const origin = Array.isArray(r.origin) ? r.origin : null
  if (!origin) return out
  const [ox, oz] = origin
  const width = Number.isFinite(r.width) ? r.width : 0
  const depth = Number.isFinite(r.depth) ? r.depth : 0

  if (width > EPS) {
    out.push({
      x1: ox,
      y1: oz,
      x2: ox + width,
      y2: oz,
      value: width,
      label: formatLength(width, units),
      side: 'interior',
    })
  }
  if (depth > EPS) {
    out.push({
      x1: ox,
      y1: oz,
      x2: ox,
      y2: oz + depth,
      value: depth,
      label: formatLength(depth, units),
      side: 'interior',
    })
  }
  return out
}
