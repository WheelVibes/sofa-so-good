/**
 * Sweet Home 3D import — PURE placement + opening-association pass (PARITY-SH3D).
 *
 * The parser (`sh3d.ts`) turns a `.sh3d` archive into geometry-only descriptors:
 * walls/rooms (already applied as the plan) and a flat list of furniture pieces
 * (`Sh3dImportItem`), some flagged as `opening` (SH3D models doors/windows as
 * pieces, not wall cuts). This module is the second slice that turns those
 * descriptors into things the scene + plan can hold:
 *
 *   - **Furniture** → concrete `FurnitureItem`s. Each piece's mapped category is
 *     resolved to a representative catalog def (closest-footprint match within the
 *     category), placed at the imported position/rotation, then run through the
 *     shared collision filter (`placeNonOverlapping`) so imported pieces don't
 *     stack on each other or on anything already in the scene.
 *   - **Openings** (doors/windows) → `PlanOpening`s. Each opening piece is snapped
 *     to its nearest wall (reusing the editor's pure `nearestWall`/`alongWall`
 *     geometry), turning its centre into a wall id + along-wall offset + width.
 *
 * Pieces that can't be placed (no category match, no nearby wall, collide) are
 * never dropped silently — they come back as `warnings`. Pure: no three / React /
 * store imports (only types + the pure collision + geometry helpers).
 */

import type { FurnitureCategory, FurnitureDef, FurnitureItem } from '../../furniture/types'
import { placeNonOverlapping } from '../../layout/aiLayoutApply'
import { alongWall, nearestWall } from '../../ui/floorplan/editor/floorPlanGeometry'
import type { PlanOpening, PlanWall } from '../types'
import { clampOpeningOffset, clampOpeningWidth, wallLength } from '../types'
import { DEFAULT_CEILING_M, type Sh3dImportItem } from './sh3d'

/** Max perpendicular distance (m) from an opening's centre to a wall for it to be
 *  associated with that wall. SH3D doors/windows sit centred on the wall line, so
 *  a generous bound tolerates thick walls + coordinate rounding without picking a
 *  far-away wall by accident. */
const OPENING_WALL_MAX_DIST = 0.6
/** Default door head height (m) when the piece carries no usable height. */
const DEFAULT_DOOR_HEAD = 2.05
/** Default window sill / head (m) when the piece carries no usable height. */
const DEFAULT_WINDOW_SILL = 0.9
const DEFAULT_WINDOW_HEAD = 2.1
/** Minimum opening width (m) — guards against a degenerate zero-width piece. */
const MIN_OPENING_WIDTH = 0.3

/** Result of resolving the import's pieces against the catalog + walls. */
export interface Sh3dPlacementResult {
  /** Wall openings derived from door/window pieces. */
  openings: PlanOpening[]
  /** Collision-filtered furniture items ready for `setItems`. */
  placedFurniture: FurnitureItem[]
  /** Non-fatal problems (unmatched category, no nearby wall, overlap-dropped). */
  warnings: string[]
}

/**
 * Pick a representative catalog def for a category: the def whose footprint best
 * matches the imported piece's footprint (so a "sofa" import lands on a sofa-sized
 * seating def, not a stool). Falls back to any def in the category. Returns `null`
 * when the catalog has no def for that category at all.
 */
export function defForCategory(
  catalog: Record<string, FurnitureDef>,
  category: FurnitureCategory,
  footprint: { w: number; d: number },
): FurnitureDef | null {
  let best: FurnitureDef | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const def of Object.values(catalog)) {
    if (def.category !== category) continue
    const fp = def.defaultFootprint
    // Compare footprints orientation-agnostically (a piece may be rotated 90°):
    // score the better of (w↔w, d↔d) and (w↔d, d↔w).
    const direct = Math.abs(fp.w - footprint.w) + Math.abs(fp.d - footprint.d)
    const swapped = Math.abs(fp.w - footprint.d) + Math.abs(fp.d - footprint.w)
    const score = Math.min(direct, swapped)
    if (score < bestScore) {
      bestScore = score
      best = def
    }
  }
  return best
}

/**
 * Resolve mapped furniture descriptors to concrete `FurnitureItem`s and keep only
 * the ones that fit (collision-aware against `existing` + each other). Pieces with
 * no category, or with no catalog def for their category, or dropped for overlap
 * are reported in `warnings`. Opening pieces are ignored here (see
 * `associateOpenings`). Pure.
 */
export function resolveFurniture(
  items: readonly Sh3dImportItem[],
  catalog: Record<string, FurnitureDef>,
  existing: readonly FurnitureItem[],
  genId: (prefix: string) => string,
): { placedFurniture: FurnitureItem[]; warnings: string[] } {
  const warnings: string[] = []
  const candidates: FurnitureItem[] = []
  for (const it of items) {
    if (it.opening) continue
    if (it.category == null) continue // already warned by the parser
    const def = defForCategory(catalog, it.category, { w: it.width, d: it.depth })
    if (!def) {
      warnings.push(`No catalog item available for "${it.name}" (${it.category}) — not placed`)
      continue
    }
    candidates.push({
      id: genId('sh3d-item'),
      defId: def.id,
      position: [it.position[0], it.position[1]],
      rotation: Number.isFinite(it.rotation) ? it.rotation : 0,
      props: {},
    })
  }
  const placedFurniture = placeNonOverlapping([...existing], candidates, catalog)
  const dropped = candidates.length - placedFurniture.length
  if (dropped > 0) {
    warnings.push(`${dropped} imported furniture piece(s) overlapped and were not placed`)
  }
  return { placedFurniture, warnings }
}

/**
 * Associate door/window pieces with the nearest wall and convert each to a
 * `PlanOpening` (wall id + along-wall offset + width + kind). The opening's start
 * offset is its centre's along-wall position minus half its width, clamped to the
 * wall span via the shared `clampOpeningWidth`/`clampOpeningOffset` helpers (the
 * same margin=0 formula every other offset/width-affecting edit routes through —
 * see `src/floorplan/CLAUDE.md`). A piece with no wall within `OPENING_WALL_MAX_DIST`
 * is reported as a warning (and produces no opening). `ceilingHeight` (m) bounds a
 * window's derived head so an imported sill never modelled above the ceiling. Pure.
 */
export function associateOpenings(
  items: readonly Sh3dImportItem[],
  walls: readonly PlanWall[],
  genId: (prefix: string) => string,
  ceilingHeight = DEFAULT_CEILING_M,
): { openings: PlanOpening[]; warnings: string[] } {
  const openings: PlanOpening[] = []
  const warnings: string[] = []
  for (const it of items) {
    if (!it.opening) continue
    const hit = nearestWall(walls, it.position[0], it.position[1], OPENING_WALL_MAX_DIST)
    if (!hit) {
      warnings.push(`Door/window "${it.name}" is not near any wall — skipped`)
      continue
    }
    const wall = hit.wall
    const span = wallLength(wall)
    const width = clampOpeningWidth(Math.max(MIN_OPENING_WIDTH, it.width), span)
    // Centre-based: the piece's centre sits at `centreOffset` along the wall;
    // the opening's start offset is half a width before that, clamped so the
    // whole opening stays on the wall.
    const centreOffset = alongWall(wall, it.position[0], it.position[1])
    const offset = clampOpeningOffset(centreOffset - width / 2, width, span)
    const { sill, head } = openingHeights(it, ceilingHeight)
    openings.push({
      id: genId(it.opening),
      kind: it.opening,
      wallId: wall.id,
      offset: Math.round(offset * 1000) / 1000,
      width: Math.round(width * 1000) / 1000,
      sill,
      head,
    })
  }
  return { openings, warnings }
}

/**
 * Sill + head (m) for an opening piece. Doors always sit on the floor (`sill:
 * 0`) — SH3D doors report `elevation: 0` in the common case, and a raised
 * elevation on a door-tagged piece (e.g. a transom) is not modelled here to
 * avoid regressing the well-understood floor-hung door path; the door's head
 * still honours its own `height` when usable, else the category default.
 *
 * Windows honour the source file's `elevation` (SH3D's "bottom above floor"
 * attribute) as the sill when it's usable (finite, > 0, and below the
 * ceiling) — `head = min(sill + height, ceilingHeight)`, using the
 * sill-to-head default span when the piece carries no height. A missing/zero
 * elevation (or one at/above the ceiling — corrupt data) falls back to the
 * previous fixed default sill/head, preserving back-compat for files that
 * don't report elevation.
 */
function openingHeights(it: Sh3dImportItem, ceilingHeight: number): { sill: number; head: number } {
  const h = Number.isFinite(it.height) && it.height > 0 ? it.height : 0
  if (it.opening === 'window') {
    const elevation = it.elevation
    if (Number.isFinite(elevation) && elevation > 0 && elevation < ceilingHeight) {
      const sill = Math.round(elevation * 1000) / 1000
      const openingSpan = h > 0 ? h : DEFAULT_WINDOW_HEAD - DEFAULT_WINDOW_SILL
      const head = Math.round(Math.min(sill + openingSpan, ceilingHeight) * 1000) / 1000
      return { sill, head }
    }
    const sill = DEFAULT_WINDOW_SILL
    const head = h > 0 ? Math.round((sill + h) * 1000) / 1000 : DEFAULT_WINDOW_HEAD
    return { sill, head }
  }
  return { sill: 0, head: h > 0 ? Math.round(h * 1000) / 1000 : DEFAULT_DOOR_HEAD }
}

/**
 * Full placement pass: resolve furniture + associate openings in one call,
 * merging their warnings. The caller applies `openings` to the plan and
 * `placedFurniture` via `setItems` in a single undoable step. Pure.
 */
export function resolveSh3dImport(
  items: readonly Sh3dImportItem[],
  walls: readonly PlanWall[],
  catalog: Record<string, FurnitureDef>,
  existing: readonly FurnitureItem[],
  genId: (prefix: string) => string,
  ceilingHeight = DEFAULT_CEILING_M,
): Sh3dPlacementResult {
  const furniture = resolveFurniture(items, catalog, existing, genId)
  const openingsRes = associateOpenings(items, walls, genId, ceilingHeight)
  return {
    openings: openingsRes.openings,
    placedFurniture: furniture.placedFurniture,
    warnings: [...furniture.warnings, ...openingsRes.warnings],
  }
}
