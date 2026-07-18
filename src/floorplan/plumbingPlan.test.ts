import { describe, expect, it } from 'vitest'
import { buildPlumbingPlan, type PlumbingPoint, plumbingKindLabel } from './plumbingPlan'
import type { FloorPlan } from './types'

const plan = {
  id: 'p',
  name: 'P',
  ceilingHeight: 2.6,
  extent: [4, 4],
  walls: [],
  openings: [],
  rooms: [],
} as unknown as FloorPlan

describe('buildPlumbingPlan', () => {
  it('validates points, drops unknown kinds, clamps non-finite coords', () => {
    const raw = [
      { x: 1, z: 1, kind: 'water-point' },
      { x: Number.NaN, z: 2, kind: 'drainage' },
      { x: 3, z: 3, kind: 'bogus' },
      null,
      'nope',
    ] as unknown as PlumbingPoint[]
    const out = buildPlumbingPlan(plan, raw)
    expect(out.points).toHaveLength(2)
    expect(out.points[1]).toMatchObject({ x: 0, z: 2, kind: 'drainage' })
  })

  it('groups a per-kind schedule in stable order', () => {
    const pts: PlumbingPoint[] = [
      { x: 0, z: 0, kind: 'drainage' },
      { x: 1, z: 0, kind: 'water-point' },
      { x: 2, z: 0, kind: 'water-point' },
      { x: 3, z: 0, kind: 'floor-trap' },
    ]
    const { schedule } = buildPlumbingPlan(plan, pts)
    expect(schedule.map((r) => [r.kind, r.count])).toEqual([
      ['water-point', 2],
      ['drainage', 1],
      ['floor-trap', 1],
    ])
  })

  it('tolerates non-array points', () => {
    expect(buildPlumbingPlan(plan, undefined as unknown as PlumbingPoint[]).points).toEqual([])
  })

  it('keeps optional label + levelId only when valid', () => {
    const out = buildPlumbingPlan(plan, [
      { x: 0, z: 0, kind: 'soil-pipe', label: 'WC', levelId: 'lvl-2' },
      { x: 1, z: 1, kind: 'water-point', label: '' },
    ] as PlumbingPoint[])
    expect(out.points[0]).toMatchObject({ label: 'WC', levelId: 'lvl-2' })
    expect(out.points[1].label).toBeUndefined()
  })

  it('labels every kind', () => {
    expect(plumbingKindLabel('floor-trap')).toMatch(/trap/i)
    expect(plumbingKindLabel('soil-pipe')).toMatch(/soil/i)
  })

  it('carries a persisted mountHeightMm through the clean-copy build loop (MEP layer, G1 PR5)', () => {
    const out = buildPlumbingPlan(plan, [
      { x: 0, z: 0, kind: 'water-point', mountHeightMm: 600 },
      { x: 1, z: 1, kind: 'floor-trap' },
    ] as PlumbingPoint[])
    expect(out.points[0].mountHeightMm).toBe(600)
    expect(out.points[1].mountHeightMm).toBeUndefined()
  })
})
