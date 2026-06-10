import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import { buildComplianceReport } from './hdbCompliance'

function wall(over: Partial<PlanWall> & Pick<PlanWall, 'id'>): PlanWall {
  return { start: [0, 0], end: [1, 0], thickness: 'internal', ...over }
}

function room(over: Partial<PlanRoom> & Pick<PlanRoom, 'id' | 'name'>): PlanRoom {
  return { origin: [0, 0], width: 2, depth: 2, ...over }
}

function plan(over: Partial<FloorPlan>): FloorPlan {
  return {
    id: 'p',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [10, 10],
    walls: [],
    openings: [],
    rooms: [],
    ...over,
  }
}

describe('buildComplianceReport', () => {
  it('flags a long external wall as a permit-severity structural advisory', () => {
    const report = buildComplianceReport(
      plan({ walls: [wall({ id: 'w1', start: [0, 0], end: [6, 0], thickness: 'external' })] }),
    )
    const structural = report.advisories.filter((a) => a.id.startsWith('structural-wall:'))
    expect(structural).toHaveLength(1)
    expect(structural[0].severity).toBe('permit')
    expect(structural[0].cite).toMatch(/HDB/)
    expect(report.permitCount).toBe(1)
  })

  it('flags a long internal wall as structural even when not external', () => {
    const report = buildComplianceReport(
      plan({ walls: [wall({ id: 'w1', start: [0, 0], end: [5, 0], thickness: 'internal' })] }),
    )
    expect(report.advisories.some((a) => a.id === 'structural-wall:w1')).toBe(true)
    expect(report.permitCount).toBe(1)
  })

  it('does not flag a short internal wall as structural', () => {
    const report = buildComplianceReport(
      plan({ walls: [wall({ id: 'w1', start: [0, 0], end: [2, 0], thickness: 'internal' })] }),
    )
    expect(report.advisories.some((a) => a.id.startsWith('structural-wall:'))).toBe(false)
    expect(report.permitCount).toBe(0)
  })

  it('yields a wet-area caution advisory for a Bathroom room', () => {
    const report = buildComplianceReport(plan({ rooms: [room({ id: 'r1', name: 'Bathroom' })] }))
    const wet = report.advisories.filter((a) => a.id.startsWith('wet-area:'))
    expect(wet).toHaveLength(1)
    expect(wet[0].severity).toBe('caution')
    expect(wet[0].roomId).toBe('r1')
    expect(report.cautionCount).toBe(1)
  })

  it('flags a kitchen wet area too', () => {
    const report = buildComplianceReport(plan({ rooms: [room({ id: 'k', name: 'Kitchen' })] }))
    expect(report.advisories.some((a) => a.id === 'wet-area:k')).toBe(true)
  })

  it('does not flag a dry room (Living) as a wet area', () => {
    const report = buildComplianceReport(plan({ rooms: [room({ id: 'l', name: 'Living' })] }))
    expect(report.advisories.some((a) => a.id.startsWith('wet-area:'))).toBe(false)
  })

  it('adds a facade-window caution for a window on an external wall', () => {
    const opening: PlanOpening = {
      id: 'o1',
      kind: 'window',
      wallId: 'w1',
      offset: 1,
      width: 1,
      sill: 1,
      head: 2,
    }
    const report = buildComplianceReport(
      plan({
        walls: [wall({ id: 'w1', thickness: 'external' })],
        openings: [opening],
      }),
    )
    expect(report.advisories.some((a) => a.id === 'facade-window:o1')).toBe(true)
  })

  it('adds a floor-loading info note for a large room', () => {
    const report = buildComplianceReport(
      plan({ rooms: [room({ id: 'big', name: 'Living', width: 5, depth: 5 })] }),
    )
    const loading = report.advisories.find((a) => a.id === 'floor-loading:big')
    expect(loading?.severity).toBe('info')
  })

  it('flags a non-standard ceiling height', () => {
    const report = buildComplianceReport(
      plan({ rooms: [room({ id: 'r', name: 'Study', ceilingHeight: 2.1 })] }),
    )
    expect(report.advisories.some((a) => a.id === 'ceiling-height:r')).toBe(true)
  })

  it('returns no advisories and does not throw for an empty plan', () => {
    const report = buildComplianceReport(plan({}))
    expect(report.advisories).toEqual([])
    expect(report.permitCount).toBe(0)
    expect(report.cautionCount).toBe(0)
  })

  it('tolerates a malformed plan with non-array fields', () => {
    const bad = {
      id: 'x',
      name: 'bad',
      ceilingHeight: 2.6,
      extent: [10, 10],
    } as unknown as FloorPlan
    expect(() => buildComplianceReport(bad)).not.toThrow()
    expect(buildComplianceReport(bad).advisories).toEqual([])
  })

  it('computes counts correctly across mixed advisories', () => {
    const report = buildComplianceReport(
      plan({
        walls: [wall({ id: 'w1', start: [0, 0], end: [6, 0], thickness: 'external' })],
        rooms: [room({ id: 'b', name: 'Bathroom' })],
      }),
    )
    const permit = report.advisories.filter((a) => a.severity === 'permit').length
    const caution = report.advisories.filter((a) => a.severity === 'caution').length
    expect(report.permitCount).toBe(permit)
    expect(report.cautionCount).toBe(caution)
    expect(report.permitCount).toBeGreaterThanOrEqual(1)
    expect(report.cautionCount).toBeGreaterThanOrEqual(1)
  })
})
