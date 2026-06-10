/**
 * Demolition / hacking + new-wall plan (feature F30).
 *
 * SG renovation quotes include a "hacking plan": which walls of the original
 * (as-built) layout are demolished, which are newly built, and which are kept,
 * relative to the original shell. This module is the PURE diff core.
 *
 * Walls are matched by geometry: a wall A→B equals B→A (order-independent
 * endpoints) within a small epsilon. A wall present in `original` but absent
 * from `current` is demolished (hacked); present in `current` but absent from
 * `original` is added (new); present in both is kept.
 *
 * Self-contained: imports only `./types`.
 */

import { type FloorPlan, type PlanWall, wallLength } from './types'

export interface WallDiff {
  /** Walls present in both plans (same geometry). */
  kept: PlanWall[]
  /** Walls in `original` but not in `current` — to be demolished/hacked. */
  demolished: PlanWall[]
  /** Walls in `current` but not in `original` — newly built. */
  added: PlanWall[]
  /** Total length (m) of demolished walls. */
  hackedLengthM: number
  /** Total length (m) of added walls. */
  addedLengthM: number
}

/** Endpoint match tolerance, in metres (1 mm). */
export const MATCH_EPSILON = 1e-3

function asWalls(plan: FloorPlan): PlanWall[] {
  return plan && Array.isArray(plan.walls) ? plan.walls : []
}

function ptEq(a: readonly [number, number], b: readonly [number, number], eps: number): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps
}

/** Two walls are the same segment if their endpoint pairs match in either order. */
function sameWall(a: PlanWall, b: PlanWall, eps: number): boolean {
  return (
    (ptEq(a.start, b.start, eps) && ptEq(a.end, b.end, eps)) ||
    (ptEq(a.start, b.end, eps) && ptEq(a.end, b.start, eps))
  )
}

/**
 * Diff `current` against `original`, classifying every wall as kept,
 * demolished, or added by order-independent endpoint geometry. Each wall is
 * matched at most once so duplicate-geometry walls pair up one-to-one.
 */
export function diffWalls(original: FloorPlan, current: FloorPlan): WallDiff {
  const origWalls = asWalls(original)
  const curWalls = asWalls(current)

  const kept: PlanWall[] = []
  const demolished: PlanWall[] = []
  const added: PlanWall[] = []

  // Track which current walls have been paired so each matches at most once.
  const curMatched = new Array<boolean>(curWalls.length).fill(false)

  for (const o of origWalls) {
    let matchIdx = -1
    for (let i = 0; i < curWalls.length; i++) {
      if (curMatched[i]) continue
      const c = curWalls[i]
      if (c && sameWall(o, c, MATCH_EPSILON)) {
        matchIdx = i
        break
      }
    }
    if (matchIdx >= 0) {
      curMatched[matchIdx] = true
      kept.push(o)
    } else {
      demolished.push(o)
    }
  }

  for (let i = 0; i < curWalls.length; i++) {
    if (!curMatched[i]) {
      const c = curWalls[i]
      if (c) added.push(c)
    }
  }

  const sumLen = (ws: PlanWall[]) => ws.reduce((s, w) => s + wallLength(w), 0)

  return {
    kept,
    demolished,
    added,
    hackedLengthM: sumLen(demolished),
    addedLengthM: sumLen(added),
  }
}
