import { describe, expect, it } from 'vitest'
import { assignOpeningMarks } from '../analysis/openingSchedule'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import type { FloorPlan } from '../floorplan/types'
import { reportPlanSvg, scaleBarChoice } from './reportPlanSvg'

describe('reportPlanSvg', () => {
  it('draws walls + room labels (name + area) for the default plan', () => {
    const svg = reportPlanSvg(buildDefaultPlan())
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('<line') // walls
    expect(svg).toContain('Living / Dining') // a room name label
    expect(svg).toMatch(/\d+(\.\d+)? m²/) // each room also labelled with its area
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

  it('draws door swing arcs + opening gaps over the walls', () => {
    const svg = reportPlanSvg(buildDefaultPlan())
    // The default flat has doors → at least one swing arc (path with an A command).
    expect(svg).toMatch(/<path d="M [\d.-]+ [\d.-]+ A /)
    // Openings cut the wall with a white mask line.
    expect(svg).toContain('stroke="#ffffff"')
    // Arcs/symbols draw after the walls so they sit on top of the gap.
    expect(svg.indexOf('<path')).toBeGreaterThan(svg.indexOf('<line'))
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

  it('renders free-text notes as amber callouts (PARITY-DIMTEXT on deliverables)', () => {
    const plan = buildDefaultPlan()
    const withNote = reportPlanSvg({ ...plan, notes: [{ id: 'n1', x: 3, z: 2, text: 'TV wall' }] })
    expect(withNote).toContain('TV wall')
    expect(withNote).toContain('#b45309') // the note ink + locator dot
    // No notes → no amber callout (clean default).
    expect(reportPlanSvg(plan)).not.toContain('#b45309')
  })

  it('escapes note text + skips blank notes', () => {
    const plan = buildDefaultPlan()
    const svg = reportPlanSvg({
      ...plan,
      notes: [
        { id: 'n1', x: 3, z: 2, text: '<b>x</b>' },
        { id: 'n2', x: 4, z: 2, text: '   ' },
      ],
    })
    expect(svg).not.toContain('<b>x</b>')
    expect(svg).toContain('&lt;b&gt;x&lt;/b&gt;')
    // Blank note contributes no extra dot (only one locator circle).
    expect(svg.match(/<circle/g)?.length ?? 0).toBe(1)
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

  it('draws tile setting-out crosses only when showTileMarks is true (G3)', () => {
    const plan = buildDefaultPlan()
    const withoutMarks = reportPlanSvg(plan, [], 'metric', [], undefined, false)
    expect(withoutMarks).not.toContain('Tile setting-out point')
    const withMarks = reportPlanSvg(plan, [], 'metric', [], undefined, true)
    expect(withMarks).toContain('Tile setting-out point — start laying here, verify joints on site')
  })

  it('draws D1/W1… opening mark callouts only when showOpeningMarks is true (H1-F)', () => {
    const plan = buildDefaultPlan()
    const without = reportPlanSvg(plan, [], 'metric', [], undefined, false, false)
    expect(without).not.toContain('>D1<')
    const withMarks = reportPlanSvg(plan, [], 'metric', [], undefined, false, true)
    expect(withMarks).toContain('>D1<')
    expect(withMarks).toContain('>W1<')
  })

  it("the on-plan marks are IDENTICAL to the door & window schedule's own assignment", () => {
    // Same plan, same `assignOpeningMarks` grouping run standalone — the
    // on-plan callouts must never drift from what the schedule sheet types.
    const plan = buildDefaultPlan()
    const expected = assignOpeningMarks(plan.openings)
    const svg = reportPlanSvg(plan, [], 'metric', [], undefined, false, true)
    for (const label of new Set(expected.values())) {
      expect(svg).toContain(`>${label}<`)
    }
    // And no OTHER mark labels appear (e.g. a stray "D3" from a differently-
    // keyed grouping would show up here).
    const distinctLabels = new Set(expected.values())
    const rendered = [...svg.matchAll(/font-weight="700" fill="#be123c"[^>]*>([DW]\d+)</g)].map(
      (m) => m[1],
    )
    expect(new Set(rendered)).toEqual(distinctLabels)
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
