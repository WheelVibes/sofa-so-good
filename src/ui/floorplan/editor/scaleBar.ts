/**
 * Dynamic scale-bar choice for the 2D floor-plan editor (PARITY-SCALEBAR). Unlike
 * the print report's `scaleBarChoice` (sized to the plan width), the editor bar is
 * **zoom-aware**: it picks a nice round real-world length whose on-screen pixel
 * width is close to `targetPx`, so the bar stays a useful ~100 px reference as the
 * user zooms in/out. Pure (no React/DOM) so it unit-tests in isolation.
 */
import type { UnitSystem } from '../../../utils/measurement'

/** Nice round metric lengths (metres) and imperial lengths (feet). */
const METRIC_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]
const IMPERIAL_FT = [0.5, 1, 2, 5, 10, 20, 50, 100, 200]
const FT_M = 0.3048

export interface ScaleBarChoice {
  /** The bar's real-world length, in metres. */
  meters: number
  /** The bar's on-screen width, in pixels (`meters * pxPerM`). */
  px: number
  /** Human label, e.g. "2 m", "50 cm", "10 ft". */
  label: string
}

/**
 * Choose the largest nice round length whose pixel width does not exceed
 * `targetPx` (falling back to the smallest step when even that overflows — when
 * extremely zoomed in). `pxPerM` is the editor's current pixels-per-metre
 * (`basePX * zoom`). Throws on a non-positive / non-finite scale.
 */
export function chooseScaleBar(pxPerM: number, units: UnitSystem, targetPx = 110): ScaleBarChoice {
  if (!Number.isFinite(pxPerM) || pxPerM <= 0) {
    throw new Error(`chooseScaleBar: pxPerM must be a positive finite number, got ${pxPerM}`)
  }
  if (units === 'imperial') {
    let chosen = IMPERIAL_FT[0]
    for (const ft of IMPERIAL_FT) {
      if (ft * FT_M * pxPerM <= targetPx) chosen = ft
    }
    const meters = chosen * FT_M
    return { meters, px: meters * pxPerM, label: `${chosen} ft` }
  }
  let chosen = METRIC_STEPS[0]
  for (const m of METRIC_STEPS) {
    if (m * pxPerM <= targetPx) chosen = m
  }
  return {
    meters: chosen,
    px: chosen * pxPerM,
    label: chosen < 1 ? `${Math.round(chosen * 100)} cm` : `${chosen} m`,
  }
}
