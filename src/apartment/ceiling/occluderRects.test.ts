import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import type { FloorPlan } from '../../floorplan/types'
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
    // bedroom2 origin [3.38, 0.2], 2.76 x 3.525 → centre (4.76, 1.9625).
    expect(rect?.cx).toBeCloseTo(3.38 + 2.76 / 2, 3)
    expect(rect?.cz).toBeCloseTo(0.2 + 3.525 / 2, 3)
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

/**
 * **Occluders must cover EVERY storey (F13, v0.31.8.13).** `plan.rooms` is
 * ground-only and `Scene.tsx` calls `occluderRectsForPlan` with the WHOLE plan,
 * so an upper storey's rooms had a ceiling rendered (`PlanShell` iterates a
 * per-level `lp.rooms`) but no shadow occluder — the sun poured through as if
 * the room were unroofed. Measured on shipped templates: 8 rooms on
 * `tpl-hdb-maisonette`, 7 on `tpl-terrace-ground`, 3 on `tpl-loft`.
 */
describe('occluderRectsForPlan — every storey', () => {
  const twoStorey = (): FloorPlan =>
    ({
      id: 'ms',
      name: 'Two storey',
      ceilingHeight: 2.6,
      extent: [10, 10],
      walls: [],
      openings: [],
      rooms: [{ id: 'g1', name: 'Living', origin: [0, 0], width: 4, depth: 4 }],
      upperLevels: [
        {
          id: 'l2',
          name: 'Upper',
          elevation: 2.9,
          walls: [],
          openings: [],
          rooms: [{ id: 'u1', name: 'Bedroom', origin: [0, 0], width: 4, depth: 4 }],
        },
      ],
    }) as unknown as FloorPlan

  it('emits an occluder for an UPPER-storey room', () => {
    const rects = occluderRectsForPlan(twoStorey())
    expect(rects.map((r) => r.id).sort()).toEqual(['g1', 'u1'])
  })

  it("puts the upper room's plane at its own storey height, not the ground's", () => {
    // The load-bearing half: a plane at the ground storey's 2.6 m does not roof
    // a room whose floor starts at 2.9 m. Without the elevation offset both
    // rects would sit at 2.6 and the upper room would still be sunlit.
    const rects = occluderRectsForPlan(twoStorey())
    const ground = rects.find((r) => r.id === 'g1')!
    const upper = rects.find((r) => r.id === 'u1')!
    expect(ground.y).toBeCloseTo(2.6, 6)
    expect(upper.y).toBeCloseTo(2.9 + 2.6, 6)
    expect(upper.y).toBeGreaterThan(ground.y)
  })

  it('is unchanged for a single-storey plan', () => {
    const single = { ...twoStorey(), upperLevels: undefined } as unknown as FloorPlan
    const rects = occluderRectsForPlan(single)
    expect(rects).toHaveLength(1)
    expect(rects[0]!.y).toBeCloseTo(2.6, 6)
  })
})
