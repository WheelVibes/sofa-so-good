import { describe, expect, it } from 'vitest'
import {
  computeRotation,
  enclosingRadius,
  GIZMO_MIN_RADIUS,
  GIZMO_SNAP_STEP,
  gizmoRadius,
  NEIGHBOUR_SNAP_THRESHOLD,
  neighbourAxes,
  offsetToNeighbourAxis,
  pointerAngle,
  rotatePointAround,
  smartSnapRotation,
  snapDelta,
  toDegrees,
} from './rotateGizmoMath'

const deg = (d: number) => (d * Math.PI) / 180

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

describe('offsetToNeighbourAxis (mod-90°)', () => {
  it('is 0 when already parallel to the reference', () => {
    expect(offsetToNeighbourAxis(deg(40), deg(40))).toBeCloseTo(0, 6)
  })
  it('is 0 when perpendicular to the reference (mod 90° treats it as aligned)', () => {
    expect(offsetToNeighbourAxis(deg(130), deg(40))).toBeCloseTo(0, 6) // 130 = 40 + 90
  })
  it('returns the signed gap to the nearest 90°-multiple axis', () => {
    expect(offsetToNeighbourAxis(deg(43), deg(40))).toBeCloseTo(deg(3), 6)
    expect(offsetToNeighbourAxis(deg(37), deg(40))).toBeCloseTo(deg(-3), 6)
  })
  it('never exceeds ±45°', () => {
    for (let a = -200; a <= 200; a += 7) {
      expect(Math.abs(offsetToNeighbourAxis(deg(a), deg(13)))).toBeLessThanOrEqual(deg(45) + 1e-9)
    }
  })
})

describe('smartSnapRotation', () => {
  it('snaps to a neighbour axis when the candidate is within threshold', () => {
    // Candidate 3° off a neighbour at 0° → snaps to the neighbour axis (0°),
    // NOT to the 15° grid (which 3° would round to 0° too, so use 18° below).
    const { yaw, snappedToRef } = smartSnapRotation(deg(3), [deg(0)], true)
    expect(yaw).toBeCloseTo(0, 6)
    expect(snappedToRef).toBe(0)
  })
  it('beats the 15° grid: 18° near a 20° neighbour snaps to 20°, not 15°', () => {
    const { yaw, snappedToRef } = smartSnapRotation(deg(18), [deg(20)], true)
    expect(yaw).toBeCloseTo(deg(20), 6)
    expect(snappedToRef).toBe(0)
  })
  it('falls back to the 15° grid when no neighbour is within threshold', () => {
    // 18° is >5° from the only neighbour (45°) → grid snap → 15°.
    const { yaw, snappedToRef } = smartSnapRotation(deg(18), [deg(45)], true)
    expect(yaw).toBeCloseTo(GIZMO_SNAP_STEP, 6) // 15°
    expect(snappedToRef).toBe(-1)
  })
  it('falls back to the 15° grid when there are no neighbours', () => {
    const { yaw, snappedToRef } = smartSnapRotation(deg(10), [], true)
    expect(yaw).toBeCloseTo(GIZMO_SNAP_STEP, 6)
    expect(snappedToRef).toBe(-1)
  })
  it('snaps to the NEAREST neighbour when several are within threshold', () => {
    // Candidate 31°; neighbours at 28° (3° away) and 33° (2° away) → 33° wins.
    const { yaw, snappedToRef } = smartSnapRotation(deg(31), [deg(28), deg(33)], true)
    expect(yaw).toBeCloseTo(deg(33), 6)
    expect(snappedToRef).toBe(1)
  })
  it('treats a perpendicular neighbour as an aligned axis (mod 90°)', () => {
    // Candidate ~92°, neighbour at 0° → perpendicular axis is 90° → snaps to 90°.
    const { yaw, snappedToRef } = smartSnapRotation(deg(92), [deg(0)], true)
    expect(yaw).toBeCloseTo(deg(90), 6)
    expect(snappedToRef).toBe(0)
  })
  it('Shift (snap=false) bypasses ALL snapping — neighbour AND grid', () => {
    const { yaw, snappedToRef } = smartSnapRotation(deg(3), [deg(0)], false)
    expect(yaw).toBeCloseTo(deg(3), 6) // untouched candidate
    expect(snappedToRef).toBe(-1)
  })
  it('exactly at the threshold boundary does not neighbour-snap (strict <)', () => {
    // Offset === threshold → not strictly inside → grid fallback (no flicker zone).
    const { snappedToRef } = smartSnapRotation(NEIGHBOUR_SNAP_THRESHOLD, [0], true)
    expect(snappedToRef).toBe(-1)
  })
})

describe('neighbourAxes', () => {
  it('excludes the rotating item itself and collapses parallel/perpendicular dupes', () => {
    const axes = neighbourAxes(
      'self',
      [
        { id: 'self', rotation: deg(30) }, // excluded
        { id: 'a', rotation: deg(45) },
        { id: 'b', rotation: deg(135) }, // 135 = 45 + 90 → same mod-90° axis
      ],
      [],
    )
    expect(axes).toHaveLength(1)
    expect(axes[0]).toBeCloseTo(deg(45), 6)
  })
  it('derives a yaw from each wall direction (atan2(dx, dz)) and folds mod-90°', () => {
    // A horizontal wall along +X → direction yaw 90°; folds to 0° axis.
    const axes = neighbourAxes('self', [], [{ ax: 0, az: 0, bx: 2, bz: 0 }])
    expect(axes).toHaveLength(1)
    expect(axes[0]).toBeCloseTo(0, 6) // 90° mod 90° = 0
  })
  it('skips degenerate zero-length walls', () => {
    expect(neighbourAxes('self', [], [{ ax: 1, az: 1, bx: 1, bz: 1 }])).toHaveLength(0)
  })
})
