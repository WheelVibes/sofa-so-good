/**
 * CEILING-EXPOSURE unit tests (audit finding N4).
 *
 * The estimator itself is `apertureCoverage`'s, which has its own closed-form tests — so what is
 * checked here is the part N4 actually turns on: that the CALIBRATED poses sit far enough below
 * the ramp start that their exposure multiplier is the exact literal 1, and that a pitch-up pose
 * of the kind `walk-pitch-limits-phone` records crosses into the stop-down.
 */
import { Matrix4, PerspectiveCamera } from 'three'
import { describe, expect, it } from 'vitest'
import { occluderRectsForPlan } from '../../apartment/ceiling/occluderRects'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { walkVerticalFov } from '../cameras/walkCameraSettings'
import {
  CEILING_RAMP_FULL,
  CEILING_RAMP_START,
  CEILING_REEXPOSED_SCALE,
  ceilingCoverage,
  ceilingExposureScale,
  planCeilingQuads,
} from './ceilingCoverage'

/** A walk-mode camera at a plan (x, z), eye height 1.6, yaw/pitch as `__walkLook` sets them —
 *  the same builder `apertureCoverage.test.ts` uses, so the two coverages are comparable. */
function walkViewProj(
  x: number,
  z: number,
  yaw: number,
  pitch: number,
  vw: number,
  vh: number,
  fovDeg = 70,
): number[] {
  const aspect = vw / vh
  const cam = new PerspectiveCamera(walkVerticalFov(fovDeg, aspect), aspect, 0.1, 500)
  cam.position.set(x, 1.6, z)
  cam.rotation.order = 'YXZ'
  cam.rotation.set(pitch, yaw, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return new Matrix4()
    .multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    .elements.slice()
}

const quads = planCeilingQuads(buildDefaultPlan())

describe('planCeilingQuads', () => {
  it('returns exactly ONE horizontal quad — the merged slab, never one per room', () => {
    // The merge is the anti-double-count guarantee the ramp start's headroom depends on.
    expect(quads).toHaveLength(1)
    const q = quads[0]
    expect(q[1][1]).toBeCloseTo(q[0][1], 9)
    expect(q[2][1]).toBeCloseTo(q[0][1], 9)
    expect(q[3][1]).toBeCloseTo(q[0][1], 9)
  })

  it('sits at the HIGHEST roofed ceiling and spans every roofed room', () => {
    const plan = buildDefaultPlan()
    const rects = occluderRectsForPlan(plan)
    const q = quads[0]
    expect(q[0][1]).toBeCloseTo(Math.max(...rects.map((r) => r.y)), 9)
    // The plan's own ceiling height is one of those, so the slab is never below it.
    expect(q[0][1]).toBeGreaterThanOrEqual((plan.ceilingHeight ?? 2.6) - 1e-6)
    const xs = q.map((c) => c[0])
    const zs = q.map((c) => c[2])
    for (const r of rects) {
      expect(Math.min(...xs)).toBeLessThanOrEqual(r.cx - r.w / 2 + 1e-9)
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(r.cx + r.w / 2 - 1e-9)
      expect(Math.min(...zs)).toBeLessThanOrEqual(r.cz - r.d / 2 + 1e-9)
      expect(Math.max(...zs)).toBeGreaterThanOrEqual(r.cz + r.d / 2 - 1e-9)
    }
  })
})

describe('ceilingCoverage at the calibrated poses', () => {
  // `scripts/scenarios/lightmap-night-floor-verify.json`, arm A. These are the poses the
  // byte-identity claim is made about, on BOTH the phone viewport the reference frames were
  // captured at and the desktop twin.
  const POSES = [
    { name: 'living', x: 10.9, z: 5.2, yaw: 0, pitch: -0.02 },
    { name: 'kitchen', x: 6.8, z: 8.0, yaw: -1.5708, pitch: -0.05 },
  ] as const
  const VIEWPORTS = [
    { name: 'phone', w: 390, h: 844 },
    { name: 'desktop', w: 1200, h: 900 },
  ] as const

  for (const p of POSES) {
    for (const v of VIEWPORTS) {
      it(`${p.name} @ ${v.name} stays below the ramp start, so its exposure is exactly 1`, () => {
        const c = ceilingCoverage(quads, walkViewProj(p.x, p.z, p.yaw, p.pitch, v.w, v.h))
        expect(c).toBeLessThan(CEILING_RAMP_START)
        // A future fov / eye-height / plan-extent change that pushed a calibrated pose into
        // the ramp would break byte-identity silently; this is the guard.
        // Not merely below: the worst calibrated cell measures 0.388 against a 0.60 start,
        // so 0.45 here still leaves margin while failing loudly if the headroom is spent.
        expect(c).toBeLessThan(0.45)
        expect(ceilingExposureScale(c)).toBe(1)
      })
    }
  }
})

describe('ceilingCoverage pitching up', () => {
  it('rises monotonically with pitch from the living pose', () => {
    const at = (pitch: number) =>
      ceilingCoverage(quads, walkViewProj(10.9, 5.2, 0, pitch, 390, 844))
    const series = [-0.02, 0.2, 0.4, 0.6, 0.9, 1.2].map(at)
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeGreaterThanOrEqual(series[i - 1] - 1e-9)
    }
  })

  it('crosses the ramp at the upper pitch clamp, which is the N4 pose', () => {
    // `walk-pitch-limits-phone` holds the camera at the upper clamp; ~1.2 rad up is well
    // inside it and is where the finding's "top two-thirds of the frame" reading comes from.
    const c = ceilingCoverage(quads, walkViewProj(10.9, 5.2, 0, 1.2, 390, 844))
    expect(c).toBeGreaterThanOrEqual(CEILING_RAMP_FULL)
    // Fully stopped down at the clamp, which is what takes the >= 240 fraction under 5 %.
    expect(ceilingExposureScale(c)).toBe(CEILING_REEXPOSED_SCALE)
  })
})

describe('ceilingExposureScale', () => {
  it('is exactly 1 at and below the ramp start', () => {
    expect(ceilingExposureScale(0)).toBe(1)
    expect(ceilingExposureScale(CEILING_RAMP_START)).toBe(1)
    expect(ceilingExposureScale(CEILING_RAMP_START - 1e-9)).toBe(1)
  })

  it('is the re-exposed scale at and above the ramp full point', () => {
    expect(ceilingExposureScale(CEILING_RAMP_FULL)).toBe(CEILING_REEXPOSED_SCALE)
    expect(ceilingExposureScale(1)).toBe(CEILING_REEXPOSED_SCALE)
  })

  it('is monotonically non-increasing in coverage', () => {
    let prev = ceilingExposureScale(0)
    for (let c = 0; c <= 1.0001; c += 0.01) {
      const v = ceilingExposureScale(c)
      expect(v).toBeLessThanOrEqual(prev + 1e-12)
      prev = v
    }
  })

  it('treats a non-finite coverage as no change', () => {
    expect(ceilingExposureScale(Number.NaN)).toBe(1)
    expect(ceilingExposureScale(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('never leaves the [scale, 1] band', () => {
    for (let c = -0.5; c <= 1.5; c += 0.02) {
      const v = ceilingExposureScale(c)
      expect(v).toBeLessThanOrEqual(1)
      expect(v).toBeGreaterThanOrEqual(CEILING_REEXPOSED_SCALE)
    }
  })
})
