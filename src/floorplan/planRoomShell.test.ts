import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from './defaultPlan'
import {
  type PlanClippedWall,
  type PlanRoomOpening,
  planOpeningCutout,
  planRoomRects,
  planRoomShell,
} from './planRoomShell'
import type { FloorPlan, PlanOpening } from './types'

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
        { id: 'north', start: [0, 0], end: [8, 0], thickness: 'internal' },
        { id: 'mid', start: [4, 0], end: [4, 4], thickness: 'internal' },
        { id: 'wA', start: [0, 0], end: [0, 4], thickness: 'internal' },
        { id: 'south', start: [0, 4], end: [8, 4], thickness: 'internal' },
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
    expect(a.openings.map((o) => o.opening.id)).toEqual(['dA'])
    // Its world centre is resolved (offset 1 + width/2 = 1.45 along the north wall).
    expect(a.openings[0].center[0]).toBeCloseTo(1.45)
    expect(a.openings[0].center[1]).toBeCloseTo(0)
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

describe('planOpeningCutout', () => {
  const opening = (over: Partial<PlanOpening>): PlanOpening =>
    ({
      id: 'o',
      kind: 'door',
      wallId: 'w',
      offset: 0,
      width: 1,
      sill: 0,
      head: 2.1,
      ...over,
    }) as PlanOpening

  it('projects a placed opening onto its clip axis, centred', () => {
    // Clip [3,8] on the X axis → centre world x=5.5. Opening centred at world x=5.
    const clip: PlanClippedWall = { wallId: 'w', start: [3, 0], end: [8, 0], thickness: 'internal' }
    const entry: PlanRoomOpening = {
      opening: opening({ width: 1.2, sill: 0, head: 2.05 }),
      center: [5, 0],
      angle: 0,
    }
    const cut = planOpeningCutout(entry, clip)
    // clip-local centre = 5 - 5.5 = -0.5; half-width 0.6
    expect(cut.a).toBeCloseTo(-1.1, 6)
    expect(cut.b).toBeCloseTo(0.1, 6)
    expect(cut).toMatchObject({ bottom: 0, top: 2.05 })
  })

  it('carries the window sill/head through so it becomes a floating hole', () => {
    const clip: PlanClippedWall = { wallId: 'w', start: [0, 0], end: [4, 0], thickness: 'external' }
    const entry: PlanRoomOpening = {
      opening: opening({ kind: 'window', width: 1, sill: 0.9, head: 2.1 }),
      center: [2, 0],
      angle: 0,
    }
    const cut = planOpeningCutout(entry, clip)
    expect(cut.bottom).toBe(0.9)
    expect(cut.top).toBe(2.1)
  })
})
