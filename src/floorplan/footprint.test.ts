import { describe, expect, it } from 'vitest'
import { type Bounds, pointInBuilding, unroomedCells, type WallSeg } from './footprint'

// A 4×4 square building perimeter (centre-lines), CW from origin.
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
    expect(pointInBuilding(2, 5, square)).toBe(false)
  })

  it('handles an L-shaped (notched) outline', () => {
    // L: full bottom 6 wide, left arm 2 wide up to 6 → notch top-right is OUTSIDE.
    const L: WallSeg[] = [
      { start: [0, 0], end: [6, 0] },
      { start: [6, 0], end: [6, 2] },
      { start: [6, 2], end: [2, 2] },
      { start: [2, 2], end: [2, 6] },
      { start: [2, 6], end: [0, 6] },
      { start: [0, 6], end: [0, 0] },
    ]
    expect(pointInBuilding(1, 5, L)).toBe(true) // in the left arm
    expect(pointInBuilding(5, 1, L)).toBe(true) // in the bottom arm
    expect(pointInBuilding(5, 5, L)).toBe(false) // the notch — outside
  })
})

describe('unroomedCells', () => {
  const bounds: Bounds = { minX: 0, minZ: 0, maxX: 4, maxZ: 4 }

  it('returns nothing when a room covers the whole building', () => {
    const all = () => true
    expect(unroomedCells(square, all, bounds, 0.5)).toHaveLength(0)
  })

  it('flags only the enclosed, un-roomed cells', () => {
    // One room covers the left half (x < 2); the right half is un-roomed.
    const leftHalf = (x: number) => x < 2
    const cells = unroomedCells(square, leftHalf, bounds, 0.5)
    expect(cells.length).toBeGreaterThan(0)
    // Every flagged cell is inside the building AND in the un-roomed right half.
    for (const [x, z] of cells) {
      expect(pointInBuilding(x, z, square)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(2)
      expect(z).toBeGreaterThan(0)
      expect(z).toBeLessThan(4)
    }
  })

  it('never flags cells outside the building', () => {
    const none = () => false
    const cells = unroomedCells(square, none, { minX: -3, minZ: -3, maxX: 7, maxZ: 7 }, 0.5)
    for (const [x, z] of cells) expect(pointInBuilding(x, z, square)).toBe(true)
    expect(cells.length).toBeGreaterThan(0)
  })

  it('returns nothing without an enclosing loop (< 3 segments)', () => {
    expect(unroomedCells(square.slice(0, 2), () => false, bounds)).toHaveLength(0)
  })
})
