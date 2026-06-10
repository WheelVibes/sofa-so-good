import { describe, expect, it } from 'vitest'
import { diffWalls } from './demolitionPlan'
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
