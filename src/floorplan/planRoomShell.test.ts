import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from './defaultPlan'
import { planRoomRects, planRoomShell } from './planRoomShell'
import type { FloorPlan } from './types'

describe('planRoomShell', () => {
  it('returns null for an unknown room id', () => {
    expect(planRoomShell(buildDefaultPlan(), 'nope')).toBeNull()
  })

  it('builds a shell for each default-plan room (clips walls, frames camera)', () => {
    const plan = buildDefaultPlan()
    for (const room of plan.rooms) {
      const shell = planRoomShell(plan, room.id)
      expect(shell).not.toBeNull()
      if (!shell) continue
      // The room is framed (positive radius + a centre inside the room).
      expect(shell.radius).toBeGreaterThan(0)
      expect(shell.contains(shell.center[0], shell.center[1])).toBe(true)
      // Every non-external room is bounded by at least 3 walls.
      if (room.width > 0.5 && room.depth > 0.5) {
        expect(shell.walls.length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('clips a shared long wall to just the room footprint', () => {
    // Two rooms side by side sharing one long north wall spanning both.
    const plan: FloorPlan = {
      id: 'custom',
      name: 'Two rooms',
      extent: [8, 4],
      ceilingHeight: 2.6,
      walls: [
        { id: 'north', start: [0, 0], end: [8, 0], thickness: 'interior' },
        { id: 'mid', start: [4, 0], end: [4, 4], thickness: 'interior' },
        { id: 'wA', start: [0, 0], end: [0, 4], thickness: 'interior' },
        { id: 'south', start: [0, 4], end: [8, 4], thickness: 'interior' },
      ],
      openings: [
        { id: 'dA', kind: 'door', wallId: 'north', offset: 1, width: 0.9, sill: 0, head: 2.1 },
        { id: 'dB', kind: 'door', wallId: 'north', offset: 5, width: 0.9, sill: 0, head: 2.1 },
      ],
      rooms: [
        { id: 'A', name: 'A', origin: [0, 0], width: 4, depth: 4 },
        { id: 'B', name: 'B', origin: [4, 0], width: 4, depth: 4 },
      ],
    } as unknown as FloorPlan

    const a = planRoomShell(plan, 'A')
    expect(a).not.toBeNull()
    if (!a) return
    // The north wall is clipped to room A's 0..4 span, not the full 0..8.
    const north = a.walls.find((w) => w.wallId === 'north')
    expect(north).toBeDefined()
    expect(north?.start[0]).toBeCloseTo(0)
    expect(north?.end[0]).toBeCloseTo(4)
    // Only door dA (offset 1, in A's span) is attributed to room A — not dB.
    expect(a.openings.map((o) => o.id)).toEqual(['dA'])
  })

  it('uses the polygon bbox for rects but the true polygon for containment', () => {
    const plan: FloorPlan = {
      id: 'poly',
      name: 'L room',
      extent: [6, 6],
      ceilingHeight: 2.6,
      walls: [],
      openings: [],
      rooms: [
        {
          id: 'L',
          name: 'L',
          origin: [0, 0],
          width: 6,
          depth: 6,
          polygon: [
            [0, 0],
            [6, 0],
            [6, 3],
            [3, 3],
            [3, 6],
            [0, 6],
          ],
        },
      ],
    } as unknown as FloorPlan
    const shell = planRoomShell(plan, 'L')
    expect(shell).not.toBeNull()
    if (!shell) return
    expect(shell.rects[0]).toMatchObject({ x0: 0, z0: 0, x1: 6, z1: 6 })
    // A point in the cut-out corner is outside the L polygon.
    expect(shell.contains(5, 5)).toBe(false)
    expect(shell.contains(1, 1)).toBe(true)
  })
})

describe('planRoomRects', () => {
  it('adds a second rect for an L-extension', () => {
    const rects = planRoomRects({
      id: 'r',
      name: 'r',
      origin: [1, 1],
      width: 3,
      depth: 2,
      extension: { offset: [3, 0], width: 2, depth: 2 },
    } as never)
    expect(rects).toHaveLength(2)
    expect(rects[1]).toEqual({ x0: 4, z0: 1, x1: 6, z1: 3 })
  })
})
