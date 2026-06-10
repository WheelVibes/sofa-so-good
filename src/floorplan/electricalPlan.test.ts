import { describe, expect, it } from 'vitest'
import {
  buildElectricalPlan,
  type ElectricalKind,
  type ElectricalPoint,
  electricalKindLabel,
} from './electricalPlan'
import type { FloorPlan } from './types'

function plan(walls: FloorPlan['walls'] = []): FloorPlan {
  return {
    id: 'p',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [4, 4],
    walls,
    openings: [],
    rooms: [],
  }
}

const box: FloorPlan['walls'] = [
  { id: 'a', start: [0, 0], end: [4, 0], thickness: 'external' },
  { id: 'b', start: [4, 0], end: [4, 4], thickness: 'external' },
  { id: 'c', start: [4, 4], end: [0, 4], thickness: 'external' },
  { id: 'd', start: [0, 4], end: [0, 0], thickness: 'external' },
]

describe('buildElectricalPlan', () => {
  it('counts and labels each kind in the schedule', () => {
    const points: ElectricalPoint[] = [
      { x: 0.2, z: 0.2, kind: 'socket' },
      { x: 1, z: 0.2, kind: 'socket' },
      { x: 2, z: 0.2, kind: 'socket-double' },
      { x: 0.2, z: 2, kind: 'switch' },
      { x: 3, z: 1, kind: 'data' },
      { x: 3, z: 2, kind: 'tv-point' },
      { x: 3.8, z: 0.2, kind: 'aircon' },
      { x: 1, z: 3.8, kind: 'water-heater' },
    ]
    const out = buildElectricalPlan(plan(box), points)

    const bySchedKind = Object.fromEntries(out.schedule.map((r) => [r.kind, r]))
    expect(bySchedKind.socket.count).toBe(2)
    expect(bySchedKind.socket.label).toBe('Single socket outlet')
    expect(bySchedKind['socket-double'].count).toBe(1)
    expect(bySchedKind['socket-double'].label).toBe('Double socket outlet')
    expect(bySchedKind.switch.count).toBe(1)
    expect(bySchedKind.data.count).toBe(1)
    expect(bySchedKind['tv-point'].count).toBe(1)
    expect(bySchedKind.aircon.count).toBe(1)
    expect(bySchedKind['water-heater'].count).toBe(1)

    // Every schedule row carries a non-empty friendly label.
    for (const r of out.schedule) expect(r.label.length).toBeGreaterThan(0)
    // Total points preserved.
    expect(out.points).toHaveLength(8)
  })

  it('empty points → empty schedule, no throw', () => {
    const out = buildElectricalPlan(plan(box), [])
    expect(out.points).toEqual([])
    expect(out.schedule).toEqual([])
  })

  it('tolerates a non-array points argument', () => {
    const out = buildElectricalPlan(plan(box), undefined as unknown as ElectricalPoint[])
    expect(out.points).toEqual([])
    expect(out.schedule).toEqual([])
  })

  it('tolerates a malformed / empty plan', () => {
    const out = buildElectricalPlan(plan(), [{ x: 1, z: 1, kind: 'socket' }])
    expect(out.points).toHaveLength(1)
    expect(out.schedule).toHaveLength(1)
    const bad = buildElectricalPlan({ walls: null } as unknown as FloorPlan, [
      { x: 1, z: 1, kind: 'data' },
    ])
    expect(bad.points).toHaveLength(1)
  })

  it('drops unknown kinds and clamps non-finite coordinates', () => {
    const out = buildElectricalPlan(plan(box), [
      { x: Number.NaN, z: Infinity, kind: 'socket' },
      { x: 1, z: 1, kind: 'plug' as ElectricalKind },
    ])
    expect(out.points).toHaveLength(1)
    expect(out.points[0]).toMatchObject({ x: 0, z: 0, kind: 'socket' })
  })

  it('keeps points outside the plan', () => {
    const out = buildElectricalPlan(plan(box), [{ x: 100, z: -50, kind: 'switch' }])
    expect(out.points).toHaveLength(1)
    expect(out.points[0]).toMatchObject({ x: 100, z: -50 })
  })

  it('preserves labels and exposes friendly kind labels', () => {
    const out = buildElectricalPlan(plan(box), [{ x: 1, z: 1, kind: 'socket', label: 'fridge' }])
    expect(out.points[0].label).toBe('fridge')
    expect(electricalKindLabel('tv-point')).toBe('TV point')
  })
})
