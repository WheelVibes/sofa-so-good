import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import type { FloorPlan } from '../floorplan/types'
import { reportPlanSvg } from './reportPlanSvg'

describe('reportPlanSvg', () => {
  it('draws walls + room labels for the default plan', () => {
    const svg = reportPlanSvg(buildDefaultPlan())
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('<line') // walls
    expect(svg).toContain('Living / Dining') // a room label
    expect(svg).toContain('viewBox=')
  })

  it('escapes room names', () => {
    const plan = buildDefaultPlan()
    plan.rooms[0] = { ...plan.rooms[0], name: '<b>x</b>' }
    const svg = reportPlanSvg(plan)
    expect(svg).not.toContain('<b>x</b>')
    expect(svg).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('returns empty for a degenerate plan (no extent)', () => {
    const empty: FloorPlan = {
      id: 'x',
      name: 'x',
      ceilingHeight: 2.6,
      extent: [0, 0],
      walls: [],
      openings: [],
      rooms: [],
    }
    expect(reportPlanSvg(empty)).toBe('')
  })
})
