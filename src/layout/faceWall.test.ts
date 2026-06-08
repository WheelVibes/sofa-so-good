import { describe, expect, it } from 'vitest'
import { type RoomRect, rotationFacingRoom } from './faceWall'

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
