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
  it('draws a door as a framed leaf with a handle + a conventional swing triangle (not the plan arc)', () => {
    const withDoor: WallElevation = {
      ...el,
      openings: [{ kind: 'door', x0: 0.5, x1: 1.4, sill: 0, head: 2.05, style: 'panel' }],
      items: [],
    }
    const svg = elevationSvg(withDoor, { palette, dimensions: false })
    // No legacy dashed cut-out; has a handle dot (a small filled circle).
    expect(svg).not.toMatch(/<rect[^>]*stroke-dasharray/)
    // Swing shown as the ELEVATION triangle marker, dashed — NOT the plan
    // quarter-arc (no ' A ' arc command any more, re-review P3).
    expect(svg).toMatch(
      /<path[^>]*data-swing="1"[^>]*stroke-dasharray|<path[^>]*stroke-dasharray[^>]*data-swing="1"/,
    )
    expect(svg).not.toContain(' A ') // plan quarter-arc removed
    expect(svg).toContain('<circle')
    // The door panel rect spans the opening (0.9 wide).
    expect(svg).toContain('width="0.900"')
  })

  it('draws the swing marker for a swinging (panel) door but NOT for a sliding door', () => {
    const base: WallElevation = { ...el, items: [] }
    const panel = elevationSvg(
      {
        ...base,
        openings: [{ kind: 'door', x0: 0.5, x1: 1.4, sill: 0, head: 2.05, style: 'panel' }],
      },
      { palette, dimensions: false },
    )
    const sliding = elevationSvg(
      {
        ...base,
        openings: [{ kind: 'door', x0: 0.5, x1: 1.4, sill: 0, head: 2.05, style: 'sliding' }],
      },
      { palette, dimensions: false },
    )
    expect(panel).toContain('data-swing="1"')
    expect(sliding).not.toContain('data-swing="1"')
    // Both still draw the leaf panel (0.9 wide) — only the swing symbol differs.
    expect(sliding).toContain('width="0.900"')
  })

  it('draws two swing triangles for a double door (apex at each jamb)', () => {
    const dbl = elevationSvg(
      {
        ...el,
        items: [],
        openings: [{ kind: 'door', x0: 0.5, x1: 2.1, sill: 0, head: 2.05, style: 'double' }],
      },
      { palette, dimensions: false },
    )
    expect(dbl.match(/data-swing="1"/g)?.length).toBe(2)
  })

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
    // The 1 m-wide item carries a per-item width dimension.
    expect(svg).toContain('>1.00 m</text>')
    // Extra left/bottom padding is reserved for the dim lines.
    expect(svg).toContain('viewBox="-0.950 -0.350 5.300 4.100"')
  })

  it('annotates a mounted TV with its AFFL mount height (H3)', () => {
    const withTv: WallElevation = {
      ...el,
      items: [{ id: 'tv', label: 'TV', x0: 1.5, x1: 2.7, height: 0.7, depth: 0, mountHeight: 1.1 }],
    }
    const svg = elevationSvg(withTv, { palette, units: 'metric', dimensions: true })
    expect(svg).toContain('1100 AFFL')
  })

  it('annotates a mounted sconce with its own mount height', () => {
    const withSconce: WallElevation = {
      ...el,
      items: [
        { id: 'sc', label: 'Sconce', x0: 3.0, x1: 3.2, height: 0.3, depth: 0, mountHeight: 1.45 },
      ],
    }
    const svg = elevationSvg(withSconce, { palette, units: 'metric', dimensions: true })
    expect(svg).toContain('1450 AFFL')
  })

  it('does not annotate a floor-standing item (no mountHeight — no clutter)', () => {
    const floorSofa: WallElevation = {
      ...el,
      items: [{ id: 'sofa', label: 'Sofa', x0: 0.5, x1: 2.5, height: 0.85, depth: 0 }],
    }
    const svg = elevationSvg(floorSofa, { palette, units: 'metric', dimensions: true })
    expect(svg).not.toMatch(/AFFL/)
  })

  it('declutters two mounted items sharing a wall closely (both heights still legible)', () => {
    const twoMounted: WallElevation = {
      ...el,
      items: [
        { id: 'a', label: 'TV', x0: 1.0, x1: 2.2, height: 0.7, depth: 0, mountHeight: 1.1 },
        {
          id: 'b',
          label: 'Soundbar',
          x0: 1.05,
          x1: 1.95,
          height: 0.1,
          depth: 0,
          mountHeight: 1.05,
        },
      ],
    }
    const svg = elevationSvg(twoMounted, { palette, units: 'metric', dimensions: true })
    // Both AFFL heights are present in the markup — neither dim was dropped.
    expect(svg).toContain('1100 AFFL')
    expect(svg).toContain('1050 AFFL')
    // Two distinct <line> x1 anchors for the colliding pair (fanned to
    // different columns) rather than both drawn at the identical x.
    const dimLineXs = [...svg.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1"/g)].map((m) => m[1])
    expect(new Set(dimLineXs).size).toBeGreaterThan(1)
  })

  it('renders an item semi-transparent when it substantially overlaps an opening (legacy overlap defense)', () => {
    // A door opening spans floor to head (x=[0.5,1.4], sill=0, head=2.05) — a
    // floor-standing item (drawn floor→height, same as the door) whose box
    // sits almost entirely inside it is a corrupt/legacy placement (it now
    // stands astride a door it predates) and must render semi-transparent so
    // the door leaf/swing stays readable through it.
    const overlapping: WallElevation = {
      ...el,
      openings: [{ kind: 'door', x0: 0.5, x1: 1.4, sill: 0, head: 2.05 }],
      items: [{ id: 'x', label: 'Shelf', x0: 0.6, x1: 1.3, height: 1.9, depth: 0 }],
    }
    const svg = elevationSvg(overlapping, { palette, dimensions: false })
    expect(svg).toContain('fill-opacity="0.3"')
    expect(svg).not.toContain('fill-opacity="0.85"')
  })

  it('keeps a normal, non-overlapping item at full opacity', () => {
    const svg = elevationSvg(el, { palette, dimensions: false })
    expect(svg).toContain('fill-opacity="0.85"')
    expect(svg).not.toContain('fill-opacity="0.3"')
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
