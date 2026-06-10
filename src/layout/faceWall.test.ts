import { describe, expect, it } from 'vitest'
import { flushToWall, nearestWallEdge, type RoomRect, rotationFacingRoom } from './faceWall'

const rect: RoomRect = { minX: 0, minZ: 0, maxX: 4, maxZ: 3 }

describe('rotationFacingRoom', () => {
  it('faces +Z (0) when nearest the north (−Z) wall', () => {
    expect(rotationFacingRoom([2, 0.2], rect)).toBe(0)
  })
  it('faces −Z (π) when nearest the south (+Z) wall', () => {
    expect(rotationFacingRoom([2, 2.8], rect)).toBe(Math.PI)
  })
  it('faces +X (π/2) when nearest the west (−X) wall', () => {
    expect(rotationFacingRoom([0.2, 1.5], rect)).toBe(Math.PI / 2)
  })
  it('faces −X (−π/2) when nearest the east (+X) wall', () => {
    expect(rotationFacingRoom([3.8, 1.5], rect)).toBe(-Math.PI / 2)
  })
})

describe('nearestWallEdge', () => {
  it('picks the closest edge', () => {
    expect(nearestWallEdge([2, 0.2], rect)).toBe('N')
    expect(nearestWallEdge([2, 2.8], rect)).toBe('S')
    expect(nearestWallEdge([0.2, 1.5], rect)).toBe('W')
    expect(nearestWallEdge([3.8, 1.5], rect)).toBe('E')
  })
})

describe('flushToWall', () => {
  it('pulls the perpendicular coordinate flush, leaving the parallel one', () => {
    // half-extents 0.3 (x) × 0.5 (z)
    expect(flushToWall([2, 1.5], rect, 'N', 0.3, 0.5)).toEqual([2, 0.5])
    expect(flushToWall([2, 1.5], rect, 'S', 0.3, 0.5)).toEqual([2, 2.5])
    expect(flushToWall([2, 1.5], rect, 'W', 0.3, 0.5)).toEqual([0.3, 1.5])
    expect(flushToWall([2, 1.5], rect, 'E', 0.3, 0.5)).toEqual([3.7, 1.5])
  })
})
