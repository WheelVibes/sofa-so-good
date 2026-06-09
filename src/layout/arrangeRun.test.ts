import { describe, expect, it } from 'vitest'
import { arrangeRun, type RunItem } from './arrangeRun'
import type { RoomRect } from './faceWall'

const rect: RoomRect = { minX: 0, minZ: 0, maxX: 4, maxZ: 3 }

describe('arrangeRun', () => {
  it('butts pieces edge-to-edge flush against the north wall, ordered by X', () => {
    const items: RunItem[] = [
      { id: 'b', w: 1, d: 0.6, pos: [2.5, 1] }, // out of order on purpose
      { id: 'a', w: 1, d: 0.6, pos: [1.5, 1] },
    ]
    const out = arrangeRun(items, 'N', rect)
    // ordered a, b; total width 2; mid of along (1.5,2.5) = 2 → start at 1
    const a = out.find((p) => p.id === 'a')!
    const b = out.find((p) => p.id === 'b')!
    expect(a.rotation).toBe(0)
    expect(a.position[0]).toBeCloseTo(1.5) // 1 + 0.5
    expect(b.position[0]).toBeCloseTo(2.5) // 1 + 1 + 0.5
    // flush to north wall: z = minZ + d/2
    expect(a.position[1]).toBeCloseTo(0.3)
    expect(b.position[1]).toBeCloseTo(0.3)
    // edges touch: a's right edge (2.0) == b's left edge (2.0)
    expect(a.position[0] + 0.5).toBeCloseTo(b.position[0] - 0.5)
  })

  it('runs along Z flush to the west wall (rotated π/2)', () => {
    const items: RunItem[] = [
      { id: 'a', w: 1, d: 0.6, pos: [1, 1] },
      { id: 'b', w: 1, d: 0.6, pos: [1, 2] },
    ]
    const out = arrangeRun(items, 'W', rect)
    const a = out.find((p) => p.id === 'a')!
    expect(a.rotation).toBeCloseTo(Math.PI / 2)
    // flush to west wall: x = minX + d/2 = 0.3; run centred on Z mid (1.5)
    expect(a.position[0]).toBeCloseTo(0.3)
    expect(a.position[1]).toBeCloseTo(1.0) // start 1.0 + w/2
  })

  it('flushes to the far walls (S/E) using max edge', () => {
    const one: RunItem[] = [{ id: 'a', w: 0.8, d: 0.5, pos: [2, 1.5] }]
    expect(arrangeRun(one, 'S', rect)[0].position[1]).toBeCloseTo(3 - 0.25)
    expect(arrangeRun(one, 'E', rect)[0].position[0]).toBeCloseTo(4 - 0.25)
  })

  it('returns empty for no items', () => {
    expect(arrangeRun([], 'N', rect)).toEqual([])
  })
})
