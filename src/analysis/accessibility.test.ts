import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import { buildAccessibilityReport, MIN_DOOR_CLEAR, TURN_CIRCLE } from './accessibility'

function plan(over: Partial<FloorPlan> = {}): FloorPlan {
  const ext: FloorPlan['walls'][number]['thickness'] = 'external'
  return {
    id: 'a11y-test',
    name: 'A11y',
    ceilingHeight: 2.6,
    extent: [8, 6],
    walls: [{ id: 'w', start: [0, 0], end: [8, 0], thickness: ext }],
    openings: [
      { id: 'main', kind: 'door', wallId: 'w', offset: 1, width: 1.2, sill: 0, head: 2.1 },
      { id: 'bath', kind: 'door', wallId: 'w', offset: 4, width: 0.7, sill: 0, head: 2.1 },
      { id: 'win', kind: 'window', wallId: 'w', offset: 6, width: 1.4, sill: 0.9, head: 2.1 },
    ],
    rooms: [
      { id: 'living', name: 'Living', origin: [0.2, 0.2], width: 4.0, depth: 3.0 },
      { id: 'wc', name: 'Bathroom', origin: [4.4, 0.2], width: 1.2, depth: 1.6 },
      { id: 'ledge', name: 'AC Ledge', origin: [6, 0.2], width: 1.0, depth: 0.5 },
    ],
    ...over,
  }
}

describe('buildAccessibilityReport', () => {
  it('checks door clear widths against the accessible minimum (windows ignored)', () => {
    const r = buildAccessibilityReport(plan())
    expect(r.doors).toHaveLength(2) // the window is not a door
    expect(r.doors.find((d) => d.id === 'main')!.pass).toBe(true) // 1.2 ≥ 0.85
    expect(r.doors.find((d) => d.id === 'bath')!.pass).toBe(false) // 0.7 < 0.85
    expect(r.doorPassCount).toBe(1)
    expect(r.thresholds.door).toBe(MIN_DOOR_CLEAR)
  })

  it('checks each habitable room fits a 1.5 m turning circle, skipping external rooms', () => {
    const r = buildAccessibilityReport(plan())
    // The AC ledge is external → not assessed.
    expect(r.rooms.map((x) => x.roomId)).toEqual(['living', 'wc'])
    expect(r.rooms.find((x) => x.roomId === 'living')!.pass).toBe(true) // min 3.0 ≥ 1.5
    expect(r.rooms.find((x) => x.roomId === 'wc')!.pass).toBe(false) // min 1.2 < 1.5
    expect(r.turnPassCount).toBe(1)
    expect(r.thresholds.turn).toBe(TURN_CIRCLE)
  })

  it('reports allPass only when every door + room passes', () => {
    const good = buildAccessibilityReport(
      plan({
        openings: [
          { id: 'main', kind: 'door', wallId: 'w', offset: 1, width: 0.9, sill: 0, head: 2.1 },
        ],
        rooms: [{ id: 'living', name: 'Living', origin: [0.2, 0.2], width: 4.0, depth: 3.0 }],
      }),
    )
    expect(good.allPass).toBe(true)
    expect(buildAccessibilityReport(plan()).allPass).toBe(false)
  })

  it('is vacuously allPass + robust for a plan with no doors/rooms', () => {
    const r = buildAccessibilityReport({
      id: 'empty',
      name: 'E',
      ceilingHeight: 2.6,
      extent: [4, 4],
      walls: [],
      openings: [],
      rooms: [],
    })
    expect(r.allPass).toBe(true)
    expect(r.doors).toHaveLength(0)
    expect(r.rooms).toHaveLength(0)
  })
})
