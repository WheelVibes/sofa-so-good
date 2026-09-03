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

/**
 * **The emptiness GATE was ground-floor only (v0.31.8.13).** The rules were
 * already F13-correct — `buildComplianceReport` flattens every storey through
 * `allPlanWalls`/`allPlanOpenings`/`allPlanRooms` before running them — but the
 * `isNonEmptyPlan` check in front of them tested the raw plan, i.e. the ground
 * storey. A home whose ground floor was cleared but whose upper storeys were not
 * read as empty, and the whole compliance section was silently skipped.
 *
 * That is the more dangerous half of the F13 invariant: a wrong rule reports
 * something wrong, a wrong gate reports nothing at all.
 */
describe('buildComplianceReport — multi-storey emptiness gate', () => {
  /** Ground floor deliberately empty; an upper storey carries a wet area whose
   *  waterproofing rule must still fire. */
  const upperOnly = () =>
    plan({
      walls: [],
      openings: [],
      rooms: [],
      upperLevels: [
        {
          id: 'l2',
          name: 'Second storey',
          elevation: 2.9,
          walls: [wall({ id: 'u-w1', thickness: 'external' })],
          openings: [],
          rooms: [room({ id: 'u-bath', name: 'Bath / WC 2' })],
        },
      ],
    } as Partial<FloorPlan>)

  it('assesses an upper storey when the ground floor is empty', () => {
    const report = buildComplianceReport(upperOnly())
    expect(report.advisories.length).toBeGreaterThan(0)
  })

  it('still reports nothing for a genuinely empty plan', () => {
    // The gate must keep doing its job: this is what stops an unstarted design
    // producing a page of advisories.
    const report = buildComplianceReport(plan({}))
    expect(report.advisories).toEqual([])
  })
})
