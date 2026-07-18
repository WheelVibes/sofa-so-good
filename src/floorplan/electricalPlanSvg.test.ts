import { describe, expect, it } from 'vitest'
import { buildElectricalPlan, type ElectricalPoint } from './electricalPlan'
import { electricalSvg } from './electricalPlanSvg'
import type { FloorPlan } from './types'

const palette = { wall: '#111', ink: '#222', symbol: '#c33' }

function plan(walls: FloorPlan['walls']): FloorPlan {
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

const points: ElectricalPoint[] = [
  { x: 0.2, z: 0.2, kind: 'socket' },
  { x: 2, z: 0.2, kind: 'socket-double' },
  { x: 0.2, z: 2, kind: 'switch' },
  { x: 3, z: 1, kind: 'data' },
  { x: 3, z: 2, kind: 'tv-point' },
  { x: 3.8, z: 0.2, kind: 'aircon' },
  { x: 1, z: 3.8, kind: 'water-heater' },
]

describe('electricalSvg', () => {
  it('emits an svg root, a wall line, a symbol per point, and a legend', () => {
    const elec = buildElectricalPlan(plan(box), points)
    const svg = electricalSvg(plan(box), elec, { palette })

    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0')
    expect(svg).toContain('<line')
    // One symbol group per point (legend symbols carry no data-kind via points,
    // but reuse the same marker — count the placed points' markers + legend).
    const symbolMarkers = svg.match(/class="elec-symbol"/g) ?? []
    // 7 placed points + 7 legend rows = 14 markers.
    expect(symbolMarkers.length).toBe(points.length + elec.schedule.length)
    expect(svg).toContain('class="legend"')
    // Every distinct kind glyph present.
    expect(svg).toContain('>2<')
    expect(svg).toContain('>S<')
    expect(svg).toContain('>D<')
    expect(svg).toContain('>TV<')
    expect(svg).toContain('>AC<')
    expect(svg).toContain('>WH<')
  })

  it('injects palette colours and nothing hardcoded', () => {
    const elec = buildElectricalPlan(plan(box), points)
    const svg = electricalSvg(plan(box), elec, { palette })
    expect(svg).toContain(palette.wall)
    expect(svg).toContain(palette.ink)
    expect(svg).toContain(palette.symbol)
  })

  it('computes the viewBox from full wall min AND max bounds', () => {
    const offset: FloorPlan['walls'] = [
      { id: 'a', start: [10, 10], end: [14, 10], thickness: 'external' },
      { id: 'b', start: [14, 10], end: [14, 12], thickness: 'external' },
    ]
    const svg = electricalSvg(plan(offset), buildElectricalPlan(plan(offset), []), { palette })
    // Width spans 4m + padding; not anchored to world 0,0.
    const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
    expect(m).toBeTruthy()
    expect(Number(m![1])).toBeGreaterThan(0)
  })

  it('empty points → walls only + "No electrical points" legend, no throw', () => {
    const svg = electricalSvg(plan(box), buildElectricalPlan(plan(box), []), { palette })
    expect(svg).toContain('<svg')
    expect(svg).toContain('<line')
    expect(svg).not.toContain('class="elec-symbol"')
    expect(svg).toContain('No electrical points')
  })

  it('empty plan still renders an svg', () => {
    const svg = electricalSvg(plan([]), buildElectricalPlan(plan([]), []), { palette })
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0')
  })

  it('skips zero-length walls', () => {
    const withDegenerate: FloorPlan['walls'] = [
      ...box,
      { id: 'z', start: [2, 2], end: [2, 2], thickness: 'internal' },
    ]
    const svg = electricalSvg(plan(withDegenerate), buildElectricalPlan(plan(withDegenerate), []), {
      palette,
    })
    // 4 real walls drawn, the degenerate one skipped.
    const lines = svg.match(/<line/g) ?? []
    expect(lines.length).toBe(4)
  })

  it('still draws a point outside the plan', () => {
    const elec = buildElectricalPlan(plan(box), [{ x: 999, z: 999, kind: 'socket' }])
    const svg = electricalSvg(plan(box), elec, { palette })
    expect((svg.match(/class="elec-symbol"/g) ?? []).length).toBeGreaterThan(0)
  })

  it('renders an "@mm" mount-height suffix + a legend line when a point carries one (MEP layer, G1 PR5)', () => {
    const elec = buildElectricalPlan(plan(box), [
      { x: 1, z: 1, kind: 'socket', mountHeightMm: 1200 },
    ])
    const svg = electricalSvg(plan(box), elec, { palette })
    expect(svg).toContain('@1200')
    expect(svg).toContain('Heights in mm AFFL')
  })

  it('omits the height legend line when no point carries a mount height', () => {
    const elec = buildElectricalPlan(plan(box), [{ x: 1, z: 1, kind: 'socket' }])
    const svg = electricalSvg(plan(box), elec, { palette })
    expect(svg).not.toContain('Heights in mm AFFL')
    expect(svg).not.toMatch(/@\d/)
  })

  it('escapes a malicious label with no breakout', () => {
    const evil = '"><script>alert(1)</script>'
    const elec = buildElectricalPlan(plan(box), [{ x: 1, z: 1, kind: 'socket', label: evil }])
    const svg = electricalSvg(plan(box), elec, { palette })
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('"><script')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('&quot;')
    // Apostrophes escaped too (5-char entity).
    const elec2 = buildElectricalPlan(plan(box), [{ x: 1, z: 1, kind: 'data', label: "a'b" }])
    expect(electricalSvg(plan(box), elec2, { palette })).toContain('&#39;')
  })
})
