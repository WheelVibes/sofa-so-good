/**
 * Whole-home accessors (F13). `plan.rooms`/`walls`/`openings` are ground-only,
 * so these are what a whole-home consumer must use. Before they existed the
 * `planLevels(plan).flatMap(...)` idiom was hand-written in five modules — which
 * is how the ground-only reads spread in the first place.
 */
import { describe, expect, it } from 'vitest'
import { allPlanOpenings, allPlanRooms, allPlanWalls, planTotalAreaAllLevels } from './levels'
import type { FloorPlan } from './types'

/** Ground: one 6x5 room, one wall, one door. Upper: one 4x3 room, one wall. */
function twoStorey(): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [{ id: 'g-w', start: [0, 0], end: [6, 0], thickness: 'external' }],
    openings: [{ id: 'g-d', wallId: 'g-w', kind: 'door', offset: 1, width: 0.9 }],
    rooms: [{ id: 'g-r', name: 'Living', origin: [0, 0], width: 6, depth: 5 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        walls: [{ id: 'u-w', start: [0, 0], end: [4, 0], thickness: 'internal' }],
        openings: [{ id: 'u-win', wallId: 'u-w', kind: 'window', offset: 1, width: 1.2 }],
        rooms: [{ id: 'u-r', name: 'Bedroom', origin: [0, 0], width: 4, depth: 3 }],
      },
    ],
  } as unknown as FloorPlan
}

const single = () => ({ ...twoStorey(), upperLevels: [] }) as unknown as FloorPlan

describe('allPlanWalls / allPlanOpenings', () => {
  it('returns geometry from EVERY storey', () => {
    expect(
      allPlanWalls(twoStorey())
        .map((w) => w.id)
        .sort(),
    ).toEqual(['g-w', 'u-w'])
    expect(
      allPlanOpenings(twoStorey())
        .map((o) => o.id)
        .sort(),
    ).toEqual(['g-d', 'u-win'])
  })

  it('matches the ground-only read for a single-storey plan', () => {
    const p = single()
    expect(allPlanWalls(p)).toEqual(p.walls)
    expect(allPlanOpenings(p)).toEqual(p.openings)
    expect(allPlanRooms(p)).toEqual(p.rooms)
  })

  it('tolerates a level with missing arrays', () => {
    const ragged = {
      ...twoStorey(),
      upperLevels: [{ id: 'u', name: 'U', elevation: 3 }],
    } as unknown as FloorPlan
    expect(() => allPlanWalls(ragged)).not.toThrow()
    expect(allPlanWalls(ragged).map((w) => w.id)).toEqual(['g-w'])
  })
})

describe('planTotalAreaAllLevels', () => {
  it('sums every storey, not just the ground floor', () => {
    // 6x5 = 30 downstairs, 4x3 = 12 up.
    expect(planTotalAreaAllLevels(twoStorey())).toBeCloseTo(42, 6)
  })

  it('equals the ground-only total for a single-storey plan', () => {
    expect(planTotalAreaAllLevels(single())).toBeCloseTo(30, 6)
  })

  it('is strictly greater once a storey is added — the bug this fixes', () => {
    // Three call sites (share summary, share card, scale modal) passed the whole
    // plan to the SINGLE-LEVEL `planTotalArea` and so advertised a maisonette's
    // ground floor as the whole home.
    expect(planTotalAreaAllLevels(twoStorey())).toBeGreaterThan(planTotalAreaAllLevels(single()))
  })
})
