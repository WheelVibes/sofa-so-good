import { describe, expect, it } from 'vitest'
import type { Section } from './section'
import { sectionSvg } from './sectionSvg'

const PALETTE = {
  wall: '#5a4632',
  floor: '#8a8a8a',
  ceil: '#bcbcbc',
  opening: '#2244ff',
  ink: '#101010',
}

/** A simple section: two cut walls flanking one room, with a window gap. */
function sampleSection(): Section {
  return {
    axis: 'x',
    at: 3,
    length: 4,
    height: 2.8,
    floorY: 0,
    walls: [
      { pos: 0, thickness: 0.2, base: 0, top: 2.8, cut: true },
      { pos: 4, thickness: 0.2, base: 0, top: 2.8, cut: true },
    ],
    openings: [{ pos: 4, width: 2, sill: 0.9, head: 2.1, kind: 'window' }],
    rooms: [{ name: 'Living', start: 0, end: 4, base: 0 }],
    items: [{ id: 'sofa', label: 'Sofa', start: 1, end: 3, height: 0.8, base: 0 }],
    ceil: [{ start: 0, end: 4, y: 2.8 }],
  }
}

describe('sectionSvg', () => {
  it('emits an <svg> with a viewBox', () => {
    const svg = sectionSvg(sampleSection(), { palette: PALETTE })
    expect(svg).toContain('<svg')
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/)
    expect(svg.trim().endsWith('</svg>')).toBe(true)
  })

  it('draws a rect per cut wall', () => {
    const svg = sectionSvg(sampleSection(), { palette: PALETTE })
    // 2 wall rects + 1 opening rect + 1 furniture silhouette = 4 rects.
    expect((svg.match(/<rect /g) ?? []).length).toBe(4)
    expect(svg).toContain('class="walls"')
  })

  it('draws furniture silhouettes (in the cut room band) behind the cut', () => {
    const svg = sectionSvg(sampleSection(), { palette: PALETTE })
    expect(svg).toContain('class="items"')
    expect(svg).toContain('Sofa')
    // The silhouette group is emitted before the walls group (painted behind).
    expect(svg.indexOf('class="items"')).toBeLessThan(svg.indexOf('class="walls"'))
  })

  it('draws floor and ceiling lines', () => {
    const svg = sectionSvg(sampleSection(), { palette: PALETTE })
    expect(svg).toContain('class="floor"')
    expect(svg).toContain('class="ceiling"')
    // At least the main floor line + a ceiling run.
    expect((svg.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('renders the opening gap and room label + height dimension', () => {
    const svg = sectionSvg(sampleSection(), { palette: PALETTE })
    expect(svg).toContain('class="openings"')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('Living')
    expect(svg).toContain('class="dimension"')
    expect(svg).toContain('2.8 m')
  })

  it('injects all palette colours and no stray colours', () => {
    const svg = sectionSvg(sampleSection(), { palette: PALETTE })
    expect(svg).toContain(PALETTE.wall)
    expect(svg).toContain(PALETTE.floor)
    expect(svg).toContain(PALETTE.ceil)
    expect(svg).toContain(PALETTE.opening)
    expect(svg).toContain(PALETTE.ink)
    const hexes = new Set(svg.match(/#[0-9a-fA-F]{3,6}/g) ?? [])
    for (const h of hexes) {
      expect(Object.values(PALETTE)).toContain(h)
    }
  })

  it('honours a custom widthPx', () => {
    const svg = sectionSvg(sampleSection(), { palette: PALETTE, widthPx: 1200 })
    expect(svg).toContain('width="1200"')
  })

  it('collapses two adjacent identical labels into one "Label ×2" instead of concatenating', () => {
    const twoChairs: Section = {
      ...sampleSection(),
      items: [
        { id: 'chair-1', label: 'Dining chair', start: 1, end: 1.4, height: 0.9, base: 0 },
        { id: 'chair-2', label: 'Dining chair', start: 1.4, end: 1.8, height: 0.9, base: 0 },
      ],
    }
    const svg = sectionSvg(twoChairs, { palette: PALETTE })
    // Both silhouette rects are still drawn (2 walls + 1 opening + 2 items).
    expect((svg.match(/<rect /g) ?? []).length).toBe(5)
    // Only ONE merged text node for the pair — never the raw concatenation.
    expect((svg.match(/<text[^>]*>Dining chair/g) ?? []).length).toBe(1)
    expect(svg).toContain('Dining chair ×2')
    expect(svg).not.toContain('Dining chairDining chair')
  })

  it('handles an empty section without throwing', () => {
    const empty: Section = {
      axis: 'x',
      at: 0,
      length: 0,
      height: 0,
      floorY: 0,
      walls: [],
      openings: [],
      rooms: [],
      items: [],
      ceil: [],
    }
    const svg = sectionSvg(empty, { palette: PALETTE })
    expect(svg).toContain('<svg')
    // No wall/opening rects.
    expect((svg.match(/<rect /g) ?? []).length).toBe(0)
    // Falls back to a single ceiling line when there are no ceiling runs.
    expect(svg).toContain('class="ceiling"')
  })
})
