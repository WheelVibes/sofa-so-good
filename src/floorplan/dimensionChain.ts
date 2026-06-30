/**
 * Chained dimension strings (PARITY-DIM-CHAIN) — pure core.
 *
 * Mirrors CAD / Sweet Home 3D "chain dimensioning": a row of consecutive
 * dimensions along a single baseline. Each input point is projected onto the
 * baseline (an origin + direction), giving a signed scalar position; the sorted,
 * deduped positions then yield either a chain of adjacent segments, the running
 * (ordinate) distances from the first position, or the overall span.
 *
 * Self-contained: depends ONLY on `./types` (PlanVec2). No three/React imports.
 */
import type { PlanVec2 } from './types'

/** Positions closer than this read as the same point (metres). */
const DEDUPE_EPS = 1e-6

/** One segment of a chain: the signed baseline positions of its two ends and the
 *  span between them. */
export interface ChainSegment {
  from: number
  to: number
  length: number
}

/** Unit-normalize a baseline direction; a zero-length dir falls back to [1, 0]. */
function unitDir(dir: PlanVec2): PlanVec2 {
  const len = Math.hypot(dir[0], dir[1])
  if (len < DEDUPE_EPS) return [1, 0]
  return [dir[0] / len, dir[1] / len]
}

/**
 * Signed distance of `point` projected onto the unit-normalized baseline
 * direction `dir`, measured from `origin`. Positive = ahead of origin along
 * `dir`, negative = behind it.
 */
export function projectToBaseline(point: PlanVec2, origin: PlanVec2, dir: PlanVec2): number {
  const u = unitDir(dir)
  return (point[0] - origin[0]) * u[0] + (point[1] - origin[1]) * u[1]
}

/** Sorted, deduped (within `DEDUPE_EPS`) projected scalar positions. */
function sortedPositions(points: PlanVec2[], origin: PlanVec2, dir: PlanVec2): number[] {
  const u = unitDir(dir)
  const projected = points
    .map((p) => (p[0] - origin[0]) * u[0] + (p[1] - origin[1]) * u[1])
    .sort((a, b) => a - b)
  const out: number[] = []
  for (const v of projected) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]!) > DEDUPE_EPS) out.push(v)
  }
  return out
}

/**
 * Build a chain of consecutive dimension segments along the baseline: project
 * every point, sort ascending, dedupe coincident positions, then emit one
 * segment between each adjacent pair. Returns `[]` for fewer than 2 distinct
 * positions.
 */
export function chainDimensions(
  points: PlanVec2[],
  origin: PlanVec2,
  dir: PlanVec2,
): ChainSegment[] {
  const pos = sortedPositions(points, origin, dir)
  if (pos.length < 2) return []
  const out: ChainSegment[] = []
  for (let i = 0; i < pos.length - 1; i++) {
    const from = pos[i]!
    const to = pos[i + 1]!
    out.push({ from, to, length: to - from })
  }
  return out
}

/**
 * Running ("ordinate") distances from the first (smallest) position to each
 * subsequent distinct position, ascending, starting at 0. Returns `[]` for fewer
 * than 2 distinct positions (a single point has no chain to measure).
 */
export function runningDimensions(points: PlanVec2[], origin: PlanVec2, dir: PlanVec2): number[] {
  const pos = sortedPositions(points, origin, dir)
  if (pos.length < 2) return []
  const base = pos[0]!
  return pos.map((v) => v - base)
}

/**
 * Overall span of the chain: the largest projected position minus the smallest.
 * Returns 0 for fewer than 2 distinct positions.
 */
export function totalChainLength(points: PlanVec2[], origin: PlanVec2, dir: PlanVec2): number {
  const pos = sortedPositions(points, origin, dir)
  if (pos.length < 2) return 0
  return pos[pos.length - 1]! - pos[0]!
}
