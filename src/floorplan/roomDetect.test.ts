import { describe, expect, it } from 'vitest'
import { detectRoomPolygon } from './roomDetect'
import type { PlanWall } from './types'
import { polygonArea } from './types'

const loop = (pts: [number, number][]): PlanWall[] =>
  pts.map((p, i) => ({
    id: `w${i}`,
    start: p,
    end: pts[(i + 1) % pts.length],
    thickness: 'internal' as const,
  }))

describe('detectRoomPolygon', () => {
  it('derives a square room from a 4-wall loop', () => {
    const walls = loop([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ])
    const poly = detectRoomPolygon(walls, [2, 2])
    expect(poly).not.toBeNull()
    expect(polygonArea(poly!)).toBeCloseTo(16, 5)
  })

  it('derives an L-shaped room (area = outline, not bbox)', () => {
    const walls = loop([
      [0, 0],
      [4, 0],
      [4, 2],
      [2, 2],
      [2, 4],
      [0, 4],
    ])
    const poly = detectRoomPolygon(walls, [1, 1])
    expect(poly).not.toBeNull()
    expect(polygonArea(poly!)).toBeCloseTo(12, 5) // 16 - 2x2 notch
  })

  it('returns null when the seed is outside the loop', () => {
    const walls = loop([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ])
    expect(detectRoomPolygon(walls, [9, 9])).toBeNull()
  })

  it('picks the inner room when two adjacent rooms share a wall', () => {
    // Two 4x4 rooms side by side sharing the x=4 wall (8x4 outer, split mid).
    const walls: PlanWall[] = [
      ...loop([
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
      ...loop([
        [4, 0],
        [8, 0],
        [8, 4],
        [4, 4],
      ]),
    ]
    const left = detectRoomPolygon(walls, [2, 2])
    const right = detectRoomPolygon(walls, [6, 2])
    expect(polygonArea(left!)).toBeCloseTo(16, 5)
    expect(polygonArea(right!)).toBeCloseTo(16, 5)
  })
})
