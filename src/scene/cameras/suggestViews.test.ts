import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import type { FloorPlan } from '../../floorplan/types'
import type { FurnitureItem } from '../../furniture/types'
import { cornerViewForRoom, overviewView, suggestViews } from './suggestViews'

function fakeItem(id: string, x: number, z: number): FurnitureItem {
  return { id, defId: 'sofa', position: [x, z], rotation: 0, props: {} }
}

/** Room rect shape accepted by `cornerViewForRoom` (mirrors the internal
 *  `RoomRect` — reconstructed here since it isn't exported). */
function rect(ox: number, oz: number, width: number, depth: number) {
  return { id: 'r', name: 'Room', ox, oz, width, depth }
}

describe('cornerViewForRoom', () => {
  it('places the eye inside the room bounds with margin, looking at the room centre when empty', () => {
    const r = rect(0, 0, 4, 5)
    const view = cornerViewForRoom(r, [])
    expect(view).not.toBeNull()
    const [ex, ey, ez] = view!.pos
    expect(ex).toBeGreaterThan(r.ox)
    expect(ex).toBeLessThan(r.ox + r.width)
    expect(ez).toBeGreaterThan(r.oz)
    expect(ez).toBeLessThan(r.oz + r.depth)
    expect(ey).toBeCloseTo(1.5, 5)
    // Look-at target is sane: inside the room, at a reasonable height.
    const [tx, ty, tz] = view!.target
    expect(tx).toBeGreaterThanOrEqual(r.ox)
    expect(tx).toBeLessThanOrEqual(r.ox + r.width)
    expect(tz).toBeGreaterThanOrEqual(r.oz)
    expect(tz).toBeLessThanOrEqual(r.oz + r.depth)
    expect(ty).toBeCloseTo(1.0, 5)
  })

  it('biases the look-at target toward the furniture cluster', () => {
    const r = rect(0, 0, 5, 5)
    // A cluster hugging the north wall (low z).
    const items = [fakeItem('a', 2, 0.3), fakeItem('b', 2.4, 0.4), fakeItem('c', 1.8, 0.5)]
    const view = cornerViewForRoom(r, items)
    expect(view).not.toBeNull()
    // Target is pulled toward the cluster (north), away from the bare centre (z=2.5).
    expect(view!.target[2]).toBeLessThan(2.5)
    // The eye sits on the OPPOSITE (south) side, giving real standoff from
    // the focal (north) wall it's shooting toward — at least 1.5 m clear.
    expect(view!.pos[2]).toBeGreaterThan(2.5)
    const clearanceFromFocalWall = view!.pos[2] - r.oz
    expect(clearanceFromFocalWall).toBeGreaterThanOrEqual(1.5)
  })

  it('skips a room smaller than the minimum framing dimension', () => {
    expect(cornerViewForRoom(rect(0, 0, 1.5, 1.5), [])).toBeNull()
    expect(cornerViewForRoom(rect(0, 0, 4, 1.5), [])).toBeNull() // one axis too small
  })
})

describe('overviewView', () => {
  it('frames the default flat from a 3/4 dollhouse angle above the floor', () => {
    const view = overviewView(buildDefaultPlan())
    expect(view.name).toBe('Overview')
    expect(view.pos[1]).toBeGreaterThan(0)
    expect(view.target[1]).toBeCloseTo(1.0, 5)
  })

  it('frames a custom plan using its own bounds', () => {
    const plan: FloorPlan = {
      id: 'custom-1',
      name: 'Custom',
      ceilingHeight: 2.6,
      extent: [6, 5],
      walls: [],
      openings: [],
      rooms: [{ id: 'r1', name: 'Room 1', origin: [0.2, 0.2], width: 5.6, depth: 4.6 }],
    }
    const view = overviewView(plan)
    // Roughly centred on the plan extent (3, 2.5).
    expect(view.target[0]).toBeCloseTo(3, 1)
    expect(view.target[2]).toBeCloseTo(2.5, 1)
  })
})

describe('suggestViews', () => {
  it('returns a corner view per largest furnished room + one overview, for the default flat', () => {
    const plan = buildDefaultPlan()
    // Furnish the main bedroom + living/dining only (bathrooms stay empty and
    // are excluded from "furnished" regardless of size).
    const items: FurnitureItem[] = [
      fakeItem('bed', 1.5, 1.5), // inside mainBedroom (origin [0.2,0.2] 2.85x3.4)
      fakeItem('sofa', 10, 3), // inside livingDining (origin [8.55,1.4] 4.0x5.4)
    ]
    const views = suggestViews(plan, items)
    const names = views.map((v) => v.name)
    expect(names).toContain('Overview')
    expect(names.filter((n) => n !== 'Overview').length).toBeGreaterThan(0)
    expect(names.filter((n) => n !== 'Overview').length).toBeLessThanOrEqual(3)
    // Every returned pose is finite (no NaN from a degenerate room).
    for (const v of views) {
      for (const n of [...v.pos, ...v.target]) expect(Number.isFinite(n)).toBe(true)
    }
  })

  it('returns only the overview when nothing is furnished', () => {
    const views = suggestViews(buildDefaultPlan(), [])
    expect(views).toHaveLength(1)
    expect(views[0].name).toBe('Overview')
  })

  it('works for a custom plan fixture too', () => {
    const plan: FloorPlan = {
      id: 'custom-2',
      name: 'Custom',
      ceilingHeight: 2.6,
      extent: [8, 6],
      walls: [],
      openings: [],
      rooms: [
        { id: 'living', name: 'Living Room', origin: [0.2, 0.2], width: 4, depth: 3.5 },
        { id: 'bed', name: 'Bedroom', origin: [4.5, 0.2], width: 3, depth: 3 },
      ],
    }
    const items: FurnitureItem[] = [fakeItem('sofa', 2, 2), fakeItem('bed', 6, 1.5)]
    const views = suggestViews(plan, items)
    const names = views.map((v) => v.name)
    expect(names).toContain('Living Room — corner')
    expect(names).toContain('Bedroom — corner')
    expect(names).toContain('Overview')
  })
})
