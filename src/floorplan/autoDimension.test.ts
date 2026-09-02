import { describe, expect, it } from 'vitest'
import { buildDimensions, formatMetres } from './autoDimension'
import type { FloorPlan, PlanWall } from './types'

function extWall(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'external' }
}

/** A 5m × 4m rectangle of external walls, with one room inside. */
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
    ],
    openings: [],
    rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 5, depth: 4 }],
  }
}

describe('formatMetres', () => {
  it('formats with 2 decimals and a metre suffix', () => {
    expect(formatMetres(3.4)).toBe('3.40 m')
    expect(formatMetres(5)).toBe('5.00 m')
    expect(formatMetres(2.345)).toBe('2.35 m')
  })
})

describe('buildDimensions', () => {
  it('yields one overall dimension per external wall with correct lengths', () => {
    const { overall } = buildDimensions(rectPlan())
    expect(overall).toHaveLength(4)
    const values = overall.map((d) => d.value).sort((a, b) => a - b)
    expect(values).toEqual([4, 4, 5, 5])
  })

  it('formats overall labels as integer millimetres (metric drawing convention)', () => {
    const { overall } = buildDimensions(rectPlan())
    const labels = overall.map((d) => d.label).sort()
    expect(labels).toEqual(['4000', '4000', '5000', '5000'])
  })

  it('formats overall labels in feet+inches when units=imperial', () => {
    const { overall } = buildDimensions(rectPlan(), 'imperial')
    const labels = overall.map((d) => d.label)
    // All labels use ′/″ notation, never metres.
    for (const l of labels) expect(l).not.toMatch(/\d+\.\d+ m/)
    // Drawing dimensions resolve to the nearest 1/8″, not the nearest inch:
    // 5 m → 16′ 4 7/8″, 4 m → 13′ 1 1/2″.
    expect(labels.filter((l) => l === '16′ 4 7/8″')).toHaveLength(2)
    expect(labels.filter((l) => l === '13′ 1 1/2″')).toHaveLength(2)
  })

  it('offsets overall lines outside the plan bounds', () => {
    const { overall } = buildDimensions(rectPlan())
    const top = overall.find((d) => d.side === 'top')
    const bottom = overall.find((d) => d.side === 'bottom')
    const left = overall.find((d) => d.side === 'left')
    const right = overall.find((d) => d.side === 'right')
    expect(top).toBeDefined()
    expect(bottom).toBeDefined()
    expect(left).toBeDefined()
    expect(right).toBeDefined()
    // Top line sits above (negative z), bottom below the 4m extent, etc.
    expect((top as { y1: number }).y1).toBeLessThan(0)
    expect((bottom as { y1: number }).y1).toBeGreaterThan(4)
    expect((left as { x1: number }).x1).toBeLessThan(0)
    expect((right as { x1: number }).x1).toBeGreaterThan(5)
  })

  it('produces an interior width×depth pair per room', () => {
    const { rooms } = buildDimensions(rectPlan())
    expect(rooms).toHaveLength(2)
    const values = rooms.map((d) => d.value).sort((a, b) => a - b)
    expect(values).toEqual([4, 5])
    for (const d of rooms) expect(d.side).toBe('interior')
  })

  it('ignores internal walls for overall dimensions', () => {
    const plan = rectPlan()
    plan.walls.push({ id: 'div', start: [2.5, 0], end: [2.5, 4], thickness: 'internal' })
    const { overall } = buildDimensions(plan)
    expect(overall).toHaveLength(4)
  })

  it('skips zero-length walls without throwing', () => {
    const plan = rectPlan()
    plan.walls.push(extWall('z', [1, 1], [1, 1]))
    const { overall } = buildDimensions(plan)
    expect(overall).toHaveLength(4)
  })

  it('returns empty sets for an empty plan and does not throw', () => {
    const empty: FloorPlan = {
      id: 'e',
      name: 'empty',
      ceilingHeight: 2.8,
      extent: [0, 0],
      walls: [],
      openings: [],
      rooms: [],
    }
    const { overall, rooms } = buildDimensions(empty)
    expect(overall).toEqual([])
    expect(rooms).toEqual([])
  })

  it('guards non-array walls/rooms', () => {
    const bad = {
      id: 'b',
      name: 'bad',
      ceilingHeight: 2.8,
      extent: [3, 3],
      walls: undefined,
      openings: [],
      rooms: undefined,
    } as unknown as FloorPlan
    expect(() => buildDimensions(bad)).not.toThrow()
    const { overall, rooms } = buildDimensions(bad)
    expect(overall).toEqual([])
    expect(rooms).toEqual([])
  })
})
