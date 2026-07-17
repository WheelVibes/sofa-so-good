/**
 * Pure placement math for AI plan recognition: turn the model's centre-point
 * openings (`AiOpening`) into concrete plan openings on the drafted walls, and
 * decide whether an AI scale estimate should calibrate the trace backdrop.
 *
 * No store / React / three / DOM — every input is passed in, so both halves are
 * unit-tested in isolation. The store apply path (walls → openings → scale) lives
 * in `ui/floorplan/editor/usePlanAiWalls.ts`, which consumes these results.
 */
import { clampOpeningOffset, clampOpeningWidth } from '../floorplan/types'
import type { AiOpening, AiWall } from './floorPlanAi'

/** A resolved opening ready to hand to `addOpening`, keyed by the INDEX of its
 *  host wall in the recognized `walls` array (the apply path maps that index to
 *  the real wall id returned by `addWall`). */
export interface PlacedAiOpening {
  wallIndex: number
  kind: AiOpening['kind']
  /** Distance along the wall (from its start) to the opening's start. */
  offset: number
  width: number
  sill: number
  head: number
}

/** Default sill/head (m) per opening kind — mirrors the door/window tool
 *  defaults in `FloorPlanEditor` (door: floor→2.1; window: 0.9→2.1). */
const OPENING_HEIGHTS: Record<AiOpening['kind'], { sill: number; head: number }> = {
  door: { sill: 0, head: 2.1 },
  window: { sill: 0.9, head: 2.1 },
}

/** Walls shorter than this (m) can't host an opening and are skipped. */
const MIN_HOST_WALL_LEN = 0.1

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Snap each AI opening onto the nearest recognized wall and compute its
 * along-wall offset. An opening whose centre is farther than `maxSnapDist` (m)
 * from every wall is dropped as spurious. Width is clamped to the host wall, and
 * the offset re-clamped so `[offset, offset+width]` stays on the wall. Returns
 * one `PlacedAiOpening` per successfully-placed opening (order preserved). Pure.
 */
export function placeAiOpenings(
  walls: AiWall[],
  openings: AiOpening[],
  { maxSnapDist = 0.9 }: { maxSnapDist?: number } = {},
): PlacedAiOpening[] {
  const placed: PlacedAiOpening[] = []
  for (const o of openings) {
    let bestWall = -1
    let bestDist = Number.POSITIVE_INFINITY
    let bestAlong = 0
    let bestLen = 0
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i]!
      const dx = w.x2 - w.x1
      const dz = w.z2 - w.z1
      const len = Math.hypot(dx, dz)
      if (len < MIN_HOST_WALL_LEN) continue
      const t = clamp01(((o.x - w.x1) * dx + (o.z - w.z1) * dz) / (len * len))
      const projX = w.x1 + t * dx
      const projZ = w.z1 + t * dz
      const d = Math.hypot(o.x - projX, o.z - projZ)
      if (d < bestDist) {
        bestDist = d
        bestWall = i
        bestAlong = t * len
        bestLen = len
      }
    }
    if (bestWall < 0 || bestDist > maxSnapDist) continue
    const width = clampOpeningWidth(o.width, bestLen)
    const offset = clampOpeningOffset(bestAlong - width / 2, width, bestLen)
    const { sill, head } = OPENING_HEIGHTS[o.kind]
    placed.push({ wallIndex: bestWall, kind: o.kind, offset, width, sill, head })
  }
  return placed
}

/**
 * Should an AI scale estimate calibrate the backdrop? Only when the model
 * actually returned a usable (finite, positive) `mPerPx` AND the user hasn't
 * already calibrated the backdrop manually with the Scale tool — a manual
 * calibration always wins over the AI's best-effort guess. Pure.
 */
export function shouldApplyAiScale(
  mPerPx: number | undefined,
  alreadyCalibrated: boolean,
): mPerPx is number {
  return !alreadyCalibrated && typeof mPerPx === 'number' && Number.isFinite(mPerPx) && mPerPx > 0
}
