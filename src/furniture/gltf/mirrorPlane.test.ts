import { describe, expect, it } from 'vitest'
import { pickMirrorPlane } from './mirrorPlane'

describe('pickMirrorPlane', () => {
  it('picks the largest near-flat slab and reports its thin axis', () => {
    const plane = pickMirrorPlane([
      { center: [0, 1, 0], size: [0.04, 1.2, 0.8] }, // thin in X — a mirror pane
      { center: [0, 0.5, 0], size: [0.1, 1.0, 0.1] }, // a post (not flat)
    ])
    expect(plane).not.toBeNull()
    expect(plane?.axis).toBe('x')
    expect(plane?.center).toEqual([0, 1, 0])
  })

  it('prefers the larger flat face when several are flat', () => {
    const plane = pickMirrorPlane([
      { center: [0, 0, 0], size: [0.5, 0.5, 0.02] }, // small flat (area 0.25)
      { center: [1, 1, 0], size: [1.5, 1.0, 0.02] }, // big flat (area 1.5)
    ])
    expect(plane?.center).toEqual([1, 1, 0])
    expect(plane?.axis).toBe('z')
  })

  it('returns null when nothing is convincingly flat', () => {
    expect(pickMirrorPlane([{ center: [0, 0, 0], size: [1, 1, 1] }])).toBeNull()
    expect(pickMirrorPlane([])).toBeNull()
  })
})
