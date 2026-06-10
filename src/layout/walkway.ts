/**
 * Circulation / walkway-width check — pure logic (no React, no three.js).
 *
 * Finds "pinch points": pairs of nearby floor-standing pieces (and pieces vs.
 * walls) whose clear walking gap is narrower than the HDB circulation
 * thresholds in `designRules.ts`:
 *   - tight     < CLEARANCE.walkwayMin   (0.6 m)
 *   - sub-ideal < CLEARANCE.walkwayIdeal (0.9 m)
 *
 * The gap is the minimum distance between the two footprint OBBs (item↔item) or
 * between a footprint OBB and a wall segment (item↔wall) — i.e. the width of the
 * clear floor a person would squeeze through. It reuses the footprint math from
 * `collision/placement.ts` (`itemFootprint`) and the OBB corner helper from
 * `collision/obb.ts` (`obbCorners`), so it sees exactly the geometry placement
 * collision sees.
 *
 * Heuristics / false-positive guards (deliberate):
 *   - Only non-mounted, non-noClip items participate (rugs, wall art and ceiling
 *     fixtures don't form floor pinch points).
 *   - Overlapping footprints are NOT reported — a gap of 0 is an overlap, which
 *     is `findItemOverlaps`'s job, a separate check. Only strictly-positive gaps
 *     below the ideal threshold are flagged.
 *   - Gaps at or below `CLEARANCE.sofaToCoffee` (0.4 m) are ignored: pieces that
 *     close are intentionally within arm's reach (sofa ↔ coffee table, bedside
 *     table ↔ bed), not a walkway someone passes through. Flagging them would be
 *     a constant false positive, so the reported band is (sofaToCoffee, ideal).
 *   - Only pairs whose footprint centres are within `PROXIMITY` (~3 m) are
 *     considered, so distant pieces never produce a spurious "gap".
 *
 * O(n²) over items plus O(n·walls) for the wall pass — fine at design scale;
 * callers should gate it behind an open panel / report build.
 */

import { type OBB, obbCorners } from '../collision/obb'
import { itemFootprint } from '../collision/placement'
import type { CollisionWall } from '../collision/walls'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { isDefaultPlan } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { CLEARANCE } from './designRules'

/** Only consider pieces whose footprint centres are within this many metres of
 *  each other — beyond it the gap between them isn't a walkway anyone uses. */
const PROXIMITY = 3

/** Severity of a narrow gap, mapped to the two HDB thresholds. */
export type GapSeverity = 'tight' | 'sub-ideal'

export interface NarrowGap {
  /** First item's id. */
  a: string
  /** Second participant: another item's id, or a wall id (`wall:<n>`). */
  b: string
  /** Clear gap between the two footprints, in metres. */
  gap: number
  /** `tight` (< walkwayMin) or `sub-ideal` (< walkwayIdeal). */
  severity: GapSeverity
  /** True when `b` is a wall segment rather than a second item. */
  wall: boolean
}

/** Squared distance between two points. */
function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

/** Distance from point P to the closed segment AB (XZ plane). */
function pointSegmentDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return Math.hypot(px - ax, pz - az)
  let t = ((px - ax) * dx + (pz - az) * dz) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

/** Distance between two closed segments AB and CD (XZ plane). 0 if they cross. */
function segmentSegmentDist(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): number {
  // If the segments intersect, distance is 0 (handles touching too).
  const r1x = bx - ax
  const r1z = bz - az
  const r2x = dx - cx
  const r2z = dz - cz
  const denom = r1x * r2z - r1z * r2x
  if (Math.abs(denom) > 1e-12) {
    const ex = cx - ax
    const ez = cz - az
    const t = (ex * r2z - ez * r2x) / denom
    const u = (ex * r1z - ez * r1x) / denom
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0
  }
  // Otherwise the minimum is at one of the four endpoint-to-other-segment cases.
  return Math.min(
    pointSegmentDist(ax, az, cx, cz, dx, dz),
    pointSegmentDist(bx, bz, cx, cz, dx, dz),
    pointSegmentDist(cx, cz, ax, az, bx, bz),
    pointSegmentDist(dx, dz, ax, az, bx, bz),
  )
}

/** The four edges of an OBB as [ax,az,bx,bz] tuples. */
function obbEdges(o: OBB): Array<[number, number, number, number]> {
  const c = obbCorners(o)
  const edges: Array<[number, number, number, number]> = []
  for (let i = 0; i < 4; i++) {
    const p = c[i]!
    const q = c[(i + 1) % 4]!
    edges.push([p[0], p[1], q[0], q[1]])
  }
  return edges
}

/** Minimum distance between two (non-overlapping) OBB footprints, in metres.
 *  Computed as the smallest edge-to-edge distance — exact for convex polygons
 *  that don't overlap. Callers must have already excluded overlapping pairs. */
function obbGap(a: OBB, b: OBB): number {
  const ea = obbEdges(a)
  const eb = obbEdges(b)
  let min = Infinity
  for (const [ax, az, bx, bz] of ea) {
    for (const [cx, cz, dx, dz] of eb) {
      const d = segmentSegmentDist(ax, az, bx, bz, cx, cz, dx, dz)
      if (d < min) min = d
    }
  }
  return min
}

/** Minimum distance between an OBB footprint and a wall centerline segment. */
function obbWallGap(o: OBB, w: CollisionWall): number {
  let min = Infinity
  for (const [ax, az, bx, bz] of obbEdges(o)) {
    const d = segmentSegmentDist(ax, az, bx, bz, w.ax, w.az, w.bx, w.bz)
    if (d < min) min = d
  }
  return min
}

/** Classify a positive gap; returns null when it's at/above the ideal. */
function classify(gap: number): GapSeverity | null {
  if (gap < CLEARANCE.walkwayMin) return 'tight'
  if (gap < CLEARANCE.walkwayIdeal) return 'sub-ideal'
  return null
}

/** True for pieces that take part in floor circulation pinch checks. */
function participates(def: FurnitureDef | undefined): def is FurnitureDef {
  return !!def && !def.mounted && !def.noClip
}

/**
 * Find every narrow walkway gap in the design. Reports each unordered item↔item
 * pair at most once and each item↔wall pinch at most once (the wall with the
 * smallest gap to that item). Gaps are only flagged when they fall in the band
 * `(CLEARANCE.sofaToCoffee, CLEARANCE.walkwayIdeal)` — overlaps and intentional
 * arm's-reach spacing are excluded (see module docs).
 *
 * @param items   placed furniture
 * @param defs    catalog the items resolve their footprints against
 * @param plan    active floor plan; wall pinches are only checked for the
 *                default flat (its fixed door-aware walls), and skipped when
 *                walls aren't available for a custom plan.
 */
export function findNarrowGaps(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  plan: FloorPlan,
): NarrowGap[] {
  const out: NarrowGap[] = []

  // Pre-resolve footprints for participating items once.
  const parts: Array<{ id: string; obb: OBB }> = []
  for (const it of items) {
    const def = defs[it.defId]
    if (!participates(def)) continue
    parts.push({ id: it.id, obb: itemFootprint(it, def) })
  }

  // Item ↔ item.
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i]!
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j]!
      if (dist2(a.obb.cx, a.obb.cz, b.obb.cx, b.obb.cz) > PROXIMITY * PROXIMITY) continue
      const gap = obbGap(a.obb, b.obb)
      // Skip overlaps (gap ~0, handled elsewhere) and intentional close spacing.
      if (gap <= CLEARANCE.sofaToCoffee) continue
      const severity = classify(gap)
      if (severity) out.push({ a: a.id, b: b.id, gap, severity, wall: false })
    }
  }

  // Item ↔ wall — default flat only (fixed door-aware walls); skip otherwise.
  if (isDefaultPlan(plan)) {
    const walls = buildCollisionWalls({})
    if (walls.length > 0) {
      for (const p of parts) {
        let best: { gap: number; wall: number } | null = null
        for (let w = 0; w < walls.length; w++) {
          const gap = obbWallGap(p.obb, walls[w]!)
          if (gap <= CLEARANCE.sofaToCoffee) continue
          if (!best || gap < best.gap) best = { gap, wall: w }
        }
        if (best) {
          const severity = classify(best.gap)
          if (severity)
            out.push({
              a: p.id,
              b: `wall:${best.wall}`,
              gap: best.gap,
              severity,
              wall: true,
            })
        }
      }
    }
  }

  return out
}
