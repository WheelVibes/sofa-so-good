import { describe, expect, it } from 'vitest'
import { buildPlumbingPlan, type PlumbingPoint } from './plumbingPlan'
import { plumbingSvg } from './plumbingPlanSvg'
import type { FloorPlan } from './types'

const plan = {
  id: 'p',
  name: 'P',
  ceilingHeight: 2.6,
  extent: [4, 3],
  walls: [
    { id: 'w1', start: [0, 0], end: [4, 0], thickness: 'external' },
    { id: 'w2', start: [4, 0], end: [4, 3], thickness: 'external' },
  ],
  openings: [],
  rooms: [],
} as unknown as FloorPlan

const palette = { wall: '#999', ink: '#333', symbol: '#0891b2' }

describe('plumbingSvg', () => {
  it('renders an svg with a symbol per point + a schedule legend', () => {
    const pts: PlumbingPoint[] = [
      { x: 1, z: 1, kind: 'water-point' },
      { x: 2, z: 1, kind: 'floor-trap' },
    ]
    const svg = plumbingSvg(plan, buildPlumbingPlan(plan, pts), { palette })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('data-kind="water-point"')
    expect(svg).toContain('data-kind="floor-trap"')
    expect(svg).toContain('Floor trap × 1')
  })

  it('XML-escapes free-text labels', () => {
    const svg = plumbingSvg(
      plan,
      buildPlumbingPlan(plan, [{ x: 1, z: 1, kind: 'soil-pipe', label: '<WC> & "main"' }]),
      { palette },
    )
    expect(svg).toContain('&lt;WC&gt; &amp; &quot;main&quot;')
    expect(svg).not.toContain('<WC>')
  })

  it('renders an "@mm" mount-height suffix + a legend line when a point carries one (MEP layer, G1 PR5)', () => {
    const svg = plumbingSvg(
      plan,
      buildPlumbingPlan(plan, [{ x: 1, z: 1, kind: 'water-point', mountHeightMm: 600 }]),
      { palette },
    )
    expect(svg).toContain('@600')
    expect(svg).toContain('Heights in mm AFFL')
  })

  it('omits the height legend line when no point carries a mount height', () => {
    const svg = plumbingSvg(plan, buildPlumbingPlan(plan, [{ x: 1, z: 1, kind: 'water-point' }]), {
      palette,
    })
    expect(svg).not.toContain('Heights in mm AFFL')
    expect(svg).not.toMatch(/@\d/)
  })

  it('shows an empty-state legend when there are no points', () => {
    const svg = plumbingSvg(plan, buildPlumbingPlan(plan, []), { palette })
    expect(svg).toContain('No plumbing points')
  })

  it('does not throw on a malformed plan (non-array walls)', () => {
    const bad = { walls: null } as unknown as FloorPlan
    expect(() => plumbingSvg(bad, buildPlumbingPlan(bad, []), { palette })).not.toThrow()
  })
})
