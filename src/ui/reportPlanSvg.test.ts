import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import type { FloorPlan } from '../floorplan/types'
import { reportPlanSvg, scaleBarChoice } from './reportPlanSvg'

describe('reportPlanSvg', () => {
  it('draws walls + room labels for the default plan', () => {
    const svg = reportPlanSvg(buildDefaultPlan())
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('<line') // walls
    expect(svg).toContain('Living / Dining') // a room label
    expect(svg).toContain('viewBox=')
  })

  it('draws furniture footprints as polygons (under the walls)', () => {
    const plain = reportPlanSvg(buildDefaultPlan())
    expect(plain).not.toContain('<polygon')
    const withFurniture = reportPlanSvg(buildDefaultPlan(), [], 'metric', [
      {
        corners: [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
        ],
        fill: '#3b82f6',
      },
    ])
    expect(withFurniture).toContain('<polygon')
    expect(withFurniture).toContain('#3b82f6') // category tint
    // Footprint is drawn before the walls so the structure overlays it.
    expect(withFurniture.indexOf('<polygon')).toBeLessThan(withFurniture.indexOf('<line'))
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

  it('draws a scale bar with a metric label', () => {
    const svg = reportPlanSvg(buildDefaultPlan())
    // Default HDB ~10 m wide → quarter ≈ 2.5 m → "2 m" bar.
    expect(svg).toContain('2 m')
  })

  it('uses a feet label in imperial', () => {
    const svg = reportPlanSvg(buildDefaultPlan(), [], 'imperial')
    expect(svg).toMatch(/\d+ ft/)
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

describe('scaleBarChoice', () => {
  it('picks a nice metric length ~quarter of the width', () => {
    expect(scaleBarChoice(10, 'metric')).toEqual({ meters: 2, label: '2 m' })
    expect(scaleBarChoice(24, 'metric')).toEqual({ meters: 5, label: '5 m' })
  })

  it('labels sub-metre bars in cm', () => {
    expect(scaleBarChoice(1.5, 'metric')).toEqual({ meters: 0.5, label: '50 cm' })
  })

  it('picks round feet at their true metre length in imperial', () => {
    const c = scaleBarChoice(10, 'imperial')
    expect(c.label).toBe('5 ft')
    expect(c.meters).toBeCloseTo(5 * 0.3048)
  })

  it('never returns below the minimum for a tiny plan', () => {
    expect(scaleBarChoice(0.2, 'metric')).toEqual({ meters: 0.5, label: '50 cm' })
    expect(scaleBarChoice(0.2, 'imperial').label).toBe('1 ft')
  })
})
