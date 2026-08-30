import { describe, expect, it } from 'vitest'
import { daylitRoomIds, fixtureSurvivesDaylight, type PlanLike, roomIdAt } from './daylitRooms'

/** Two rooms side by side; only the left one has a window in its outer wall. */
const PLAN: PlanLike = {
  rooms: [
    { id: 'living', origin: [0, 0], width: 4, depth: 3 },
    { id: 'bath', origin: [4, 0], width: 2, depth: 3 },
  ],
  walls: [
    { id: 'w-north', start: [0, 0], end: [6, 0] }, // outer wall along both rooms
  ],
  openings: [{ kind: 'window', wallId: 'w-north', offset: 1, width: 1 }],
}

describe('daylitRoomIds', () => {
  it('finds the room a window is in, and only that room', () => {
    const d = daylitRoomIds(PLAN)
    expect(d.has('living')).toBe(true)
    expect(d.has('bath')).toBe(false)
  })

  it('ignores doors — a door is not daylight', () => {
    const doors: PlanLike = { ...PLAN, openings: [{ ...PLAN.openings![0], kind: 'door' }] }
    expect(daylitRoomIds(doors).size).toBe(0)
  })

  it('survives a missing wall, an empty plan and a degenerate wall', () => {
    expect(daylitRoomIds(null).size).toBe(0)
    expect(daylitRoomIds({}).size).toBe(0)
    expect(daylitRoomIds({ ...PLAN, walls: [] }).size).toBe(0)
    const degenerate: PlanLike = { ...PLAN, walls: [{ id: 'w-north', start: [1, 1], end: [1, 1] }] }
    expect(daylitRoomIds(degenerate).size).toBe(0)
  })
})

describe('roomIdAt', () => {
  it('locates a point, and returns null outside every room', () => {
    expect(roomIdAt(PLAN, 2, 1.5)).toBe('living')
    expect(roomIdAt(PLAN, 5, 1.5)).toBe('bath')
    expect(roomIdAt(PLAN, 20, 20)).toBeNull()
  })
})

describe('fixtureSurvivesDaylight — a windowless room keeps its lights', () => {
  const daylit = daylitRoomIds(PLAN)

  it('keeps a fixture in the windowless room', () => {
    expect(fixtureSurvivesDaylight(PLAN, daylit, 5, 1.5)).toBe(true)
  })

  it('drops a fixture in the daylit room — the whole point of the rule', () => {
    expect(fixtureSurvivesDaylight(PLAN, daylit, 2, 1.5)).toBe(false)
  })

  it('treats a fixture outside every room (a ledge, a balcony) as daylit', () => {
    expect(fixtureSurvivesDaylight(PLAN, daylit, 20, 20)).toBe(false)
  })
})
