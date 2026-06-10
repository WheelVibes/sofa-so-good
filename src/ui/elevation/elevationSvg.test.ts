import { describe, expect, it } from 'vitest'
import type { WallElevation } from '../../elevation/projectElevation'
import { type ElevationPalette, elevationCaption, elevationSvg } from './elevationSvg'

const palette: ElevationPalette = {
  bg: '#fff',
  stroke: '#222',
  opening: '#9cf',
  item: '#cba',
  text: '#111',
}

const el: WallElevation = {
  wallId: 'w1',
  length: 4,
  height: 2.8,
  openings: [{ kind: 'window', x0: 1, x1: 2.2, sill: 0.9, head: 2.1 }],
  items: [{ id: 'a', label: 'Cabinet', x0: 1.5, x1: 2.5, height: 2, depth: 0 }],
}

describe('elevationSvg', () => {
  it('emits an svg sized to the wall with a floor-anchored item + window pane', () => {
    const svg = elevationSvg(el, { palette, dimensions: false })
    expect(svg.startsWith('<svg')).toBe(true)
    // viewBox spans the wall plus margins (4 + 2·0.35 = 4.700).
    expect(svg).toContain('viewBox="-0.350 -0.350 4.700 3.500"')
    // The wall panel rect.
    expect(svg).toContain('width="4.000" height="2.800"')
    // Item rect: 1m wide, top at worldY 2 → svgY = 2.8 − 2 = 0.800.
    expect(svg).toContain('width="1.000" height="2.000"')
    expect(svg).toContain('y="0.800"')
    expect(svg).toContain('>Cabinet</text>')
  })

  it('draws dimensions (overall width/height + window sill height) when enabled', () => {
    const svg = elevationSvg(el, { palette, units: 'metric', dimensions: true })
    // Overall width + height labels.
    expect(svg).toContain('>4.00 m</text>')
    expect(svg).toContain('>2.80 m</text>')
    // The window sill (0.9 m) is dimensioned.
    expect(svg).toContain('>0.90 m</text>')
    // Extra left/bottom padding is reserved for the dim lines.
    expect(svg).toContain('viewBox="-0.950 -0.350 5.300 4.100"')
  })

  it('escapes a malicious item label (no markup injection)', () => {
    const evil: WallElevation = {
      ...el,
      items: [{ id: 'x', label: '<script>bad</script>', x0: 1, x1: 3, height: 1, depth: 0 }],
    }
    const svg = elevationSvg(evil, { palette })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })

  it('omits labels when disabled or too narrow', () => {
    const svg = elevationSvg(el, { palette, labels: false, dimensions: false })
    expect(svg).not.toContain('<text')
  })

  it('returns a benign empty svg for a degenerate wall', () => {
    expect(elevationSvg({ ...el, length: 0 }, { palette })).toContain('empty elevation')
  })
})

describe('elevationCaption', () => {
  it('summarises dimensions + openings + item count', () => {
    expect(elevationCaption(el, 0, 'metric')).toBe('Wall 1 · 4.00 m × 2.80 m · 1 window · 1 item')
  })
  it('omits empty parts', () => {
    const bare: WallElevation = { wallId: 'w', length: 3, height: 2.4, openings: [], items: [] }
    expect(elevationCaption(bare, 2, 'metric')).toBe('Wall 3 · 3.00 m × 2.40 m')
  })
})
