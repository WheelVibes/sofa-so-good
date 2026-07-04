import { describe, expect, it } from 'vitest'
import { computeVerticalLock, MAX_LOCK_PITCH_RAD } from './verticalLock'

describe('computeVerticalLock', () => {
  it('is a no-op when the camera is already level (pitch 0)', () => {
    const r = computeVerticalLock({ pos: [0, 1.6, 5], target: [0, 1.6, 0], fovDeg: 50 })
    expect(r.active).toBe(true)
    expect(r.pitchRad).toBeCloseTo(0, 6)
    expect(r.offsetY).toBeCloseTo(0, 6)
    // Leveled target matches the input target exactly (already at camera height).
    expect(r.leveledTarget).toEqual([0, 1.6, 0])
  })

  it('levels the look-at target to the camera height, keeping X/Z (yaw + distance)', () => {
    // A classic dollhouse orbit: camera above + behind, looking down at the target.
    const r = computeVerticalLock({ pos: [4, 8, 4], target: [0, 1, 0], fovDeg: 50 })
    expect(r.active).toBe(true)
    expect(r.leveledTarget).toEqual([0, 8, 0])
    // Looking down → negative pitch.
    expect(r.pitchRad).toBeLessThan(0)
  })

  it('a downward pitch produces a positive offsetY (and vice versa for upward)', () => {
    const down = computeVerticalLock({ pos: [0, 8, 0], target: [0, 1, 10], fovDeg: 50 })
    expect(down.pitchRad).toBeLessThan(0)
    expect(down.offsetY).toBeGreaterThan(0)

    const up = computeVerticalLock({ pos: [0, 1, 0], target: [0, 8, 10], fovDeg: 50 })
    expect(up.pitchRad).toBeGreaterThan(0)
    expect(up.offsetY).toBeLessThan(0)
  })

  it('offsetY grows with the magnitude of the pitch', () => {
    const shallow = computeVerticalLock({ pos: [0, 2, 0], target: [0, 1, 10], fovDeg: 50 })
    const steep = computeVerticalLock({ pos: [0, 6, 0], target: [0, 1, 10], fovDeg: 50 })
    expect(Math.abs(steep.offsetY)).toBeGreaterThan(Math.abs(shallow.offsetY))
  })

  it('a narrower field of view needs a bigger shift for the same pitch', () => {
    const wide = computeVerticalLock({ pos: [0, 6, 0], target: [0, 1, 10], fovDeg: 90 })
    const narrow = computeVerticalLock({ pos: [0, 6, 0], target: [0, 1, 10], fovDeg: 20 })
    expect(Math.abs(narrow.offsetY)).toBeGreaterThan(Math.abs(wide.offsetY))
  })

  it('clamps the pitch used for the shift so a near-top-down view stays sane', () => {
    // A very steep look (close to straight down) would blow up tan(pitch) —
    // the result must stay finite and bounded by the clamp.
    const steep = computeVerticalLock({ pos: [0, 1000, 0.001], target: [0, 0, 0], fovDeg: 50 })
    expect(Number.isFinite(steep.offsetY)).toBe(true)
    // Steep look is downward (negative pitch), clamped to -MAX_LOCK_PITCH_RAD.
    const atClamp = -Math.tan(-MAX_LOCK_PITCH_RAD) / (2 * Math.tan((50 * Math.PI) / 360))
    expect(steep.offsetY).toBeCloseTo(atClamp, 6)
  })

  it('is inactive (no-op) at the true top-down gimbal edge', () => {
    const r = computeVerticalLock({ pos: [3, 10, 3], target: [3, 0, 3], fovDeg: 50 })
    expect(r.active).toBe(false)
    expect(r.offsetY).toBe(0)
    expect(r.leveledTarget).toEqual([3, 0, 3])
  })

  it('reports the unclamped pitch even when the applied shift is clamped', () => {
    const r = computeVerticalLock({ pos: [0, 1000, 0.001], target: [0, 0, 0], fovDeg: 50 })
    expect(Math.abs(r.pitchRad)).toBeGreaterThan(MAX_LOCK_PITCH_RAD)
  })

  it('degrades gracefully on non-finite fov (falls back to a sane default)', () => {
    const r = computeVerticalLock({ pos: [0, 8, 0], target: [0, 1, 10], fovDeg: Number.NaN })
    expect(Number.isFinite(r.offsetY)).toBe(true)
  })
})
