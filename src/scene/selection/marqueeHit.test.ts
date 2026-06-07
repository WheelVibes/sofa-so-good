import { describe, expect, it } from 'vitest'
import { marqueeHitsScreenPoints } from './marqueeHit'

// A large item whose screen footprint spans x[100,300] y[100,300], centre (200,200).
const item: [number, number][] = [
  [100, 100],
  [300, 100],
  [300, 300],
  [100, 300],
  [200, 200],
]

describe('marqueeHitsScreenPoints', () => {
  it('hits when the marquee covers the centre', () => {
    expect(marqueeHitsScreenPoints(item, 150, 250, 150, 250)).toBe(true)
  })

  it('hits when the marquee overlaps only an edge (centre outside)', () => {
    // Box over the bottom edge: y[280,400] — the centre (y=200) is NOT inside,
    // but the footprint AABB still intersects. This is the new lasso behaviour.
    expect(marqueeHitsScreenPoints(item, 120, 280, 280, 400)).toBe(true)
  })

  it('hits when the marquee is fully inside a big item', () => {
    expect(marqueeHitsScreenPoints(item, 180, 220, 180, 220)).toBe(true)
  })

  it('misses when the marquee is entirely outside the footprint', () => {
    expect(marqueeHitsScreenPoints(item, 400, 500, 400, 500)).toBe(false)
    expect(marqueeHitsScreenPoints(item, 0, 50, 0, 50)).toBe(false)
  })

  it('returns false with no projectable points', () => {
    expect(marqueeHitsScreenPoints([], 0, 100, 0, 100)).toBe(false)
  })
})
