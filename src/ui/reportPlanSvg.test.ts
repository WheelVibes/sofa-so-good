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

  it('draws pinned annotations (line + rect) with dimension labels', () => {
    const svg = reportPlanSvg(
      buildDefaultPlan(),
      [
        { id: 'a', a: [1, 1], b: [4, 1], shape: 'line' },
        { id: 'b', a: [2, 2], b: [5, 5], shape: 'rect' },
      ],
      'metric',
    )
    expect(svg).toContain('stroke-dasharray') // annotation line/rect styling
    expect(svg).toContain('3.00 m') // line length label
    expect(svg).toMatch(/9(\.0)? m²/) // rect area label (3×3)
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
