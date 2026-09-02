/**
 * `mapPlanRooms` — whole-home room rewrites (F13).
 *
 * `{ ...plan, rooms: plan.rooms.map(fn) }` is ground-only, so a finish preset,
 * an OCS re-finish or a screed pass repainted the downstairs and silently left
 * every upstairs room on its old floor. Three `resetSlice` paths did exactly
 * that.
 */
import { describe, expect, it } from 'vitest'
import { mapPlanRooms } from './levels'
import type { FloorPlan } from './types'

function twoStorey(): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms: [{ id: 'g-live', name: 'Living', origin: [0, 0], width: 6, depth: 5, floor: 'old' }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3,
        walls: [],
        openings: [],
        rooms: [{ id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 4, depth: 3, floor: 'old' }],
      },
    ],
  } as unknown as FloorPlan
}

const repaint = (r: { floor?: string }) => ({ ...r, floor: 'new' }) as never

describe('mapPlanRooms', () => {
  it('applies the mapper to EVERY storey', () => {
    const out = mapPlanRooms(twoStorey(), repaint)
    expect(out.rooms[0]!.floor).toBe('new')
    expect(out.upperLevels![0]!.rooms[0]!.floor).toBe('new')
  })

  it('leaves the original plan untouched', () => {
    const p = twoStorey()
    mapPlanRooms(p, repaint)
    expect(p.rooms[0]!.floor).toBe('old')
    expect(p.upperLevels![0]!.rooms[0]!.floor).toBe('old')
  })

  it('preserves each level own non-room fields', () => {
    const out = mapPlanRooms(twoStorey(), repaint)
    expect(out.upperLevels![0]!.elevation).toBe(3)
    expect(out.upperLevels![0]!.name).toBe('Upper')
  })

  it('passes through a level with no rooms array rather than inventing one', () => {
    const ragged = {
      ...twoStorey(),
      upperLevels: [{ id: 'u', name: 'U', elevation: 3 }],
    } as unknown as FloorPlan
    const out = mapPlanRooms(ragged, repaint)
    expect(out.upperLevels![0]).not.toHaveProperty('rooms')
  })

  it('is a plain ground-only map for a single-storey plan', () => {
    const single = { ...twoStorey(), upperLevels: [] } as unknown as FloorPlan
    const out = mapPlanRooms(single, repaint)
    expect(out.rooms[0]!.floor).toBe('new')
    expect(out.upperLevels).toEqual([])
  })
})
