import { describe, expect, it } from 'vitest'
import { mmToFov } from '../cameras/cameraLensSettings'
import { clampHqOptions, type HqRenderOptions } from './hqRenderSession'

describe('clampHqOptions', () => {
  it('clamps dimensions and samples to GPU-safe bounds', () => {
    expect(clampHqOptions({ width: 99999, height: 0, maxSamples: 1e9 })).toEqual({
      width: 4096,
      height: 64,
      maxSamples: 4096,
    })
    expect(clampHqOptions({ width: 1920, height: 1080, maxSamples: 256 })).toEqual({
      width: 1920,
      height: 1080,
      maxSamples: 256,
    })
    expect(clampHqOptions({ width: Number.NaN, height: -5, maxSamples: 0 })).toEqual({
      width: 64,
      height: 64,
      maxSamples: 1,
    })
  })
})

describe('HqRenderOptions lens + DoF wiring (PC2-CAM-DOF-LENS)', () => {
  it('accepts the optional lens/focus fields alongside the f-stop', () => {
    // Type-level contract: the option bag carries the new lens controls. The
    // session maps `focalLengthMm` → a vertical FOV via the shared `mmToFov`
    // and uses `focusDistance` (when set) to override centre-screen auto-focus.
    const opts: HqRenderOptions = {
      width: 1920,
      height: 1080,
      maxSamples: 256,
      fStop: 2.8,
      focalLengthMm: 85,
      focusDistance: 4.5,
    }
    expect(opts.focalLengthMm).toBe(85)
    expect(opts.focusDistance).toBe(4.5)
    // The FOV the session feeds the PhysicalCamera for an 85 mm lens.
    expect(mmToFov(85)).toBeCloseTo((2 * Math.atan(12 / 85) * 180) / Math.PI, 4)
  })
})
