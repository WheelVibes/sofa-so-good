/**
 * False-ceiling clearance validator (UX research round 4, R4-2). A pure rule
 * over the EXISTING ceiling model: for every room that has a designed ceiling
 * treatment (a non-flat {@link CeilingConfig}), it re-uses the same geometry
 * engine the 3D scene renders from (`apartment/ceiling/ceilingModel.ts:
 * buildCeiling`) and reads that model's `lowestY` — the world Y of the lowest
 * down-facing surface, i.e. the finished clearance in metres above the finished
 * floor (FFL at 0). It never re-derives drop geometry, so a warning can never
 * drift from what the ceiling actually builds.
 *
 * SG norms (sources in the constants below): keep at least 2.4 m of finished
 * headroom under a dropped/false ceiling; cornices may come down to ~2.1 m.
 * Flat rooms (no treatment) and rooms the geometry engine falls back on
 * (non-rectangular / ceiling too low to drop anything) have nothing to warn
 * about and are skipped.
 *
 * Pure: no three/React imports (only the pure `buildCeiling` + plan types), so
 * it stays unit-testable and safe to import anywhere.
 */
import { buildCeiling } from '../apartment/ceiling/ceilingModel'
import { allPlanRooms } from './levels'
import type { CeilingStyle, FloorPlan } from './types'
import { roomPolygon } from './types'

/** Standard HDB slab-to-slab height (m). Source: qanvast.com/sg/articles/
 *  standard-hdb-ceiling-heights-what-you-cancannot-do-to-alter-them-3527. */
export const STANDARD_SLAB_M = 2.6
/** Minimum finished clearance to keep under a dropped/false ceiling (m).
 *  Source: ifix.sg/hdb-ceiling-height-explained (keep ≥ 2.4 m usable head). */
export const MIN_FINISHED_CLEARANCE_M = 2.4
/** Lowest acceptable point for a cornice/bulkhead edge (m) — cornices can dip
 *  to ~2.1 m. Source: as above. Below this is flagged as too low even for a
 *  cornice. */
export const CORNICE_MIN_M = 2.1

const MIN_FINISHED_CLEARANCE_MM = Math.round(MIN_FINISHED_CLEARANCE_M * 1000)
const CORNICE_MIN_MM = Math.round(CORNICE_MIN_M * 1000)
const STANDARD_SLAB_MM = Math.round(STANDARD_SLAB_M * 1000)

/** One room's false-ceiling clearance result. */
interface ClearanceZone {
  roomId: string
  roomName: string
  /** The designed treatment (never `'flat'` — flat rooms are skipped). */
  style: Exclude<CeilingStyle, 'flat'>
  /** Depth of the drop below the room's flat ceiling height (mm). */
  dropMm: number
  /** Finished clearance under the lowest treatment surface (mm AFFL). */
  clearanceMm: number
  /** Meets the SG minimum finished clearance (≥ 2.4 m). */
  pass: boolean
  /** Below even the cornice floor (< 2.1 m) — too low for any element. */
  belowCornice: boolean
}

interface CeilingClearanceThresholds {
  standardSlabMm: number
  minFinishedClearanceMm: number
  corniceMinMm: number
}

export interface CeilingClearanceResult {
  zones: ClearanceZone[]
  /** Zones failing the 2.4 m minimum. */
  warnCount: number
  /** True when every designed treatment passes (also true when there are none). */
  allPass: boolean
  thresholds: CeilingClearanceThresholds
}

const THRESHOLDS: CeilingClearanceThresholds = {
  standardSlabMm: STANDARD_SLAB_MM,
  minFinishedClearanceMm: MIN_FINISHED_CLEARANCE_MM,
  corniceMinMm: CORNICE_MIN_MM,
}

/**
 * Compute the finished-clearance check across every room (all storeys, via
 * `allPlanRooms`). Rooms with no ceiling treatment, a flat ceiling, or a
 * treatment the geometry engine falls back on are skipped. Never NaNs on an
 * empty plan.
 */
export function buildCeilingClearance(plan: FloorPlan): CeilingClearanceResult {
  const empty: CeilingClearanceResult = {
    zones: [],
    warnCount: 0,
    allPass: true,
    thresholds: THRESHOLDS,
  }
  if (!plan) return empty
  const defaultCeilingHeightM =
    typeof plan.ceilingHeight === 'number' ? plan.ceilingHeight : STANDARD_SLAB_M

  const zones: ClearanceZone[] = []
  for (const room of allPlanRooms(plan)) {
    const config = room.ceiling
    if (!config || config.style === 'flat') continue // no treatment → nothing to warn

    const ceilM =
      typeof room.ceilingHeight === 'number' ? room.ceilingHeight : defaultCeilingHeightM
    const outline = roomPolygon(room)
    const model = buildCeiling(outline, ceilM, config)
    // Fallback → the treatment wasn't actually applied (non-rect / too low); the
    // 3D render draws a plain flat ceiling, so there's no drop to warn against.
    if (model.fallback) continue

    const clearanceMm = Math.round(model.lowestY * 1000)
    const dropMm = Math.round((ceilM - model.lowestY) * 1000)
    zones.push({
      roomId: room.id,
      roomName: room.name,
      style: config.style as Exclude<CeilingStyle, 'flat'>,
      dropMm,
      clearanceMm,
      pass: clearanceMm >= MIN_FINISHED_CLEARANCE_MM,
      belowCornice: clearanceMm < CORNICE_MIN_MM,
    })
  }

  const warnCount = zones.filter((z) => !z.pass).length
  return { zones, warnCount, allPass: warnCount === 0, thresholds: THRESHOLDS }
}
