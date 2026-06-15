import { describe, expect, it } from 'vitest'
import { pointInBuilding, traceBuildingOutline, type WallSeg } from './footprint'

// A 4×4 square building perimeter (centre-lines).
const square: WallSeg[] = [
  { start: [0, 0], end: [4, 0] },
  { start: [4, 0], end: [4, 4] },
  { start: [4, 4], end: [0, 4] },
  { start: [0, 4], end: [0, 0] },
]

describe('pointInBuilding', () => {
  it('is true inside the perimeter, false outside', () => {
    expect(pointInBuilding(2, 2, square)).toBe(true)
    expect(pointInBuilding(-1, 2, square)).toBe(false)
    expect(pointInBuilding(5, 2, square)).toBe(false)
  })

  it('handles an L-shaped (notched) outline — notch reads as outside', () => {
    const L: WallSeg[] = [
      { start: [0, 0], end: [6, 0] },
      { start: [6, 0], end: [6, 2] },
      { start: [6, 2], end: [2, 2] },
      { start: [2, 2], end: [2, 6] },
      { start: [2, 6], end: [0, 6] },
      { start: [0, 6], end: [0, 0] },
    ]
    expect(pointInBuilding(1, 5, L)).toBe(true)
    expect(pointInBuilding(5, 5, L)).toBe(false)
  })
})

describe('traceBuildingOutline', () => {
  it('traces a square loop in order (4 points)', () => {
    const out = traceBuildingOutline(square)
    expect(out).not.toBeNull()
    expect(out).toHaveLength(4)
    // Closed loop covering all four corners (order may start anywhere on the loop).
    const keys = new Set(out?.map((p) => `${p[0]},${p[1]}`))
    expect(keys).toEqual(new Set(['0,0', '4,0', '4,4', '0,4']))
  })

  it('traces an L-shape (6 points), regardless of wall input order', () => {
    const L: WallSeg[] = [
      { start: [2, 2], end: [2, 6] },
      { start: [0, 6], end: [0, 0] },
      { start: [6, 0], end: [6, 2] },
      { start: [0, 0], end: [6, 0] },
      { start: [2, 6], end: [0, 6] },
      { start: [6, 2], end: [2, 2] },
    ]
    const out = traceBuildingOutline(L)
    expect(out).toHaveLength(6)
  })

  it('returns null when the walls do not form a closed loop', () => {
    const open: WallSeg[] = [
      { start: [0, 0], end: [4, 0] },
      { start: [4, 0], end: [4, 4] },
      { start: [4, 4], end: [0, 4] }, // missing the closing segment
    ]
    expect(traceBuildingOutline(open)).toBeNull()
  })

  it('returns null with fewer than 3 segments', () => {
    expect(traceBuildingOutline(square.slice(0, 2))).toBeNull()
  })
})
