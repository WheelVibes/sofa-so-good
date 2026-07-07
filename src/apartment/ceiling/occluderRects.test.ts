import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { occluderRectsForPlan } from './occluderRects'

describe('occluderRectsForPlan', () => {
  it('emits a rect per non-external room of the default plan', () => {
    const plan = buildDefaultPlan()
    const rects = occluderRectsForPlan(plan)
    // Every rect maps to a real plan room id, has positive extent, and a
    // ceiling-height y above the floor.
    expect(rects.length).toBeGreaterThan(0)
    for (const r of rects) {
      expect(plan.rooms.some((pr) => pr.id === r.id)).toBe(true)
      expect(r.w).toBeGreaterThan(0)
      expect(r.d).toBeGreaterThan(0)
      expect(r.y).toBeGreaterThan(1.5)
    }
  })

  it('excludes external rooms (balcony / service yard / ledges)', () => {
    const plan = buildDefaultPlan()
    const rects = occluderRectsForPlan(plan)
    const ids = new Set(rects.map((r) => r.id))
    // A room flagged external in ROOMS must not be roofed.
    expect(ids.has('acLedge')).toBe(false)
  })

  it('centres the rect on the room outline bounding box', () => {
    const plan = buildDefaultPlan()
    const bedroom = plan.rooms.find((r) => r.id === 'bedroom2')
    expect(bedroom).toBeTruthy()
    const rect = occluderRectsForPlan(plan).find((r) => r.id === 'bedroom2')
    expect(rect).toBeTruthy()
    // bedroom2 origin [3.15, 0.2], 2.85 x 3.4 → centre (4.575, 1.9).
    expect(rect?.cx).toBeCloseTo(3.15 + 2.85 / 2, 3)
    expect(rect?.cz).toBeCloseTo(0.2 + 3.4 / 2, 3)
  })

  it('returns an empty array for a plan with no rooms', () => {
    const plan = { ...buildDefaultPlan(), rooms: [] }
    expect(occluderRectsForPlan(plan)).toEqual([])
  })

  it('roofs a custom room id absent from ROOMS, using the plan ceiling height', () => {
    // A custom-plan room (id not in the ROOMS constant) has no `external` flag,
    // so it falls through as interior and is roofed at the plan default height.
    const base = buildDefaultPlan()
    const plan = {
      ...base,
      ceilingHeight: 2.8,
      rooms: [
        {
          id: 'custom-room-xyz',
          name: 'Custom',
          origin: [0, 0] as [number, number],
          width: 3,
          depth: 4,
        },
      ],
    }
    const rects = occluderRectsForPlan(plan)
    expect(rects).toHaveLength(1)
    expect(rects[0]).toMatchObject({ id: 'custom-room-xyz', cx: 1.5, cz: 2, w: 3, d: 4, y: 2.8 })
  })
})
