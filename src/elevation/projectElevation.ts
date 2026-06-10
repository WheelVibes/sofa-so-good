/**
 * Interior wall elevations — the pure geometry core.
 *
 * An *elevation* is a flat, scaled "side-on" drawing of one wall: the wall
 * rectangle (length × height) with its door/window openings, plus the furniture
 * standing against that wall projected onto the wall plane (each piece's
 * along-wall extent × its height). It's the professional deliverable architects
 * and kitchen/bath designers use for cabinet/fixture/backsplash heights, build
 * permits and installers (Chief Architect / Cedreo / NKBA) — the vertical
 * counterpart to the top-down floor plan.
 *
 * Plan-wall based, so the default flat and user-authored custom plans both work
 * through the same path. Pure (no three, no React) → unit-testable without a GPU.
 */
import { obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import type { FloorPlan, PlanWall } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

/** An opening (door/window) placed on the wall, in metres: `x0..x1` along the
 *  wall from its start, `sill..head` above the floor. */
export interface ElevationOpening {
  kind: 'door' | 'window'
  x0: number
  x1: number
  sill: number
  head: number
}

/** A furniture piece projected onto the wall plane, in metres: `x0..x1` along
 *  the wall, `0..height` above the floor; `depth` is the nearest footprint
 *  distance to the wall line (smaller = more in front, used for draw order). */
export interface ElevationItem {
  id: string
  label: string
  x0: number
  x1: number
  height: number
  depth: number
}

export interface WallElevation {
  wallId: string
  /** Wall length (m) = the elevation's horizontal extent. */
  length: number
  /** Wall height (m) = the elevation's vertical extent (topHeight ?? ceiling). */
  height: number
  openings: ElevationOpening[]
  /** Furniture against the wall, sorted farthest-first (so a renderer drawing in
   *  order naturally paints back-to-front). */
  items: ElevationItem[]
}

/** A footprint whose nearest point is within this many metres of the wall line
 *  counts as "against" that wall (covers flush pieces + near-wall nightstands,
 *  TVs, wall units, cabinets). */
export const ELEVATION_NEAR_WALL = 0.6

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Above-floor height of an item in metres (parametric height prop → def height),
 *  scaled by the item/def scale. */
function itemHeight(item: FurnitureItem, def: FurnitureDef): number {
  let h = def.defaultFootprint.h
  if (def.kind === 'parametric') {
    const hv = item.props['height']
    if (typeof hv === 'number') h = hv
  }
  const defScale = def.kind === 'parametric' ? undefined : def.scale
  const scale = (typeof item.props['scale'] === 'number' ? item.props['scale'] : defScale) ?? 1
  return h * scale
}

/**
 * Project one wall to a {@link WallElevation}. `defs` resolves each item's def
 * for its footprint + height; items with no def, mounted-above-the-wall pieces
 * outside the wall span, or pieces farther than {@link ELEVATION_NEAR_WALL} from
 * the wall line are skipped.
 */
export function projectWallElevation(
  plan: FloorPlan,
  wall: PlanWall,
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): WallElevation {
  const len = wallLength(wall)
  const height = wall.topHeight ?? plan.ceilingHeight
  const openings: ElevationOpening[] = (plan.openings ?? [])
    .filter((o) => o.wallId === wall.id)
    .map((o) => ({
      kind: o.kind,
      x0: o.offset,
      x1: o.offset + o.width,
      sill: o.sill,
      head: o.head,
    }))

  const result: WallElevation = { wallId: wall.id, length: len, height, openings, items: [] }
  if (len <= 0) return result

  // Wall unit tangent + normal (XZ plane).
  const ux = (wall.end[0] - wall.start[0]) / len
  const uz = (wall.end[1] - wall.start[1]) / len
  const nx = -uz
  const nz = ux
  const along = (x: number, z: number) => (x - wall.start[0]) * ux + (z - wall.start[1]) * uz
  const perp = (x: number, z: number) =>
    Math.abs((x - wall.start[0]) * nx + (z - wall.start[1]) * nz)

  for (const item of items) {
    const def = defs[item.defId]
    if (!def) continue
    const corners = obbCorners(itemFootprint(item, def))
    let minPerp = Number.POSITIVE_INFINITY
    let x0 = Number.POSITIVE_INFINITY
    let x1 = Number.NEGATIVE_INFINITY
    for (const [cx, cz] of corners) {
      const a = along(cx, cz)
      if (a < x0) x0 = a
      if (a > x1) x1 = a
      const p = perp(cx, cz)
      if (p < minPerp) minPerp = p
    }
    if (minPerp > ELEVATION_NEAR_WALL) continue // not against this wall
    if (x1 <= 0 || x0 >= len) continue // off the ends of the wall span
    x0 = clamp(x0, 0, len)
    x1 = clamp(x1, 0, len)
    if (x1 - x0 < 1e-3) continue
    result.items.push({
      id: item.id,
      label: item.label ?? def.name,
      x0,
      x1,
      height: itemHeight(item, def),
      depth: minPerp,
    })
  }
  // Farthest-first so a renderer paints back-to-front (nearer pieces on top).
  result.items.sort((a, b) => b.depth - a.depth)
  return result
}

/** Every wall's elevation for a plan (in `plan.walls` order). */
export function projectAllElevations(
  plan: FloorPlan,
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): WallElevation[] {
  // Tolerate a partial/hand-built plan with no `walls` array.
  return (plan.walls ?? []).map((w) => projectWallElevation(plan, w, items, defs))
}
