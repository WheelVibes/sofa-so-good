import { describe, expect, it } from 'vitest'
import { TILT_LIMIT_RAD } from '../../furniture/tiltRotation'
import {
  computeTiltDrag,
  TILT_DRAG_RANGE_PX,
  TILT_RAD_PER_PX,
  tiltGizmoAnchorHeight,
} from './tiltGizmoMath'

describe('computeTiltDrag', () => {
  it('is a no-op with zero drag', () => {
    expect(computeTiltDrag(0, 0, 0, 0)).toEqual({ pitch: 0, roll: 0 })
  })

  it('maps vertical drag to pitch and horizontal drag to roll independently', () => {
    const { pitch, roll } = computeTiltDrag(0, 0, 0, 40)
    expect(pitch).toBeCloseTo(40 * TILT_RAD_PER_PX, 10)
    expect(roll).toBe(0)

    const { pitch: p2, roll: r2 } = computeTiltDrag(0, 0, 40, 0)
    expect(p2).toBe(0)
    expect(r2).toBeCloseTo(40 * TILT_RAD_PER_PX, 10)
  })

  it('adds the delta on top of the angles captured at grab', () => {
    const startPitch = 0.1
    const startRoll = -0.2
    const { pitch, roll } = computeTiltDrag(startPitch, startRoll, 10, -10)
    expect(pitch).toBeCloseTo(startPitch + -10 * TILT_RAD_PER_PX, 10)
    expect(roll).toBeCloseTo(startRoll + 10 * TILT_RAD_PER_PX, 10)
  })

  it('reaches the full ±TILT_LIMIT range at the tuned drag distance', () => {
    const { pitch } = computeTiltDrag(0, 0, 0, TILT_DRAG_RANGE_PX)
    expect(pitch).toBeCloseTo(TILT_LIMIT_RAD, 10)
    const { pitch: negPitch } = computeTiltDrag(0, 0, 0, -TILT_DRAG_RANGE_PX)
    expect(negPitch).toBeCloseTo(-TILT_LIMIT_RAD, 10)
  })

  it('clamps beyond the ±TILT_LIMIT range instead of overshooting', () => {
    const { pitch, roll } = computeTiltDrag(0, 0, 10_000, 10_000)
    expect(pitch).toBeCloseTo(TILT_LIMIT_RAD, 10)
    expect(roll).toBeCloseTo(TILT_LIMIT_RAD, 10)
    const { pitch: negPitch, roll: negRoll } = computeTiltDrag(0, 0, -10_000, -10_000)
    expect(negPitch).toBeCloseTo(-TILT_LIMIT_RAD, 10)
    expect(negRoll).toBeCloseTo(-TILT_LIMIT_RAD, 10)
  })

  it('clamps even when the drag pushes an already-extreme start angle further out', () => {
    const { pitch } = computeTiltDrag(TILT_LIMIT_RAD, 0, 0, 1000)
    expect(pitch).toBe(TILT_LIMIT_RAD)
  })
})

describe('tiltGizmoAnchorHeight', () => {
  it('sits above the item height plus a clearance gap', () => {
    const h = tiltGizmoAnchorHeight(0.8, 0)
    expect(h).toBeGreaterThan(0.8)
  })

  it('accounts for elevation', () => {
    const base = tiltGizmoAnchorHeight(0.8, 0)
    const raised = tiltGizmoAnchorHeight(0.8, 0.5)
    expect(raised).toBeCloseTo(base + 0.5, 10)
  })

  it('never goes negative for a degenerate (negative) height/elevation', () => {
    expect(tiltGizmoAnchorHeight(-1, -1)).toBeGreaterThanOrEqual(0)
  })
})
