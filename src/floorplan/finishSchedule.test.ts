import { describe, expect, it } from 'vitest'
import { buildFinishSchedule, NEUTRAL_WALL } from './finishSchedule'
import type { RoomFinishMaps } from './roomFinishes'
import type { FloorPlan, PlanRoom, PlanUpperLevel } from './types'

const room = (id: string, name: string, over: Partial<PlanRoom> = {}): PlanRoom => ({
  id,
  name,
  origin: [0, 0],
  width: 3,
  depth: 3,
  ...over,
})

const plan = (rooms: PlanRoom[], upperLevels?: PlanUpperLevel[]): FloorPlan =>
  ({
    id: 'p',
    name: 'P',
    ceilingHeight: 2.6,
    extent: [9, 9],
    walls: [],
    openings: [],
    rooms,
    ...(upperLevels ? { upperLevels } : {}),
  }) as FloorPlan

const nameOf = (id: string) =>
  ({ 'floor-wood-oak': 'Oak', 'wall-paint-white': 'White paint' })[id] ?? id

describe('buildFinishSchedule', () => {
  it('reads the live finishes slice over plan/app defaults', () => {
    const rows = buildFinishSchedule(
      plan([room('living', 'Living')]),
      {
        floor: { living: 'floor-wood-oak' },
        walls: { living: 'wall-paint-white' },
      } as RoomFinishMaps,
      nameOf,
    )
    expect(rows).toEqual([{ room: 'Living', floor: 'Oak', wall: 'White paint' }])
  })

  it('falls back to the room finish, then the app default floor + neutral wall', () => {
    const rows = buildFinishSchedule(
      plan([room('bed', 'Bedroom', { floor: 'floor-wood-oak' }), room('bare', 'Bare')]),
      { floor: {}, walls: {} } as RoomFinishMaps,
      nameOf,
    )
    // Bedroom uses its plan-room floor; Bare uses the app default floor id.
    expect(rows[0]).toEqual({ room: 'Bedroom', floor: 'Oak', wall: NEUTRAL_WALL })
    expect(rows[1].room).toBe('Bare')
    expect(rows[1].wall).toBe(NEUTRAL_WALL)
  })

  it('lists rooms across storeys (ground first)', () => {
    const upper: PlanUpperLevel = {
      id: 'lvl-2',
      name: 'Upper',
      elevation: 3,
      walls: [],
      openings: [],
      rooms: [room('loft', 'Loft')],
    }
    const rows = buildFinishSchedule(
      plan([room('g', 'Ground room')], [upper]),
      { floor: {}, walls: {} } as RoomFinishMaps,
      nameOf,
    )
    expect(rows.map((r) => r.room)).toEqual(['Ground room', 'Loft'])
  })

  it('is empty for a plan with no rooms', () => {
    expect(
      buildFinishSchedule(plan([]), { floor: {}, walls: {} } as RoomFinishMaps, nameOf),
    ).toEqual([])
  })
})
