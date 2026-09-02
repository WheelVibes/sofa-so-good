/**
 * `placementLevelPlan` (F13) — the storey a NEW item is placed against.
 *
 * `itemsSlice.addItem` derives an item's `levelId` from the open room editor, so
 * anything resolving geometry AT placement time must resolve the same storey.
 * `usePlacementController`'s window/door snaps read `floorPlan.walls`/`openings`
 * (ground only), so a curtain dropped while editing an upstairs room was either
 * rejected as "this plan has no window" or snapped to a GROUND window's
 * coordinates while tagged to the upper storey.
 */
import { describe, expect, it } from 'vitest'
import { placementLevelPlan } from './levels'
import type { FloorPlan } from './types'

function maisonette(): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [6, 4],
    ceilingHeight: 3,
    walls: [{ id: 'g-n', start: [0, 0], end: [6, 0], thickness: 'external' }],
    openings: [
      { id: 'g-d', wallId: 'g-n', kind: 'door', offset: 1, width: 0.9, sill: 0, head: 2.1 },
    ],
    rooms: [{ id: 'g-live', name: 'Living', origin: [0, 0], width: 6, depth: 4 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3.2,
        ceilingHeight: 2.2,
        walls: [{ id: 'u-n', start: [0, 0], end: [6, 0], thickness: 'external' }],
        openings: [
          { id: 'u-w', wallId: 'u-n', kind: 'window', offset: 2, width: 1.2, sill: 0.9, head: 2 },
        ],
        rooms: [{ id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 6, depth: 4 }],
      },
    ],
  } as unknown as FloorPlan
}

const editing = (roomId: string | null) => ({
  floorPlan: maisonette(),
  roomEditor: { active: roomId !== null, roomId },
})

describe('placementLevelPlan', () => {
  it("returns the UPPER storey's geometry while editing an upstairs room", () => {
    const lp = placementLevelPlan(editing('u-bed'))
    expect(lp.walls.map((w) => w.id)).toEqual(['u-n'])
    expect(lp.openings.map((o) => o.id)).toEqual(['u-w'])
    // And its own ceiling height, which window fixtures are sized against.
    expect(lp.ceilingHeight).toBeCloseTo(2.2, 6)
  })

  it('returns the ground plan while editing a ground room', () => {
    const lp = placementLevelPlan(editing('g-live'))
    expect(lp.walls.map((w) => w.id)).toEqual(['g-n'])
    expect(lp.ceilingHeight).toBeCloseTo(3, 6)
  })

  it('returns the whole plan when no room editor is open', () => {
    const s = editing(null)
    expect(placementLevelPlan(s)).toBe(s.floorPlan)
  })

  it('falls back to the plan for an unknown room id rather than throwing', () => {
    const s = editing('nope')
    expect(placementLevelPlan(s)).toBe(s.floorPlan)
  })
})
