import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeJoystick, resetWalkMove, setWalkMove, walkInput } from './walkInput'

describe('normalizeJoystick', () => {
  it('returns zero inside the dead-zone', () => {
    expect(normalizeJoystick(2, -1, 60, 0.15)).toEqual({ x: 0, y: 0 })
  })
  it('maps offset to a unit-capped vector past the dead-zone', () => {
    // offset straight right at the radius edge → x≈1, y≈0
    const v = normalizeJoystick(60, 0, 60, 0.15)
    expect(v.x).toBeCloseTo(1, 5)
    expect(v.y).toBeCloseTo(0, 5)
  })
  it('clamps magnitude to 1 beyond the radius', () => {
    const v = normalizeJoystick(120, 0, 60, 0.15)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5)
  })
})

describe('walkInput singleton', () => {
  beforeEach(() => resetWalkMove())
  it('starts at zero', () => {
    expect(walkInput.move).toEqual({ x: 0, y: 0 })
  })
  it('setWalkMove updates and resetWalkMove zeroes', () => {
    setWalkMove(0.5, -0.5)
    expect(walkInput.move).toEqual({ x: 0.5, y: -0.5 })
    resetWalkMove()
    expect(walkInput.move).toEqual({ x: 0, y: 0 })
  })
})
