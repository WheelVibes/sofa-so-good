import { describe, expect, it } from 'vitest'
import { arrayOffsets } from './arrayPlacement'

const src = (x: number, z: number, rotation = 0) => ({
  position: [x, z] as [number, number],
  rotation,
})

describe('arrayOffsets', () => {
  it('steps along +X for an unrotated "right" array', () => {
    expect(arrayOffsets(src(0, 0), 3, 0.5, 'right')).toEqual([
      [0.5, 0],
      [1, 0],
      [1.5, 0],
    ])
  })

  it('steps along +Z for an unrotated "forward" array', () => {
    expect(arrayOffsets(src(1, 1), 2, 0.6, 'forward')).toEqual([
      [1, 1.6],
      [1, 2.2],
    ])
  })

  it('honours rotation — a 90° item arrays perpendicular to the unrotated case', () => {
    const [p1] = arrayOffsets(src(0, 0, Math.PI / 2), 1, 1, 'right')
    // local +X rotated by 90° → world -Z (within fp error).
    expect(p1[0]).toBeCloseTo(0)
    expect(p1[1]).toBeCloseTo(-1)
  })

  it('returns nothing for a zero/negative count or spacing', () => {
    expect(arrayOffsets(src(0, 0), 0, 0.5, 'right')).toEqual([])
    expect(arrayOffsets(src(0, 0), 3, 0, 'right')).toEqual([])
    expect(arrayOffsets(src(0, 0), -2, 0.5, 'right')).toEqual([])
  })

  it('floors a fractional count', () => {
    expect(arrayOffsets(src(0, 0), 2.9, 1, 'right')).toHaveLength(2)
  })
})
