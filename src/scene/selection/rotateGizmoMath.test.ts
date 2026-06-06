import { describe, expect, it } from 'vitest'
import {
  computeRotation,
  enclosingRadius,
  GIZMO_MIN_RADIUS,
  GIZMO_SNAP_STEP,
  gizmoRadius,
  pointerAngle,
  rotatePointAround,
  snapDelta,
  toDegrees,
} from './rotateGizmoMath'

describe('gizmoRadius', () => {
  it('clears the footprint by the handle gap', () => {
    expect(gizmoRadius(1, 0.5)).toBeCloseTo(1.38, 5) // max(1,0.5)+0.38
    expect(gizmoRadius(0.4, 0.9)).toBeCloseTo(1.28, 5)
  })
  it('never drops below the floor minimum for tiny items', () => {
    expect(gizmoRadius(0.01, 0.01)).toBe(GIZMO_MIN_RADIUS)
  })
})

describe('pointerAngle', () => {
  it('reads 0 along +Z (the facing axis) and +90° along +X', () => {
    expect(pointerAngle(0, 0, 0, 1)).toBeCloseTo(0, 5)
    expect(pointerAngle(0, 0, 1, 0)).toBeCloseTo(Math.PI / 2, 5)
    expect(pointerAngle(0, 0, 0, -1)).toBeCloseTo(Math.PI, 5)
  })
  it('is centre-relative', () => {
    expect(pointerAngle(5, 5, 6, 5)).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('computeRotation', () => {
  it('is relative: grabbing anywhere does not jump the item', () => {
    // Grab at angle 1.0 with the item already at 0.5; pointer hasn't moved.
    expect(computeRotation(0.5, 1.0, 1.0, false)).toBeCloseTo(0.5, 5)
  })
  it('adds the pointer delta to the start rotation (free mode)', () => {
    expect(computeRotation(0, 0, Math.PI / 3, false)).toBeCloseTo(Math.PI / 3, 5)
    expect(computeRotation(1, 0.2, 0.7, false)).toBeCloseTo(1.5, 5)
  })
  it('snaps to 15° steps when snapping is on', () => {
    const tenDeg = (Math.PI / 180) * 10
    expect(computeRotation(0, 0, tenDeg, true)).toBeCloseTo(GIZMO_SNAP_STEP, 5) // → 15°
    const twentyDeg = (Math.PI / 180) * 20
    expect(computeRotation(0, 0, twentyDeg, true)).toBeCloseTo(GIZMO_SNAP_STEP, 5) // → 15° (nearest)
  })
})

describe('snapDelta', () => {
  it('rounds to 15° steps when on, passes through when off', () => {
    const tenDeg = (Math.PI / 180) * 10
    expect(snapDelta(tenDeg, true)).toBeCloseTo(GIZMO_SNAP_STEP, 5)
    expect(snapDelta(tenDeg, false)).toBeCloseTo(tenDeg, 5)
    expect(snapDelta(-tenDeg, true)).toBeCloseTo(-GIZMO_SNAP_STEP, 5)
  })
})

describe('rotatePointAround', () => {
  it('leaves the pivot fixed', () => {
    const [x, z] = rotatePointAround(2, 3, 2, 3, Math.PI / 2)
    expect(x).toBeCloseTo(2, 5)
    expect(z).toBeCloseTo(3, 5)
  })
  it('orbits a point 90° CCW about the origin', () => {
    const [x, z] = rotatePointAround(1, 0, 0, 0, Math.PI / 2)
    expect(x).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(1, 5)
  })
  it('preserves distance from the pivot', () => {
    const [x, z] = rotatePointAround(5, 2, 1, 1, 0.73)
    expect(Math.hypot(x - 1, z - 1)).toBeCloseTo(Math.hypot(5 - 1, 2 - 1), 5)
  })
})

describe('enclosingRadius', () => {
  it('encloses the farthest target plus its footprint + gap', () => {
    const r = enclosingRadius(0, 0, [
      { cx: 1, cz: 0, halfDiag: 0.5 },
      { cx: 2, cz: 0, halfDiag: 0.5 }, // farthest: 2 + 0.5 + 0.38
    ])
    expect(r).toBeCloseTo(2.88, 5)
  })
  it('never drops below the floor minimum', () => {
    expect(enclosingRadius(0, 0, [{ cx: 0, cz: 0, halfDiag: 0.01 }])).toBe(GIZMO_MIN_RADIUS)
  })
})

describe('toDegrees', () => {
  it('wraps into [0, 360)', () => {
    expect(toDegrees(0)).toBe(0)
    expect(toDegrees(Math.PI)).toBe(180)
    expect(toDegrees(2 * Math.PI)).toBe(0)
    expect(toDegrees(-Math.PI / 2)).toBe(270)
    expect(toDegrees(3 * Math.PI)).toBe(180)
  })
})
