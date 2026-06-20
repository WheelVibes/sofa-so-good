import { describe, expect, it } from 'vitest'
import {
  clampFocalMm,
  clampFocusDistance,
  clampFStop,
  FOCAL_DEFAULT_MM,
  FOCAL_MAX_MM,
  FOCAL_MIN_MM,
  FOCUS_DEFAULT_M,
  FOCUS_MAX_M,
  FOCUS_MIN_M,
  FSTOP_MAX,
  FSTOP_MIN,
  fovToMm,
  mmToFov,
  rasterDofParams,
  SENSOR_HEIGHT_MM,
} from './cameraLensSettings'

describe('cameraLensSettings clamps', () => {
  it('clampFocalMm bounds + non-finite → default', () => {
    expect(clampFocalMm(50)).toBe(50)
    expect(clampFocalMm(5)).toBe(FOCAL_MIN_MM)
    expect(clampFocalMm(9999)).toBe(FOCAL_MAX_MM)
    expect(clampFocalMm(Number.NaN)).toBe(FOCAL_DEFAULT_MM)
    expect(clampFocalMm(Number.POSITIVE_INFINITY)).toBe(FOCAL_DEFAULT_MM)
  })

  it('clampFStop: 0/negative/non-finite → 0 (off), else clamped to range', () => {
    expect(clampFStop(0)).toBe(0)
    expect(clampFStop(-3)).toBe(0)
    expect(clampFStop(Number.NaN)).toBe(0)
    expect(clampFStop(2.8)).toBe(2.8)
    expect(clampFStop(0.4)).toBe(FSTOP_MIN)
    expect(clampFStop(100)).toBe(FSTOP_MAX)
  })

  it('clampFocusDistance bounds + non-finite → default', () => {
    expect(clampFocusDistance(3)).toBe(3)
    expect(clampFocusDistance(0.01)).toBe(FOCUS_MIN_M)
    expect(clampFocusDistance(9999)).toBe(FOCUS_MAX_M)
    expect(clampFocusDistance(Number.NaN)).toBe(FOCUS_DEFAULT_M)
  })
})

describe('mm ↔ vertical FOV conversion', () => {
  it('mmToFov uses the vertical sensor height (24 mm full-frame)', () => {
    // 50 mm on a 24 mm-tall sensor: 2*atan(12/50) ≈ 27.0°.
    expect(mmToFov(50)).toBeCloseTo((2 * Math.atan(12 / 50) * 180) / Math.PI, 4)
    // A wider lens → a wider FOV.
    expect(mmToFov(24)).toBeGreaterThan(mmToFov(50))
    expect(mmToFov(85)).toBeLessThan(mmToFov(50))
  })

  it('respects a custom sensor height', () => {
    expect(mmToFov(50, 36)).toBeCloseTo((2 * Math.atan(18 / 50) * 180) / Math.PI, 4)
  })

  it('round-trips mm → fov → mm across the presets', () => {
    for (const mm of [24, 35, 50, 85]) {
      expect(fovToMm(mmToFov(mm))).toBeCloseTo(mm, 4)
    }
  })

  it('fovToMm clamps + handles bad input', () => {
    expect(fovToMm(Number.NaN)).toBe(FOCAL_DEFAULT_MM)
    expect(fovToMm(0)).toBe(FOCAL_DEFAULT_MM)
    // A very wide FOV maps to a focal below the minimum → clamped up.
    expect(fovToMm(179)).toBe(FOCAL_MIN_MM)
    // A very narrow FOV maps to a long focal → clamped down.
    expect(fovToMm(0.01)).toBe(FOCAL_MAX_MM)
  })

  it('exposes the full-frame sensor height constant', () => {
    expect(SENSOR_HEIGHT_MM).toBe(24)
  })
})

describe('rasterDofParams', () => {
  it('returns zeroed params when the aperture is off', () => {
    expect(rasterDofParams(0)).toEqual({ bokehScale: 0, worldFocusRange: 0 })
    expect(rasterDofParams(-1)).toEqual({ bokehScale: 0, worldFocusRange: 0 })
  })

  it('a wider aperture (lower f-stop) → bigger bokeh + shallower focus range', () => {
    const wide = rasterDofParams(1.4)
    const narrow = rasterDofParams(8)
    expect(wide.bokehScale).toBeGreaterThan(narrow.bokehScale)
    expect(wide.worldFocusRange).toBeLessThan(narrow.worldFocusRange)
  })

  it('clamps bokeh + focus range to modest raster-safe bounds', () => {
    const p = rasterDofParams(1)
    expect(p.bokehScale).toBeLessThanOrEqual(6)
    expect(p.bokehScale).toBeGreaterThanOrEqual(1)
    const deep = rasterDofParams(22)
    expect(deep.worldFocusRange).toBeLessThanOrEqual(4)
    expect(deep.worldFocusRange).toBeGreaterThanOrEqual(0.5)
  })
})
