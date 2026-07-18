import { describe, expect, it } from 'vitest'
import { datumPoint, settingOutDimensions, tileSettingOutPoints } from './settingOut'
import type { FloorPlan, PlanUpperLevel, PlanWall } from './types'

function extWall(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'external' }
}
function intWall(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'internal' }
}

/** A 5m × 4m rectangle of external walls (min corner at [0,0]) plus one
 *  internal vertical partition at x=2 and one horizontal partition at z=2. */
function rectPlan(): FloorPlan {
  return {
    id: 'p1',
    name: 'rect',
    ceilingHeight: 2.8,
    extent: [5, 4],
    walls: [
      extWall('n', [0, 0], [5, 0]),
      extWall('e', [5, 0], [5, 4]),
      extWall('s', [5, 4], [0, 4]),
      extWall('w', [0, 4], [0, 0]),
      intWall('v1', [2, 0], [2, 4]),
      intWall('h1', [0, 2], [5, 2]),
    ],
    openings: [],
    rooms: [
      { id: 'r1', name: 'Living', origin: [0, 0], width: 2, depth: 4 },
      { id: 'r2', name: 'Bedroom', origin: [2, 0], width: 3, depth: 4 },
    ],
  }
}

describe('datumPoint', () => {
  it('defaults to the min-x/min-z EXTERNAL wall corner', () => {
    expect(datumPoint(rectPlan())).toEqual([0, 0])
  })

  it('falls back to all walls when there are no external walls', () => {
    const plan = rectPlan()
    plan.walls = plan.walls.map((w) => ({ ...w, thickness: 'internal' as const }))
    expect(datumPoint(plan)).toEqual([0, 0])
  })

  it('is [0, 0] for a wall-less plan', () => {
    const plan = rectPlan()
    plan.walls = []
    expect(datumPoint(plan)).toEqual([0, 0])
  })

  it('honours an explicit plan.datum override on the ground storey', () => {
    const plan = rectPlan()
    plan.datum = { x: 1, z: 1 }
    expect(datumPoint(plan)).toEqual([1, 1])
  })

  it('ignores plan.datum for an upper-storey lookup (ground-only override)', () => {
    const plan = rectPlan()
    plan.datum = { x: 1, z: 1 }
    const upper: PlanUpperLevel = {
      id: 'u1',
      name: 'Upper',
      elevation: 3,
      walls: [extWall('un', [0.5, 0.5], [4, 0.5]), extWall('uw', [0.5, 0.5], [0.5, 3])],
      openings: [],
      rooms: [],
    }
    plan.upperLevels = [upper]
    expect(datumPoint(plan, 'u1')).toEqual([0.5, 0.5])
  })
})

describe('settingOutDimensions', () => {
  it('offsets a 0.2m external wall face by half-thickness toward the datum (centerline − 0.1)', () => {
    const set = settingOutDimensions(rectPlan())
    // The east external wall's centreline is x=5; its face toward the datum
    // (x=0) is 5 − 0.1 = 4.9, a running distance of 4.9 from the datum.
    const eastFace = set.x.find((f) => f.wallId === 'e')
    expect(eastFace).toBeDefined()
    expect(eastFace?.distance).toBeCloseTo(4.9, 6)
  })

  it('offsets an internal 0.1m partition by half-thickness (centerline − 0.05)', () => {
    const set = settingOutDimensions(rectPlan())
    const v1 = set.x.find((f) => f.wallId === 'v1')
    expect(v1?.distance).toBeCloseTo(1.95, 6)
    const h1 = set.z.find((f) => f.wallId === 'h1')
    expect(h1?.distance).toBeCloseTo(1.95, 6)
  })

  it('sorts rows ascending and dedupes coincident faces', () => {
    const plan = rectPlan()
    // A second vertical partition at the EXACT same centreline as v1 — its
    // face lands on v1's face (both 1.95), so it must collapse to one row.
    plan.walls.push(intWall('v2', [2, 0], [2, 4]))
    const set = settingOutDimensions(plan)
    const xs = set.x.map((f) => f.distance)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(xs.filter((d) => Math.abs(d - 1.95) < 1e-6)).toHaveLength(1)
    // Overall count: e (4.9), s(inner face too? no — s is horizontal), v1/v2
    // dedupe to one x-row entry alongside the west wall's own face.
    expect(set.x).toHaveLength(3)
  })

  it('filters to the given storey, using that level’s own walls', () => {
    const plan = rectPlan()
    const upper: PlanUpperLevel = {
      id: 'u1',
      name: 'Upper',
      elevation: 3,
      walls: [extWall('un', [0, 0], [3, 0]), intWall('up1', [1, 0], [1, 3])],
      openings: [],
      rooms: [],
    }
    plan.upperLevels = [upper]
    const groundSet = settingOutDimensions(plan)
    const upperSet = settingOutDimensions(plan, 'u1')
    expect(groundSet.x.map((f) => f.wallId).sort()).toEqual(['e', 'v1', 'w'])
    expect(upperSet.x.map((f) => f.wallId)).toEqual(['up1'])
    expect(upperSet.z.map((f) => f.wallId)).toEqual(['un'])
  })

  it('returns empty rows at datum [0,0] for a degenerate (wall-less) plan', () => {
    const plan = rectPlan()
    plan.walls = []
    const set = settingOutDimensions(plan)
    expect(set.datum).toEqual([0, 0])
    expect(set.x).toEqual([])
    expect(set.z).toEqual([])
  })

  it('skips a curved wall (no simple planar face)', () => {
    const plan = rectPlan()
    plan.walls.push({ ...intWall('curved', [1, 1], [1, 3]), arc: 0.3 })
    const set = settingOutDimensions(plan)
    expect(set.x.find((f) => f.wallId === 'curved')).toBeUndefined()
    expect(set.z.find((f) => f.wallId === 'curved')).toBeUndefined()
  })
})

describe('tileSettingOutPoints', () => {
  it('returns one point per room, offset south of the room label centroid (H-D2)', () => {
    const points = tileSettingOutPoints(rectPlan())
    expect(points).toHaveLength(2)
    const living = points.find((p) => p.roomId === 'r1')
    // Living: origin [0,0], 2×4 → label centroid [1, 2] → mark offset 0.5m
    // south (+z) to clear the room-name/area label block (H-D2 fix), still
    // well inside the room's z-bounds [0, 4].
    expect(living?.point[0]).toBeCloseTo(1, 6)
    expect(living?.point[1]).toBeCloseTo(2.5, 6)
  })

  it('clamps the offset to stay inside a room too shallow for the full 0.5m', () => {
    const plan = rectPlan()
    // A 2×0.5 sliver room (origin [0,0]) — centroid z=0.25; the offset would
    // push the mark to z=0.75, outside the room (depth 0.5) — must clamp
    // inside, never land on/past the far wall.
    plan.rooms = [{ id: 'thin', name: 'Thin', origin: [0, 0], width: 2, depth: 0.5 }]
    const [point] = tileSettingOutPoints(plan)
    expect(point?.point[1]).toBeLessThanOrEqual(0.5)
    expect(point?.point[1]).toBeGreaterThanOrEqual(0)
  })

  it('filters to the given storey', () => {
    const plan = rectPlan()
    const upper: PlanUpperLevel = {
      id: 'u1',
      name: 'Upper',
      elevation: 3,
      walls: [],
      openings: [],
      rooms: [{ id: 'ur1', name: 'Loft', origin: [0, 0], width: 3, depth: 3, floor: 'tile' }],
    }
    plan.upperLevels = [upper]
    expect(tileSettingOutPoints(plan, 'u1').map((p) => p.roomId)).toEqual(['ur1'])
    expect(tileSettingOutPoints(plan).map((p) => p.roomId)).toEqual(['r1', 'r2'])
  })
})
