import { describe, expect, it } from 'vitest'
import { diffWalls, diffWallsByLevel } from './demolitionPlan'
import type { FloorPlan, PlanWall } from './types'

function wall(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'internal' }
}

function plan(walls: PlanWall[]): FloorPlan {
  return {
    id: 'p',
    name: 'P',
    ceilingHeight: 2.6,
    extent: [10, 10],
    walls,
    openings: [],
    rooms: [],
  }
}

describe('diffWalls', () => {
  it('classifies one removed + one added wall, summing lengths', () => {
    const original = plan([
      wall('a', [0, 0], [4, 0]), // kept
      wall('b', [4, 0], [4, 3]), // demolished, length 3
    ])
    const current = plan([
      wall('a', [0, 0], [4, 0]), // kept
      wall('c', [0, 0], [0, 5]), // added, length 5
    ])

    const diff = diffWalls(original, current)
    expect(diff.kept.map((w) => w.id)).toEqual(['a'])
    expect(diff.demolished.map((w) => w.id)).toEqual(['b'])
    expect(diff.added.map((w) => w.id)).toEqual(['c'])
    expect(diff.hackedLengthM).toBeCloseTo(3, 9)
    expect(diff.addedLengthM).toBeCloseTo(5, 9)
  })

  it('matches reversed-endpoint walls as kept (order-independent)', () => {
    const original = plan([wall('a', [0, 0], [4, 0])])
    const current = plan([wall('a-rev', [4, 0], [0, 0])])

    const diff = diffWalls(original, current)
    expect(diff.kept.map((w) => w.id)).toEqual(['a'])
    expect(diff.demolished).toHaveLength(0)
    expect(diff.added).toHaveLength(0)
    expect(diff.hackedLengthM).toBe(0)
    expect(diff.addedLengthM).toBe(0)
  })

  it('treats identical plans as all kept with zero hacked/added', () => {
    const walls = [wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [4, 3])]
    const diff = diffWalls(plan(walls), plan(walls))
    expect(diff.kept).toHaveLength(2)
    expect(diff.demolished).toHaveLength(0)
    expect(diff.added).toHaveLength(0)
    expect(diff.hackedLengthM).toBe(0)
    expect(diff.addedLengthM).toBe(0)
  })

  it('matches within epsilon but not beyond it', () => {
    const original = plan([wall('a', [0, 0], [4, 0])])
    const near = plan([wall('a2', [0.0005, 0], [4, -0.0005])])
    expect(diffWalls(original, near).kept).toHaveLength(1)

    const far = plan([wall('a3', [0.01, 0], [4, 0])])
    const farDiff = diffWalls(original, far)
    expect(farDiff.kept).toHaveLength(0)
    expect(farDiff.demolished).toHaveLength(1)
    expect(farDiff.added).toHaveLength(1)
  })

  it('pairs duplicate-geometry walls one-to-one', () => {
    const original = plan([wall('a', [0, 0], [4, 0]), wall('b', [0, 0], [4, 0])])
    const current = plan([wall('c', [0, 0], [4, 0])])
    const diff = diffWalls(original, current)
    expect(diff.kept).toHaveLength(1)
    expect(diff.demolished).toHaveLength(1)
    expect(diff.added).toHaveLength(0)
  })

  it('guards non-array / empty walls', () => {
    const empty = diffWalls(plan([]), plan([]))
    expect(empty.kept).toHaveLength(0)
    expect(empty.hackedLengthM).toBe(0)

    const bad = { id: 'x', name: 'X', ceilingHeight: 2.6, extent: [1, 1] } as unknown as FloorPlan
    const diff = diffWalls(bad, plan([wall('a', [0, 0], [1, 0])]))
    expect(diff.added).toHaveLength(1)
    expect(diff.demolished).toHaveLength(0)
  })
})

describe('diffWallsByLevel', () => {
  const withUpper = (p: FloorPlan, walls: PlanWall[]): FloorPlan => ({
    ...p,
    upperLevels: [
      { id: 'up', name: 'Upper storey', elevation: 2.9, walls, openings: [], rooms: [] },
    ],
  })

  it('diffs each storey against the SAME storey of the baseline', () => {
    const original = withUpper(plan([wall('g1', [0, 0], [4, 0])]), [wall('u1', [0, 0], [4, 0])])
    const current = withUpper(
      plan([wall('g1', [0, 0], [4, 0])]), // ground unchanged
      [wall('u2', [0, 0], [0, 3])], // upper: u1 hacked, u2 built
    )
    const rows = diffWallsByLevel(original, current)
    expect(rows.map((r) => r.levelId)).toEqual(['ground', 'up'])
    const [g, u] = rows
    expect(g.levelName).toBe('Ground floor')
    expect(g.diff.kept).toHaveLength(1)
    expect(g.diff.demolished).toHaveLength(0)
    expect(g.diff.added).toHaveLength(0)
    expect(g.wholeStorey).toBeUndefined()
    expect(u.levelName).toBe('Upper storey')
    expect(u.diff.demolished.map((w) => w.id)).toEqual(['u1'])
    expect(u.diff.added.map((w) => w.id)).toEqual(['u2'])
    // Same XZ geometry on different storeys must NOT cross-match: the ground
    // wall g1 (0,0→4,0) does not pair with the upper u1 at the same coords.
    expect(u.diff.kept).toHaveLength(0)
  })

  it('reports a storey present only in current as wholly added', () => {
    const original = plan([wall('g1', [0, 0], [4, 0])])
    const current = withUpper(plan([wall('g1', [0, 0], [4, 0])]), [wall('u1', [0, 0], [4, 0])])
    const rows = diffWallsByLevel(original, current)
    const up = rows.find((r) => r.levelId === 'up')!
    expect(up.wholeStorey).toBe('added')
    expect(up.diff.added.map((w) => w.id)).toEqual(['u1'])
    expect(up.diff.demolished).toHaveLength(0)
  })

  it('reports a storey present only in the baseline as wholly removed', () => {
    const original = withUpper(plan([wall('g1', [0, 0], [4, 0])]), [wall('u1', [0, 0], [4, 0])])
    const current = plan([wall('g1', [0, 0], [4, 0])])
    const rows = diffWallsByLevel(original, current)
    const up = rows.find((r) => r.levelId === 'up')!
    expect(up.wholeStorey).toBe('removed')
    expect(up.diff.demolished.map((w) => w.id)).toEqual(['u1'])
    expect(up.diff.added).toHaveLength(0)
  })
})
