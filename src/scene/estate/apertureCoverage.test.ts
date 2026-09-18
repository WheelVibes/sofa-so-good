/**
 * WINDOW-EXPOSURE unit tests: the coverage estimator and the auto-exposure ramp.
 *
 * The estimator is checked against CLOSED-FORM coverage (a wall-facing camera sees a
 * rectangle whose NDC size is exactly computable from the fov and the distance), and
 * then against the two poses the S1 fix must not disturb — the arm-A living pose of
 * `scripts/scenarios/lightmap-night-floor-verify.json` and the `walk-into-wall-slide`
 * approach that produced the finding.
 */
import { Matrix4, PerspectiveCamera } from 'three'
import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { walkVerticalFov } from '../cameras/walkCameraSettings'
import {
  adaptiveBlowoutScale,
  apertureCoverage,
  BLOWOUT_RAMP_FULL,
  BLOWOUT_RAMP_START,
  BLOWOUT_REEXPOSED_SCALE,
  easeBlowout,
  type PaneQuad,
  planApertureQuads,
} from './apertureCoverage'

/** A walk-mode camera at a plan (x, z), eye height 1.6, yaw/pitch as `__walkLook` sets them. */
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

describe('planApertureQuads', () => {
  const quads = planApertureQuads(buildDefaultPlan())

  it('returns one quad per window opening, never a door', () => {
    const plan = buildDefaultPlan()
    const windows = plan.openings.filter((o) => o.kind === 'window')
    expect(windows.length).toBeGreaterThan(0)
    expect(quads).toHaveLength(windows.length)
  })

  it('each quad is a planar rectangle spanning sill to head', () => {
    for (const q of quads) {
      expect(q[0][1]).toBeCloseTo(q[1][1], 9)
      expect(q[2][1]).toBeCloseTo(q[3][1], 9)
      expect(q[2][1]).toBeGreaterThan(q[0][1])
      const wA = Math.hypot(q[1][0] - q[0][0], q[1][2] - q[0][2])
      const wB = Math.hypot(q[2][0] - q[3][0], q[2][2] - q[3][2])
      expect(wA).toBeCloseTo(wB, 9)
      expect(wA).toBeGreaterThan(0)
    }
  })
})

describe('apertureCoverage', () => {
  it('is zero when nothing is in front of the camera', () => {
    const quads = planApertureQuads(buildDefaultPlan())
    // Standing in the living/dining facing SOUTH — every window is behind us.
    expect(apertureCoverage(quads, walkViewProj(10.9, 5.2, Math.PI, 0, 1200, 900))).toBe(0)
  })

  it('matches the closed-form coverage of a wall-facing rectangle', () => {
    // A 2 x 1 m pane at z = 0, camera 3 m away on +z looking down -z, no pitch.
    const pane: PaneQuad = [
      [-1, 1.1, 0],
      [1, 1.1, 0],
      [1, 2.1, 0],
      [-1, 2.1, 0],
    ]
    const vw = 1200
    const vh = 900
    const vp = walkViewProj(0, 3, 0, 0, vw, vh)
    const vfov = (walkVerticalFov(70, vw / vh) * Math.PI) / 180
    const halfH = Math.tan(vfov / 2) * 3
    const halfW = halfH * (vw / vh)
    const expected = ((2 / (2 * halfW)) * 1) / (2 * halfH)
    expect(apertureCoverage([pane], vp)).toBeCloseTo(expected, 6)
  })

  it('grows monotonically as the camera walks up to the glazing', () => {
    const quads = planApertureQuads(buildDefaultPlan())
    const at = (z: number) => apertureCoverage(quads, walkViewProj(11, z, 0.07, 0, 1200, 900))
    const series = [5.2, 4.4, 3.6, 2.8, 2.2, 1.9].map(at)
    for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThan(series[i - 1])
  })

  it('is capped at 1', () => {
    const pane: PaneQuad = [
      [-50, -50, 0],
      [50, -50, 0],
      [50, 50, 0],
      [-50, 50, 0],
    ]
    expect(apertureCoverage([pane, pane, pane], walkViewProj(0, 3, 0, 0, 1200, 900))).toBe(1)
  })

  /**
   * BYTE-IDENTITY GUARD. The poses the blown ratio was calibrated at must stay below
   * {@link BLOWOUT_RAMP_START}, or `v0.35.0.0`'s calibration silently moves. Both are
   * asserted as numbers so a camera/fov change that quietly raises them fails here
   * rather than in a pixel diff three days later.
   */
  it('leaves the calibrated room-scale poses below the ramp start', () => {
    const quads = planApertureQuads(buildDefaultPlan())
    // `lightmap-night-floor-verify` arm A, living pose, phone viewport.
    const living = apertureCoverage(quads, walkViewProj(10.9, 5.2, 0, -0.02, 390, 844))
    // …and its kitchen pose.
    const kitchen = apertureCoverage(quads, walkViewProj(6.8, 8.0, -1.5708, -0.05, 390, 844))
    expect(living).toBeLessThan(BLOWOUT_RAMP_START)
    expect(kitchen).toBeLessThan(BLOWOUT_RAMP_START)
    expect(adaptiveBlowoutScale(living)).toBe(1)
    expect(adaptiveBlowoutScale(kitchen)).toBe(1)
  })
})

describe('adaptiveBlowoutScale', () => {
  it('is exactly 1 at and below the ramp start', () => {
    for (const c of [0, 0.05, 0.2, BLOWOUT_RAMP_START]) expect(adaptiveBlowoutScale(c)).toBe(1)
  })

  it('is the re-exposed scale at and above the ramp end', () => {
    for (const c of [BLOWOUT_RAMP_FULL, 0.8, 1])
      expect(adaptiveBlowoutScale(c)).toBe(BLOWOUT_REEXPOSED_SCALE)
  })

  it('is monotonically non-increasing and continuous', () => {
    let prev = adaptiveBlowoutScale(0)
    for (let c = 0; c <= 1.0001; c += 0.01) {
      const v = adaptiveBlowoutScale(c)
      expect(v).toBeLessThanOrEqual(prev + 1e-12)
      expect(prev - v).toBeLessThan(0.05)
      prev = v
    }
  })

  it('treats a non-finite coverage as no ramp', () => {
    expect(adaptiveBlowoutScale(Number.NaN)).toBe(1)
  })
})

describe('easeBlowout', () => {
  it('snaps on a first frame / a bad dt', () => {
    expect(easeBlowout(Number.NaN, 0.5, 0.016)).toBe(0.5)
    expect(easeBlowout(1, 0.5, 0)).toBe(0.5)
    expect(easeBlowout(1, 0.5, Number.NaN)).toBe(0.5)
  })

  it('reaches ~63 % of the step after one tau, whatever the frame rate', () => {
    const step = (dt: number, n: number) => {
      let v = 1
      for (let i = 0; i < n; i++) v = easeBlowout(v, 0.5, dt)
      return v
    }
    const at60 = step(0.3 / 18, 18)
    const at12 = step(0.3 / 4, 4)
    expect(at60).toBeCloseTo(1 - 0.5 * (1 - Math.exp(-1)), 2)
    expect(at12).toBeCloseTo(at60, 2)
  })

  it('converges', () => {
    let v = 1
    for (let i = 0; i < 200; i++) v = easeBlowout(v, 0.5, 0.016)
    expect(v).toBeCloseTo(0.5, 4)
  })
})
