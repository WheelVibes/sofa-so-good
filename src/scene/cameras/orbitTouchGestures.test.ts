import { describe, expect, it } from 'vitest'
import {
  angleDeltaRad,
  DOUBLE_TAP_MAX_DIST_PX,
  DOUBLE_TAP_MAX_INTERVAL_MS,
  initGestureArmState,
  initTwistGesture,
  isDoubleTap,
  onGestureChange,
  onGestureEnd,
  onGestureStart,
  stepTwistGesture,
  twoPointAngle,
  twoPointDistance,
} from './orbitTouchGestures'

const deg = (d: number) => (d * Math.PI) / 180

describe('twoPointAngle / twoPointDistance', () => {
  it('reads a horizontal pair as angle 0 and their separation as the distance', () => {
    expect(twoPointAngle(0, 0, 10, 0)).toBeCloseTo(0)
    expect(twoPointDistance(0, 0, 10, 0)).toBeCloseTo(10)
  })

  it('reads a vertical pair as a right angle', () => {
    expect(twoPointAngle(0, 0, 0, 10)).toBeCloseTo(Math.PI / 2)
  })

  it('distance is symmetric regardless of point order', () => {
    expect(twoPointDistance(3, 4, 0, 0)).toBeCloseTo(twoPointDistance(0, 0, 3, 4))
  })
})

describe('angleDeltaRad', () => {
  it('is exactly zero for equal angles', () => {
    expect(angleDeltaRad(1.234, 1.234)).toBe(0)
  })

  it('wraps the short way across the +-pi seam', () => {
    expect(angleDeltaRad(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
    expect(angleDeltaRad(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2)
  })

  it('reports an ordinary small delta without wrapping', () => {
    expect(angleDeltaRad(deg(10), deg(15))).toBeCloseTo(deg(5))
  })
})

describe('stepTwistGesture', () => {
  /** Mirrors `record.mjs`'s `twoFingerRotate` op — the sweep clip that
   *  reproduced N7: two fingers pivoting together about a FIXED centre at a
   *  FIXED radius, so the inter-finger distance never changes, only the angle
   *  sweeps from 0 to `totalDeg` over `steps` frames. */
  function sweep(totalDeg: number, steps: number, distancePx = 160) {
    let state = initTwistGesture({ angleRad: 0, distancePx })
    let total = 0
    for (let i = 1; i <= steps; i++) {
      const angleRad = deg((totalDeg * i) / steps)
      const { rotationRad, next } = stepTwistGesture(state, { angleRad, distancePx })
      state = next
      if (rotationRad != null) total += rotationRad
    }
    return total
  }

  it('a twist under the onset produces no rotation at all', () => {
    expect(sweep(2, 10)).toBe(0)
  })

  it('a 30 deg twist rotates the camera at least 20 deg (the fix brief pass bar)', () => {
    const total = Math.abs(sweep(30, 20))
    expect(total).toBeGreaterThanOrEqual(deg(20))
    // Tracks close to 1:1 — should not overshoot the finger motion either.
    expect(total).toBeLessThanOrEqual(deg(30) + 1e-6)
  })

  it('a full 110 deg sweep (the actual sweep-harness clip) rotates close to 110 deg', () => {
    expect(Math.abs(sweep(110, 26))).toBeGreaterThan(deg(100))
  })

  it('a changing pinch distance suppresses rotation and re-baselines instead of firing', () => {
    const state = initTwistGesture({ angleRad: 0, distancePx: 100 })
    // Distance jumps 40% while the angle also moves past onset — a pinch, not a twist.
    const step1 = stepTwistGesture(state, { angleRad: deg(20), distancePx: 140 })
    expect(step1.rotationRad).toBeNull()
    expect(step1.next.armed).toBe(false)
    // Once the pinch "settles" to a stable distance again, a NEW onset must be
    // crossed from here — the suppressed 20 deg is never retroactively applied.
    const step2 = stepTwistGesture(step1.next, { angleRad: deg(21), distancePx: 141 })
    expect(step2.rotationRad).toBeNull()
  })

  it('once armed, a small subsequent frame-to-frame delta still rotates (no re-onset per frame)', () => {
    const state = initTwistGesture({ angleRad: 0, distancePx: 100 })
    const armed = stepTwistGesture(state, { angleRad: deg(5), distancePx: 100 })
    expect(armed.rotationRad).not.toBeNull()
    expect(armed.next.armed).toBe(true)
    const tiny = stepTwistGesture(armed.next, { angleRad: deg(5.5), distancePx: 100 })
    expect(tiny.rotationRad).toBeCloseTo(deg(0.5))
  })

  it('a twist that reverses direction mid-gesture rotates the other way', () => {
    const state = initTwistGesture({ angleRad: 0, distancePx: 100 })
    const armed = stepTwistGesture(state, { angleRad: deg(10), distancePx: 100 })
    expect(armed.rotationRad).toBeGreaterThan(0)
    const reversed = stepTwistGesture(armed.next, { angleRad: deg(8), distancePx: 100 })
    expect(reversed.rotationRad).toBeLessThan(0)
  })
})

describe('gesture arm gate (defers beginCameraGesture past a no-op touch)', () => {
  it('a tap (start then end, no change) never arms a begin/end pair', () => {
    const started = onGestureStart(initGestureArmState())
    const ended = onGestureEnd(started)
    expect(ended.endCount).toBe(0)
    expect(ended.next).toEqual(initGestureArmState())
  })

  it('a real drag (start, change, end) produces exactly one begin and one end', () => {
    const started = onGestureStart(initGestureArmState())
    const changed = onGestureChange(started)
    expect(changed.beginCount).toBe(1)
    const ended = onGestureEnd(changed.next)
    expect(ended.endCount).toBe(1)
    expect(ended.next).toEqual(initGestureArmState())
  })

  it('a change with nothing pending never begins anything', () => {
    const s = { pending: 0, armed: 1 }
    const changed = onGestureChange(s)
    expect(changed.beginCount).toBe(0)
    expect(changed.next).toEqual(s)
  })

  it('multiple changes after one start only ever begin once', () => {
    const started = onGestureStart(initGestureArmState())
    const changed1 = onGestureChange(started)
    expect(changed1.beginCount).toBe(1)
    const changed2 = onGestureChange(changed1.next)
    expect(changed2.beginCount).toBe(0)
    expect(changed2.next.armed).toBe(1)
  })

  it('overlapping starts (a second finger arriving mid-drag) preserve the ref-count', () => {
    let s = onGestureStart(initGestureArmState()) // first finger
    s = onGestureChange(s).next // real motion arms it -> armed 1
    s = onGestureStart(s) // second finger arrives mid-drag
    const changed = onGestureChange(s)
    expect(changed.beginCount).toBe(1)
    s = changed.next
    expect(s.armed).toBe(2)
    const end1 = onGestureEnd(s)
    expect(end1.endCount).toBe(1)
    const end2 = onGestureEnd(end1.next)
    expect(end2.endCount).toBe(1)
    expect(end2.next).toEqual(initGestureArmState())
  })
})

describe('isDoubleTap', () => {
  it('is false with no previous tap', () => {
    expect(isDoubleTap(null, { x: 0, y: 0, t: 0 })).toBe(false)
  })

  it('is true for two taps close in time and space', () => {
    const prev = { x: 100, y: 100, t: 1000 }
    const next = { x: 108, y: 96, t: 1000 + DOUBLE_TAP_MAX_INTERVAL_MS - 1 }
    expect(isDoubleTap(prev, next)).toBe(true)
  })

  it('matches the sweep harness doubleTap op (same point, ~160 ms apart)', () => {
    const prev = { x: 195, y: 450, t: 0 }
    const next = { x: 195, y: 450, t: 160 }
    expect(isDoubleTap(prev, next)).toBe(true)
  })

  it('is false when the taps are too far apart in time', () => {
    const prev = { x: 100, y: 100, t: 1000 }
    const next = { x: 100, y: 100, t: 1000 + DOUBLE_TAP_MAX_INTERVAL_MS + 1 }
    expect(isDoubleTap(prev, next)).toBe(false)
  })

  it('is false when the taps land too far apart in space', () => {
    const prev = { x: 100, y: 100, t: 1000 }
    const next = { x: 100 + DOUBLE_TAP_MAX_DIST_PX + 1, y: 100, t: 1050 }
    expect(isDoubleTap(prev, next)).toBe(false)
  })
})
