import { describe, expect, it } from 'vitest'
import type { RoomFinishMaps } from '../floorplan/roomFinishes'
import type { FloorPlan, PlanRoom, PlanUpperLevel } from '../floorplan/types'
import { buildRoomSchedule, buildRoomScheduleCsv, ROOM_CSV_NEUTRAL_WALL } from './roomScheduleCsv'

const room = (id: string, name: string, over: Partial<PlanRoom> = {}): PlanRoom => ({
  id,
  name,
  origin: [0, 0],
  width: 4,
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
  ({ 'floor-wood-oak': 'Oak', 'floor-tile': 'Tile', 'wall-paint-white': 'White paint' })[id] ?? id

/** Parse a CRLF CSV into rows of cells (no embedded-newline handling needed
 *  for these fixtures — finish names + numbers are simple). */
function parse(csv: string): string[][] {
  return csv.split('\r\n').map((line) => line.split(','))
}

describe('buildRoomSchedule', () => {
  it('one row per room with area/perimeter/finishes/ceiling, live finish over defaults', () => {
    const rows = buildRoomSchedule(
      plan([room('living', 'Living')]),
      {
        floor: { living: 'floor-tile' },
        walls: { living: 'wall-paint-white' },
      } as RoomFinishMaps,
      nameOf,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      storey: 'Ground floor',
      room: 'Living',
      floor: 'Tile',
      wall: 'White paint',
      ceilingM: 2.6,
    })
    expect(rows[0].areaM2).toBeCloseTo(12, 9) // 4 × 3
    expect(rows[0].perimeterM).toBeCloseTo(14, 9) // 2·(4+3)
  })

  it('falls back to plan-room floor / app default + neutral wall + plan ceiling', () => {
    const rows = buildRoomSchedule(
      plan([room('bed', 'Bedroom', { floor: 'floor-wood-oak' }), room('bare', 'Bare')]),
      { floor: {}, walls: {} } as RoomFinishMaps,
      nameOf,
    )
    expect(rows[0]).toMatchObject({ room: 'Bedroom', floor: 'Oak', wall: ROOM_CSV_NEUTRAL_WALL })
    // 'Bare' uses the app default floor id (resolves to its raw id via nameOf here).
    expect(rows[1]).toMatchObject({ room: 'Bare', wall: ROOM_CSV_NEUTRAL_WALL })
  })

  it('lists rooms across storeys (ground first) with per-storey + per-room ceiling', () => {
    const upper: PlanUpperLevel = {
      id: 'lvl-2',
      name: 'Upper',
      elevation: 3,
      ceilingHeight: 3.2,
      walls: [],
      openings: [],
      rooms: [room('loft', 'Loft'), room('attic', 'Attic', { ceilingHeight: 2.1 })],
    }
    const rows = buildRoomSchedule(
      plan([room('g', 'Ground room')], [upper]),
      { floor: {}, walls: {} } as RoomFinishMaps,
      nameOf,
    )
    expect(rows.map((r) => r.room)).toEqual(['Ground room', 'Loft', 'Attic'])
    expect(rows.map((r) => r.storey)).toEqual(['Ground floor', 'Upper', 'Upper'])
    // Ground → plan default; Loft → level height; Attic → its per-room override.
    expect(rows.map((r) => r.ceilingM)).toEqual([2.6, 3.2, 2.1])
  })

  it('is empty for a plan with no rooms', () => {
    expect(buildRoomSchedule(plan([]), { floor: {}, walls: {} } as RoomFinishMaps, nameOf)).toEqual(
      [],
    )
  })
})

describe('buildRoomScheduleCsv', () => {
  it('emits a header, one row per room, and a grand-total footer (metric)', () => {
    const csv = buildRoomScheduleCsv(
      plan([room('living', 'Living'), room('kitchen', 'Kitchen', { width: 2, depth: 2 })]),
      { floor: { living: 'floor-tile' }, walls: {} } as RoomFinishMaps,
      nameOf,
      'metric',
    )
    const rows = parse(csv)
    expect(rows[0]).toEqual([
      'Storey',
      'Room',
      'Area',
      'Perimeter',
      'Floor finish',
      'Wall finish',
      'Ceiling height',
    ])
    // 2 room rows + 1 footer
    expect(rows).toHaveLength(4)
    expect(rows[1]).toEqual([
      'Ground floor',
      'Living',
      '12.0 m²',
      '14.00 m',
      'Tile',
      ROOM_CSV_NEUTRAL_WALL,
      '2.60 m',
    ])
    // Grand-total footer: room count + total floor area (12 + 4 = 16).
    expect(rows[3][0]).toBe('Total (2 rooms)')
    expect(rows[3][2]).toBe('16.0 m²')
  })

  it('formats area / perimeter / ceiling in imperial when asked', () => {
    const csv = buildRoomScheduleCsv(
      plan([room('living', 'Living')]),
      { floor: {}, walls: {} } as RoomFinishMaps,
      nameOf,
      'imperial',
    )
    const rows = parse(csv)
    expect(rows[1][2]).toContain('ft²')
    expect(rows[1][3]).toContain('′')
    expect(rows[1][6]).toContain('′')
  })

  it('RFC-4180 quotes commas + neutralises CSV-injection in room / finish names', () => {
    const csv = buildRoomScheduleCsv(
      plan([room('r1', 'Living, Dining')]),
      { floor: { r1: 'evil-floor' }, walls: {} } as RoomFinishMaps,
      // A finish name beginning with '=' would be a live formula in Excel.
      (id) => (id === 'evil-floor' ? '=cmd|calc' : id),
      'metric',
    )
    expect(csv).toContain('"Living, Dining"') // comma → quoted
    expect(csv).toContain("'=cmd|calc") // formula lead neutralised with a quote
  })

  it('empty plan yields just the header + a zero-room total footer', () => {
    const csv = buildRoomScheduleCsv(plan([]), { floor: {}, walls: {} } as RoomFinishMaps, nameOf)
    const rows = parse(csv)
    expect(rows).toHaveLength(2)
    expect(rows[1][0]).toBe('Total (0 rooms)')
    expect(rows[1][2]).toBe('0.0 m²')
  })
})
