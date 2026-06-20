import { describe, expect, it } from 'vitest'
import type { PlanVec2 } from '../../../floorplan/types'
import { snapWallAngle } from './snapWallAngle'

const close = (a: PlanVec2, b: PlanVec2, eps = 1e-9) =>
  Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps

describe('snapWallAngle', () => {
  it('snaps a near-horizontal segment to exactly horizontal', () => {
    // ~3.4° off horizontal → snaps to 0°, length preserved.
    const out = snapWallAngle([0, 0], [3, 0.18])
    expect(close(out, [Math.hypot(3, 0.18), 0])).toBe(true)
  })

  it('snaps a near-vertical segment to exactly vertical', () => {
    const out = snapWallAngle([0, 0], [0.15, 4])
    expect(close(out, [0, Math.hypot(0.15, 4)])).toBe(true)
  })

  it('snaps a near-diagonal segment to exactly 45°', () => {
    const out = snapWallAngle([0, 0], [2, 2.2])
    const len = Math.hypot(2, 2.2)
    const d = len / Math.SQRT2
    expect(close(out, [d, d])).toBe(true)
  })

  it('snaps to 30° with the default 15° increment', () => {
    // 28° off horizontal → nearest 15° multiple is 30°.
    const ang = (28 * Math.PI) / 180
    const len = 2
    const out = snapWallAngle([0, 0], [len * Math.cos(ang), len * Math.sin(ang)])
    const t = (30 * Math.PI) / 180
    expect(close(out, [len * Math.cos(t), len * Math.sin(t)])).toBe(true)
  })

  it('preserves the cursor distance (only the direction rotates)', () => {
    const out = snapWallAngle([1, 1], [4, 1.3])
    const len = Math.hypot(4 - 1, 1.3 - 1)
    expect(Math.abs(Math.hypot(out[0] - 1, out[1] - 1) - len)).toBeLessThan(1e-9)
  })

  it('works relative to a non-origin anchor', () => {
    const out = snapWallAngle([5, 5], [8, 5.2])
    expect(close(out, [5 + Math.hypot(3, 0.2), 5])).toBe(true)
  })

  it('leaves a sub-minLength segment untouched (no jitter at the anchor)', () => {
    expect(snapWallAngle([0, 0], [0.02, 0.03])).toEqual([0.02, 0.03])
  })

  it('honours a custom increment', () => {
    // 40° with a 90° increment → snaps to 0° (nearest multiple of 90).
    const ang = (40 * Math.PI) / 180
    const len = 1
    const out = snapWallAngle([0, 0], [len * Math.cos(ang), len * Math.sin(ang)], { stepDeg: 90 })
    expect(close(out, [len, 0])).toBe(true)
  })
})
