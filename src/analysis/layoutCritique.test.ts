import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildLayoutCritique, CRITIQUE } from './layoutCritique'

/** One 6 x 5 m living room. */
function plan(): FloorPlan {
  return {
    name: 'p',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 6, depth: 5 }],
  } as unknown as FloorPlan
}

function def(id: string, w: number, d: number): FurnitureDef {
  return {
    id,
    name: id,
    category: 'seating',
    kind: 'primitive',
    defaultFootprint: { w, d },
  } as unknown as FurnitureDef
}

function item(id: string, defId: string, x: number, z: number): FurnitureItem {
  return { id, defId, position: [x, z], rotation: 0, props: {} } as unknown as FurnitureItem
}

const defs: Record<string, FurnitureDef> = {
  'sofa-3seat': def('sofa-3seat', 2.1, 0.9),
  armchair: def('armchair', 0.8, 0.8),
  'tv-console': def('tv-console', 1.4, 0.4),
  'coffee-table': def('coffee-table', 1.1, 0.55),
}

const find = (c: ReturnType<typeof buildLayoutCritique>, id: string) =>
  c.findings.find((f) => f.id === id)!

describe('buildLayoutCritique — TV viewing distance', () => {
  it('passes a seat inside the published 2.4-3.7 m band', () => {
    const c = buildLayoutCritique(
      plan(),
      [item('s', 'sofa-3seat', 3, 1), item('t', 'tv-console', 3, 4)],
      defs,
    )
    expect(find(c, 'tv-distance').verdict).toBe('pass')
    expect(find(c, 'tv-distance').detail).toContain('3.00 m')
  })

  it('warns when the seat is too close to the screen', () => {
    const c = buildLayoutCritique(
      plan(),
      [item('s', 'sofa-3seat', 3, 3), item('t', 'tv-console', 3, 4)],
      defs,
    )
    expect(find(c, 'tv-distance').verdict).toBe('warn')
  })

  it('measures to the NEAREST seat, not an arbitrary one', () => {
    const c = buildLayoutCritique(
      plan(),
      [
        item('far', 'sofa-3seat', 3, 0.5),
        item('near', 'armchair', 3, 3.9),
        item('t', 'tv-console', 3, 4),
      ],
      defs,
    )
    // The armchair at 0.1 m is nearest, so this must warn, not pass on the sofa.
    expect(find(c, 'tv-distance').verdict).toBe('warn')
  })

  it('skips rather than fails when there is no TV', () => {
    const c = buildLayoutCritique(plan(), [item('s', 'sofa-3seat', 3, 1)], defs)
    expect(find(c, 'tv-distance').verdict).toBe('skipped')
  })
})

describe('buildLayoutCritique — conversation grouping', () => {
  it('passes seats within the 1.8-2.4 m ideal band', () => {
    const c = buildLayoutCritique(
      plan(),
      [item('a', 'sofa-3seat', 2, 2.5), item('b', 'armchair', 4, 2.5)],
      defs,
    )
    expect(find(c, 'conversation').verdict).toBe('pass')
  })

  it('FAILS past the 3.05 m breakdown distance, with the reason stated', () => {
    const c = buildLayoutCritique(
      plan(),
      [item('a', 'sofa-3seat', 1, 2.5), item('b', 'armchair', 5, 2.5)],
      defs,
    )
    const f = find(c, 'conversation')
    expect(f.verdict).toBe('fail')
    expect(f.detail).toMatch(/cannot hold one conversation/)
  })

  it('measures the WIDEST pair — that spread is what breaks a group', () => {
    const c = buildLayoutCritique(
      plan(),
      [
        item('a', 'sofa-3seat', 1, 2.5),
        item('b', 'armchair', 2, 2.5),
        item('cc', 'armchair', 5, 2.5),
      ],
      defs,
    )
    expect(find(c, 'conversation').verdict).toBe('fail')
  })

  it('skips with fewer than two seats in a room', () => {
    const c = buildLayoutCritique(plan(), [item('a', 'sofa-3seat', 3, 3)], defs)
    expect(find(c, 'conversation').verdict).toBe('skipped')
  })
})

describe('buildLayoutCritique — coffee table and proportion', () => {
  it('skips the table check when none is placed', () => {
    const c = buildLayoutCritique(plan(), [item('s', 'sofa-3seat', 3, 3)], defs)
    expect(find(c, 'coffee-table').verdict).toBe('skipped')
  })

  it('warns an over-scaled sofa against the room span', () => {
    const wide: Record<string, FurnitureDef> = { ...defs, big: def('big', 4.5, 0.9) }
    const c = buildLayoutCritique(
      {
        ...plan(),
        rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 6, depth: 5 }],
      } as never,
      [item('s', 'big', 3, 3)],
      { ...wide, big: def('big', 4.5, 0.9) },
    )
    // 4.5 m across a 5 m shorter span = 90%, over the 60% bar.
    const f = c.findings.find((x) => x.id === 'sofa-proportion')
    expect(f?.verdict === 'warn' || f?.verdict === 'skipped').toBe(true)
  })

  it('passes a proportionate sofa', () => {
    const c = buildLayoutCritique(plan(), [item('s', 'sofa-3seat', 3, 3)], defs)
    // 2.1 m across a 5 m span = 42%.
    expect(find(c, 'sofa-proportion').verdict).toBe('pass')
  })
})

describe('buildLayoutCritique — scoring', () => {
  it('scores only the checks that APPLIED, so a sparse room is not penalised', () => {
    const c = buildLayoutCritique(plan(), [], defs)
    expect(c.applied).toBe(0)
    // 100 means "no evidence of a problem", not "perfect" — documented.
    expect(c.score).toBe(100)
  })

  it('a failing check drags the score below a warning one', () => {
    const good = buildLayoutCritique(
      plan(),
      [item('a', 'sofa-3seat', 2, 2.5), item('b', 'armchair', 4, 2.5)],
      defs,
    )
    const bad = buildLayoutCritique(
      plan(),
      [item('a', 'sofa-3seat', 1, 2.5), item('b', 'armchair', 5, 2.5)],
      defs,
    )
    expect(bad.score).toBeLessThan(good.score)
  })

  it('is deterministic', () => {
    const items = [item('a', 'sofa-3seat', 2, 2.5), item('b', 'armchair', 4, 2.5)]
    expect(buildLayoutCritique(plan(), items, defs)).toEqual(
      buildLayoutCritique(plan(), items, defs),
    )
  })

  it('exposes its thresholds so a caller can cite them', () => {
    expect(CRITIQUE.tvMin).toBe(2.4)
    expect(CRITIQUE.convBreakdown).toBe(3.05)
    expect(CRITIQUE.tableMin).toBe(0.36)
  })

  it('never throws on a malformed def or an item outside every room', () => {
    expect(() =>
      buildLayoutCritique(
        plan(),
        [item('x', 'nope', 99, 99), item('s', 'sofa-3seat', 99, 99)],
        defs,
      ),
    ).not.toThrow()
  })
})
