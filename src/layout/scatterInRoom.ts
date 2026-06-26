/**
 * Scatter-fill a room (PARITY-SCATTER-ROOM).
 *
 * Evenly fills a room's free floor with up to `count` collision-avoiding copies
 * of a single footprint, laid out on a **packed grid** sized to the footprint +
 * clearance. The candidate cells are visited in a deterministic, seeded order so
 * a fixed seed always yields the same layout; when fewer cells are wanted than
 * fit, the seeded order decides which spread of cells is kept (still even, since
 * the grid spacing is uniform).
 *
 * Pure + deterministic (no store, no three, no React) — unit-testable. It REUSES
 * the existing geometry/collision primitives:
 *   - `pointInPolygon` (floorplan/types) for room containment — handles concave
 *     / L-shaped / notched polygons via the even-odd rule.
 *   - `canPlace` (collision/placement) for the no-overlap guarantee against the
 *     already-placed `existing` items (and walls, when supplied).
 *
 * The caller (inspector / room-editor action) is responsible for turning the
 * returned positions into real `FurnitureItem`s and committing them in one undo
 * step — exactly like the linear / radial / path array sections do.
 */

import { canPlace } from '../collision/placement'
import type { CollisionWall } from '../collision/walls'
import { type PlanVec2, pointInPolygon, polygonArea } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem, ParamProps } from '../furniture/types'

/** A single scattered placement (floor position + the chosen yaw). */
export interface ScatterPlacement {
  /** [x, z] in metres, apartment frame. */
  position: [number, number]
  /** Y-axis rotation (yaw) in radians — carried from the source so copies keep
   *  the source's facing. */
  rotation: number
}

export interface ScatterResult {
  /** The collision-safe placements, capped at `count`. */
  placements: ScatterPlacement[]
  /** How many copies were requested. */
  requested: number
  /** How many were actually placed (`placements.length`). `placed < requested`
   *  means the room's free floor couldn't fit them all — the caller should
   *  surface a "placed N of M" notice. */
  placed: number
}

export interface ScatterOptions {
  /** Already-placed items the scatter must avoid (collision-checked). The source
   *  item being scattered should be included here if it should be respected. */
  existing?: FurnitureItem[]
  /** Catalog needed to resolve `existing` items' footprints for collision. */
  defs?: Record<string, FurnitureDef>
  /** Open/closed door state for wall-aware collision (defaults to none). */
  doors?: Record<string, { open: boolean }>
  /** The room's solid perimeter walls, so a copy can't be placed past them.
   *  Optional — containment is already enforced by the polygon test; pass the
   *  room-editor walls for belt-and-braces parity with the other array tools. */
  walls?: CollisionWall[]
  /** Extra spacing (m) between footprints and from the wall, on top of the
   *  footprint size. Default 0.1 m. */
  clearance?: number
  /** Yaw (radians) applied to every copy. Default 0. */
  rotation?: number
  /** The level the copies sit on (collision is level-gated). */
  levelId?: string
  /** Seed for the deterministic cell-visit order. Default 1. */
  seed?: number
  /** defId used for the collision probe — must match `footprint`. When omitted a
   *  synthetic probe def is used (footprint-only, no walls clip exemption). */
  defId?: string
}

/** Footprint to scatter: the piece's plan size in metres. */
export interface ScatterFootprint {
  w: number
  d: number
  /** Height (m) — only needed for height-aware collision; defaults to 1. */
  h?: number
}

/** mulberry32 — the same tiny seeded PRNG the decor styler uses, so the whole
 *  app shares one deterministic-layout primitive. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return (): number => {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

/** Axis-aligned bounds of a polygon. */
function polygonBounds(poly: PlanVec2[]): {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
} {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const [x, z] of poly) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return { minX, minZ, maxX, maxZ }
}

/** True iff every corner of the footprint centred at (cx,cz) lies inside the
 *  polygon — so the piece sits wholly within the room rather than poking a
 *  corner through a wall. The footprint half-extents are rotated by `rot` so a
 *  turned piece is tested at its true orientation. */
function footprintInsidePolygon(
  cx: number,
  cz: number,
  hw: number,
  hd: number,
  rot: number,
  poly: PlanVec2[],
): boolean {
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  for (const [sx, sz] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ] as const) {
    const x = cx + cos * sx - sin * sz
    const z = cz + sin * sx + cos * sz
    if (!pointInPolygon(x, z, poly)) return false
  }
  return true
}

/**
 * Compute up to `count` collision-safe positions that evenly fill `roomPolygon`'s
 * free floor on a packed grid of `footprint`-sized cells (+ `clearance`).
 *
 * Algorithm:
 *   1. Cell pitch = footprint size + clearance on each axis; lay a grid over the
 *      polygon's bounding box, centred so the row/column band hugs the interior.
 *   2. Keep only cells whose whole (rotation-aware) footprint is inside the
 *      polygon — drops cells outside a concave/L room and cells straddling a wall.
 *   3. Visit the in-polygon cells in a seeded order (deterministic by `seed`),
 *      placing each that passes `canPlace` against `existing` + already-placed
 *      copies; stop at `count`.
 *
 * Returns the placements plus requested/placed counts so the caller can report
 * an over-count cap. Degenerate inputs (`count <= 0`, < 3 vertices, zero-area or
 * footprint-too-big room) return an empty placement list.
 */
export function scatterInRoom(
  roomPolygon: PlanVec2[],
  footprint: ScatterFootprint,
  count: number,
  opts: ScatterOptions = {},
): ScatterResult {
  const requested = Math.max(0, Math.floor(count))
  const empty: ScatterResult = { placements: [], requested, placed: 0 }
  if (requested === 0) return empty
  if (roomPolygon.length < 3) return empty
  if (polygonArea(roomPolygon) <= 0) return empty
  if (footprint.w <= 0 || footprint.d <= 0) return empty

  const clearance = Math.max(0, opts.clearance ?? 0.1)
  const rot = opts.rotation ?? 0
  const seed = opts.seed ?? 1

  // Pitch between cell centres: full footprint + one clearance gap. Use the
  // rotation-aware AABB extent so a turned footprint still tiles without overlap.
  const cos = Math.abs(Math.cos(rot))
  const sin = Math.abs(Math.sin(rot))
  const aabbW = cos * footprint.w + sin * footprint.d
  const aabbD = sin * footprint.w + cos * footprint.d
  const pitchX = aabbW + clearance
  const pitchZ = aabbD + clearance
  const hw = footprint.w / 2
  const hd = footprint.d / 2

  const { minX, minZ, maxX, maxZ } = polygonBounds(roomPolygon)
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  // A footprint wider/deeper than the room can't fit at all.
  if (aabbW > spanX + 1e-9 || aabbD > spanZ + 1e-9) return empty

  const cols = Math.max(1, Math.floor((spanX + 1e-9) / pitchX))
  const rows = Math.max(1, Math.floor((spanZ + 1e-9) / pitchZ))
  // Centre the grid band inside the bbox so the margins on each side are equal.
  const usedX = (cols - 1) * pitchX
  const usedZ = (rows - 1) * pitchZ
  const startX = minX + (spanX - usedX) / 2
  const startZ = minZ + (spanZ - usedZ) / 2

  // Candidate cell centres whose whole footprint is inside the room polygon.
  const cells: PlanVec2[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = startX + c * pitchX
      const cz = startZ + r * pitchZ
      if (footprintInsidePolygon(cx, cz, hw, hd, rot, roomPolygon)) cells.push([cx, cz])
    }
  }
  if (cells.length === 0) return empty

  // Deterministic Fisher–Yates shuffle (seeded) — so which cells are chosen when
  // count < cells is stable per seed and varies per seed, while spacing stays
  // even (the grid is uniform).
  const rng = mulberry32(seed)
  const order = cells.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = order[i]!
    order[i] = order[j]!
    order[j] = tmp
  }

  const defs = opts.defs ?? {}
  const doors = opts.doors ?? {}
  const probeDef = opts.defId ? defs[opts.defId] : undefined
  // A synthetic footprint-only def so collision works even without a catalog
  // entry (e.g. unit tests). It is parametric so `itemFootprint` reads the
  // width/depth props rather than a GLB cache.
  const scatterDef: FurnitureDef =
    probeDef ??
    ({
      id: '__scatter_probe__',
      kind: 'parametric',
      name: 'scatter probe',
      category: 'others',
      primitive: 'Bed',
      defaultFootprint: { w: footprint.w, d: footprint.d, h: footprint.h ?? 1 },
      paramSchema: [],
    } as unknown as FurnitureDef)
  const probeDefId = opts.defId ?? '__scatter_probe__'
  const probeProps: ParamProps =
    scatterDef.kind === 'parametric' ? { width: footprint.w, depth: footprint.d } : {}

  const placements: ScatterPlacement[] = []
  // Start the collision pool with the externally-supplied items, then grow it
  // as we commit copies so newly-placed pieces are respected too.
  let others: FurnitureItem[] = opts.existing ? opts.existing.slice() : []
  const ctxDefs = { ...defs, [probeDefId]: scatterDef }

  for (const [cx, cz] of order) {
    if (placements.length >= requested) break
    const probe: FurnitureItem = {
      id: `__scatter_${placements.length}__`,
      defId: probeDefId,
      position: [cx, cz],
      rotation: rot,
      levelId: opts.levelId,
      props: probeProps,
    }
    if (!canPlace(probe, scatterDef, { others, defs: ctxDefs, doors, walls: opts.walls })) continue
    placements.push({ position: [cx, cz], rotation: rot })
    others = others.concat(probe)
  }

  return { placements, requested, placed: placements.length }
}
