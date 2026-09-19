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
  BLOWOUT_TAU_S,
  clampExposureStep,
  EXPOSURE_COUNTS_PER_EFOLD,
  easeBlowout,
  MAX_EXPOSURE_STEP_COUNTS,
  type PaneQuad,
  planApertureQuads,
  planOpenWallQuads,
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

describe('planOpenWallQuads (kitchen-wing blowout residual)', () => {
  const quads = planOpenWallQuads(buildDefaultPlan())

  it('returns exactly the four open-air parapet walls around the service yard / AC ledge', () => {
    expect(quads).toHaveLength(4)
  })

  it('each quad spans from the wall’s topHeight up to the plan ceiling height', () => {
    const plan = buildDefaultPlan()
    for (const q of quads) {
      expect(q[0][1]).toBeCloseTo(1, 9) // wall-ext-SY-W / acLedge-* all ship topHeight 1
      expect(q[2][1]).toBeCloseTo(plan.ceilingHeight, 9)
    }
  })

  it('matches exactly the plan’s external, non-sloped, topHeight-capped walls — nothing more', () => {
    const plan = buildDefaultPlan()
    const openWallCount = plan.walls.filter(
      (w) => w.thickness === 'external' && w.topHeight != null && w.topHeightEnd == null,
    ).length
    expect(quads).toHaveLength(openWallCount)
  })

  it('the combined quad set leaves the calibrated living/kitchen poses exactly as before', () => {
    // BYTE-IDENTITY GUARD, extended: the open-yard parapet must not be visible from either
    // calibrated pose, or v0.35.0.0's blown-ratio calibration would silently move.
    const plan = buildDefaultPlan()
    const combined = [...planApertureQuads(plan), ...quads]
    const living = apertureCoverage(combined, walkViewProj(10.9, 5.2, 0, -0.02, 390, 844))
    const kitchen = apertureCoverage(combined, walkViewProj(6.8, 8.0, -1.5708, -0.05, 390, 844))
    expect(living).toBeCloseTo(0.1175, 3)
    expect(kitchen).toBe(0)
    expect(living).toBeLessThan(BLOWOUT_RAMP_START)
    expect(kitchen).toBeLessThan(BLOWOUT_RAMP_START)
  })

  it('standing in the service yard facing its open wall now measures real coverage (was 0)', () => {
    const plan = buildDefaultPlan()
    const windowsOnly = apertureCoverage(
      planApertureQuads(plan),
      walkViewProj(5.4, 8.0, Math.PI / 2, 0, 390, 844),
    )
    const withOpenWalls = apertureCoverage(
      [...planApertureQuads(plan), ...quads],
      walkViewProj(5.4, 8.0, Math.PI / 2, 0, 390, 844),
    )
    expect(windowsOnly).toBeLessThan(BLOWOUT_RAMP_START)
    expect(withOpenWalls).toBeGreaterThan(BLOWOUT_RAMP_START)
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
    const at60 = step(BLOWOUT_TAU_S / 18, 18)
    const at12 = step(BLOWOUT_TAU_S / 4, 4)
    expect(at60).toBeCloseTo(1 - 0.5 * (1 - Math.exp(-1)), 2)
    expect(at12).toBeCloseTo(at60, 2)
  })

  it('converges', () => {
    let v = 1
    for (let i = 0; i < 200; i++) v = easeBlowout(v, 0.5, 0.016)
    expect(v).toBeCloseTo(0.5, 4)
  })
})

describe('clampExposureStep (audit finding N5)', () => {
  it('is inert at a 60 Hz cadence — the desktop arm is byte-identical', () => {
    // The largest step of the whole ramp at 60 Hz: 5.5 % of the 1 -> 0.5 gap.
    const prev = 1
    const eased = easeBlowout(prev, BLOWOUT_REEXPOSED_SCALE, 1 / 60)
    expect(clampExposureStep(prev, eased)).toBe(eased)
    // And that step is well inside the budget in the units the budget is stated in.
    expect(Math.abs(Math.log(eased / prev)) * EXPOSURE_COUNTS_PER_EFOLD).toBeLessThan(
      MAX_EXPOSURE_STEP_COUNTS,
    )
  })

  it('bites at a phone cadence — the N5 defect', () => {
    // The unclamped step in DISPLAY COUNTS, at the cadences the two arms actually ran at.
    const counts = (dt: number) =>
      Math.abs(Math.log(easeBlowout(1, BLOWOUT_REEXPOSED_SCALE, dt))) * EXPOSURE_COUNTS_PER_EFOLD
    expect(counts(1 / 60)).toBeLessThan(MAX_EXPOSURE_STEP_COUNTS)
    expect(counts(0.2)).toBeGreaterThan(5) // 5 Hz — already 3.5x the budget
    expect(counts(0.5)).toBeGreaterThan(9) // ~2 Hz — the finding's ±9-11 counts
    // And the clamp pulls the phone step back inside it.
    const eased = easeBlowout(1, BLOWOUT_REEXPOSED_SCALE, 0.5)
    const next = clampExposureStep(1, eased)
    expect(next).toBeGreaterThan(eased)
    expect(next).toBeLessThan(1)
  })

  it('holds the per-frame budget at ANY cadence, in both directions', () => {
    for (const dt of [1 / 120, 1 / 60, 1 / 30, 1 / 12, 0.2, 0.5, 2]) {
      for (const [from, to] of [
        [1, BLOWOUT_REEXPOSED_SCALE],
        [BLOWOUT_REEXPOSED_SCALE, 1],
      ]) {
        let cur = from
        for (let i = 0; i < 400; i++) {
          const next = clampExposureStep(cur, easeBlowout(cur, to, dt))
          expect(Math.abs(Math.log(next / cur)) * EXPOSURE_COUNTS_PER_EFOLD).toBeLessThanOrEqual(
            MAX_EXPOSURE_STEP_COUNTS + 1e-9,
          )
          cur = next
        }
        // It still ARRIVES — a limiter that never converges would freeze the ramp.
        expect(Math.abs(cur - to)).toBeLessThan(1e-3)
      }
    }
  })

  it('survives a coverage TELEPORT — the step is capped whatever the target does', () => {
    // No ease at all: a jump straight to the far end of the ramp, as a pane crossing the
    // near plane or an orientation change can produce.
    expect(
      Math.abs(Math.log(clampExposureStep(1, BLOWOUT_REEXPOSED_SCALE) / 1)),
    ).toBeLessThanOrEqual(MAX_EXPOSURE_STEP_COUNTS / EXPOSURE_COUNTS_PER_EFOLD + 1e-12)
  })

  it('never overshoots the target', () => {
    expect(clampExposureStep(1, 0.999)).toBe(0.999)
    expect(clampExposureStep(0.5, 0.5001)).toBe(0.5001)
    expect(clampExposureStep(0.5, 0.5)).toBe(0.5)
  })

  it('passes non-finite or non-positive inputs straight through', () => {
    expect(clampExposureStep(Number.NaN, 0.5)).toBe(0.5)
    expect(clampExposureStep(1, Number.NaN)).toBeNaN()
    expect(clampExposureStep(0, 0.5)).toBe(0.5)
    expect(clampExposureStep(1, 0.5, 0)).toBe(0.5)
    expect(clampExposureStep(1, 0.5, MAX_EXPOSURE_STEP_COUNTS, 0)).toBe(0.5)
  })
})
