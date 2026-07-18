import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { clean, cleanVec, rotationMatrix, trsMatrix } from './transformMath'

describe('clean', () => {
  it('rounds away float dust to 6dp', () => {
    expect(clean(0.1 + 0.2)).toBe(0.3)
    expect(clean(1.0000000001)).toBe(1)
  })

  it('normalises -0 to 0', () => {
    expect(Object.is(clean(-0), 0)).toBe(true)
    expect(Object.is(clean(-1e-9), 0)).toBe(true) // rounds to -0 at 6dp, then normalised
  })

  it('preserves a genuine small-but-real value', () => {
    expect(clean(0.000123)).toBeCloseTo(0.000123, 6)
  })

  it('preserves large values unrounded beyond 6dp precision', () => {
    expect(clean(123.456789123)).toBe(123.456789)
  })
})

describe('cleanVec', () => {
  it('cleans each component into a plain tuple', () => {
    const v = new Vector3(0.1 + 0.2, -0, 2.0000000001)
    expect(cleanVec(v)).toEqual([0.3, 0, 2])
  })
})

describe('rotationMatrix', () => {
  it('defaults to identity when no rotation is given', () => {
    const m = rotationMatrix()
    const v = new Vector3(1, 2, 3).applyMatrix4(m)
    expect([v.x, v.y, v.z].map(clean)).toEqual([1, 2, 3])
  })

  it('a 90° yaw (Y) maps +X to -Z (Euler XYZ convention)', () => {
    const m = rotationMatrix([0, 90, 0])
    const v = new Vector3(1, 0, 0).applyMatrix4(m)
    expect(cleanVec(v)).toEqual([0, 0, -1])
  })

  it('a 90° roll (X) maps +Y to +Z', () => {
    const m = rotationMatrix([90, 0, 0])
    const v = new Vector3(0, 1, 0).applyMatrix4(m)
    expect(cleanVec(v)).toEqual([0, 0, 1])
  })

  it('180° about Y flips X and Z, keeps Y', () => {
    const m = rotationMatrix([0, 180, 0])
    const v = new Vector3(1, 2, 3).applyMatrix4(m)
    expect(cleanVec(v)).toEqual([-1, 2, -3])
  })
})

describe('trsMatrix', () => {
  it('translates a point with no rotation', () => {
    const m = trsMatrix([1, 2, 3])
    const v = new Vector3(0, 0, 0).applyMatrix4(m)
    expect(cleanVec(v)).toEqual([1, 2, 3])
  })

  it('composes rotation THEN translation (rotate the local point, then shift by position)', () => {
    const m = trsMatrix([5, 0, 0], [0, 90, 0])
    const v = new Vector3(1, 0, 0).applyMatrix4(m)
    // Local (1,0,0) rotates to (0,0,-1), then translates by (5,0,0).
    expect(cleanVec(v)).toEqual([5, 0, -1])
  })

  it('keeps unit scale — a unit-length local vector stays unit length after rotation', () => {
    const m = trsMatrix([0, 0, 0], [15, 37, 62])
    const v = new Vector3(1, 0, 0).applyMatrix4(m)
    expect(v.length()).toBeCloseTo(1, 6)
  })

  it('is the identity transform with no position/rotation args', () => {
    const m = trsMatrix([0, 0, 0])
    const v = new Vector3(4, -5, 6).applyMatrix4(m)
    expect(cleanVec(v)).toEqual([4, -5, 6])
  })
})
