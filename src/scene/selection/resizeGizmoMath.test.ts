import { describe, expect, it } from 'vitest'
import { groupResizeFactor, resizedTransform } from './resizeGizmoMath'

describe('groupResizeFactor', () => {
  it('is the distance ratio', () => {
    expect(groupResizeFactor(2, 3)).toBeCloseTo(1.5)
    expect(groupResizeFactor(4, 2)).toBeCloseTo(0.5)
  })
  it('clamps to the sane range', () => {
    expect(groupResizeFactor(1, 100)).toBe(5)
    expect(groupResizeFactor(100, 1)).toBe(0.2)
  })
  it('is a no-op (1) for a non-positive grab distance', () => {
    expect(groupResizeFactor(0, 5)).toBe(1)
    expect(groupResizeFactor(-1, 5)).toBe(1)
  })
})

describe('resizedTransform', () => {
  it('scales position about the pivot and multiplies the scale', () => {
    const r = resizedTransform([2, 2], 1, [0, 0], 2)
    expect(r.position).toEqual([4, 4])
    expect(r.scale).toBe(2)
  })
  it('leaves the pivot point fixed', () => {
    const r = resizedTransform([0, 0], 1, [0, 0], 3)
    expect(r.position).toEqual([0, 0])
  })
  it('keeps two members rigid — their gap scales by the same factor', () => {
    const pivot: [number, number] = [0, 0]
    const a = resizedTransform([1, 0], 1, pivot, 2)
    const b = resizedTransform([3, 0], 1, pivot, 2)
    const gap0 = 3 - 1
    const gap1 = b.position[0] - a.position[0]
    expect(gap1 / gap0).toBeCloseTo(2)
    expect(a.scale).toBe(b.scale)
  })
})
