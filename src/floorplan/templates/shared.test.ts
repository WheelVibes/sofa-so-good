import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../types'
import { cat, door, iwall, parapet, perimeter, room, T, window } from './shared'

describe('T', () => {
  it('is the 0.1 m wall inset constant', () => {
    expect(T).toBe(0.1)
  })
})

describe('perimeter', () => {
  it('builds four external walls inset by T, in N/E/S/W order', () => {
    const walls = perimeter('p', 4, 3)
    expect(walls).toHaveLength(4)
    expect(walls.map((w) => w.id)).toEqual(['p-n', 'p-e', 'p-s', 'p-w'])
    for (const w of walls) expect(w.thickness).toBe('external')
  })

  it('places corners inset by T from the nominal W×D footprint', () => {
    const W = 5
    const D = 4
    const [n, e, s, w] = perimeter('p', W, D)
    // corners: a=(T,T) b=(W-T,T) c=(W-T,D-T) d=(T,D-T)
    expect(n.start).toEqual([T, T])
    expect(n.end).toEqual([W - T, T])
    expect(e.start).toEqual([W - T, T])
    expect(e.end).toEqual([W - T, D - T])
    expect(s.start).toEqual([W - T, D - T])
    expect(s.end).toEqual([T, D - T])
    expect(w.start).toEqual([T, D - T])
    expect(w.end).toEqual([T, T])
  })

  it('forms a closed loop (each wall end matches the next wall start)', () => {
    const walls = perimeter('loop', 6, 2.5)
    for (let i = 0; i < walls.length; i++) {
      const cur = walls[i]
      const next = walls[(i + 1) % walls.length]
      expect(cur.end).toEqual(next.start)
    }
    // and the loop closes back to the first wall's start
    expect(walls[walls.length - 1].end).toEqual(walls[0].start)
  })

  it('prefixes every wall id with the given prefix', () => {
    const walls = perimeter('h2', 3, 3)
    for (const w of walls) expect(w.id.startsWith('h2-')).toBe(true)
  })
})

describe('iwall', () => {
  it('builds an internal wall with the given id/start/end', () => {
    const w = iwall('h2-bed-s', [0.1, 3.2], [3.3, 3.2])
    expect(w).toEqual({
      id: 'h2-bed-s',
      start: [0.1, 3.2],
      end: [3.3, 3.2],
      thickness: 'internal',
    })
  })
})

describe('door', () => {
  it('defaults to a 0.9 m wide door at sill 0 / head 2.1', () => {
    const d = door('h2-main', 'h2-s', 1.2)
    expect(d).toEqual({
      id: 'h2-main',
      kind: 'door',
      wallId: 'h2-s',
      offset: 1.2,
      width: 0.9,
      sill: 0,
      head: 2.1,
    })
  })

  it('accepts an explicit width override', () => {
    const d = door('h2-bath', 'h2-bath-n', 0.6, 0.7)
    expect(d.width).toBe(0.7)
    expect(d.offset).toBe(0.6)
  })

  it('does not clamp offset/width against any wall length (pure record builder)', () => {
    const d = door('oob', 'wall-1', -5, 100)
    expect(d.offset).toBe(-5)
    expect(d.width).toBe(100)
  })
})

describe('window', () => {
  it('defaults to a 1.4 m wide window at sill 0.95 / head 2.1', () => {
    const win = window('h2-bed-win', 'h2-n', 1.2)
    expect(win).toEqual({
      id: 'h2-bed-win',
      kind: 'window',
      wallId: 'h2-n',
      offset: 1.2,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    })
  })

  it('accepts an explicit width override', () => {
    const win = window('h2-kit-win', 'h2-n', 4.0, 1.2)
    expect(win.width).toBe(1.2)
    expect(win.offset).toBe(4.0)
  })
})

describe('room', () => {
  it('builds a room record from origin/size/floor finish', () => {
    const r = room('h2-master', 'Master Bedroom', 0.2, 0.2, 3.1, 3.0, 'floor-wood-walnut')
    expect(r).toEqual({
      id: 'h2-master',
      name: 'Master Bedroom',
      origin: [0.2, 0.2],
      width: 3.1,
      depth: 3.0,
      floor: 'floor-wood-walnut',
    })
  })
})

describe('parapet', () => {
  it('builds an internal wall capped at the 1 m parapet height', () => {
    const p = parapet('h2-parapet', [0.1, 0.1], [3.0, 0.1])
    expect(p).toEqual({
      id: 'h2-parapet',
      start: [0.1, 0.1],
      end: [3.0, 0.1],
      thickness: 'internal',
      topHeight: 1.0,
    })
  })
})

describe('cat', () => {
  it('attaches the housing/project/apartment category to a plan, leaving the rest untouched', () => {
    const plan: FloorPlan = {
      id: 'p1',
      name: 'Test Plan',
      ceilingHeight: 2.6,
      extent: [4, 3],
      walls: [],
      openings: [],
      rooms: [],
    }
    const categorised = cat(plan, 'HDB', 'Serangoon North Vista', '4-Room')
    expect(categorised.category).toEqual({
      housingType: 'HDB',
      projectName: 'Serangoon North Vista',
      apartmentType: '4-Room',
    })
    // original fields preserved, original object not mutated
    expect(categorised.id).toBe('p1')
    expect(categorised.walls).toBe(plan.walls)
    expect(plan.category).toBeUndefined()
  })
})
