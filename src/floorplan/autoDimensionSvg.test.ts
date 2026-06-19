import { describe, expect, it } from 'vitest'
import { buildDimensions } from './autoDimension'
import { dimensionSvg } from './autoDimensionSvg'
import type { FloorPlan } from './types'

function rectPlan(): FloorPlan {
  return {
    id: 'p1',
    name: 'rect',
    ceilingHeight: 2.8,
    extent: [5, 4],
    walls: [
      { id: 'n', start: [0, 0], end: [5, 0], thickness: 'external' },
      { id: 'e', start: [5, 0], end: [5, 4], thickness: 'external' },
      { id: 's', start: [5, 4], end: [0, 4], thickness: 'external' },
      { id: 'w', start: [0, 4], end: [0, 0], thickness: 'external' },
    ],
    openings: [],
    rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 5, depth: 4 }],
  }
}

const palette = { ink: '#123456', faint: '#abcdef' }

describe('dimensionSvg', () => {
  it('emits a well-formed SVG document', () => {
    const svg = dimensionSvg(rectPlan(), { palette })
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('draws a line element per dimension (plus walls and ticks)', () => {
    const plan = rectPlan()
    const dims = buildDimensions(plan)
    const totalDims = dims.overall.length + dims.rooms.length
    const svg = dimensionSvg(plan, { palette })
    const lineCount = (svg.match(/<line/g) ?? []).length
    // Each dimension contributes 1 main line + 2 ticks; plus one line per wall.
    expect(lineCount).toBe(totalDims * 3 + plan.walls.length)
    expect(lineCount).toBeGreaterThanOrEqual(totalDims)
  })

  it('renders a label text element per dimension', () => {
    const plan = rectPlan()
    const dims = buildDimensions(plan)
    const svg = dimensionSvg(plan, { palette })
    const textCount = (svg.match(/<text/g) ?? []).length
    expect(textCount).toBe(dims.overall.length + dims.rooms.length)
    expect(svg).toContain('5.00 m')
    expect(svg).toContain('4.00 m')
  })

  it('renders imperial labels when units=imperial', () => {
    const svg = dimensionSvg(rectPlan(), { palette, units: 'imperial' })
    // 5 m ≈ 16′ 5″ and 4 m ≈ 13′ 1″ — should appear; metre labels should not
    expect(svg).not.toContain('5.00 m')
    expect(svg).not.toContain('4.00 m')
    // Unicode primes (′ U+2032, ″ U+2033) are not escaped by the SVG esc helper
    expect(svg).toContain('16′ 5″')
  })

  it('injects the palette colours and hardcodes none', () => {
    const svg = dimensionSvg(rectPlan(), { palette })
    expect(svg).toContain('#123456')
    expect(svg).toContain('#abcdef')
    // The colours come from the palette, not a baked-in default.
    const other = dimensionSvg(rectPlan(), { palette: { ink: '#000111', faint: '#222333' } })
    expect(other).toContain('#000111')
    expect(other).toContain('#222333')
    expect(other).not.toContain('#123456')
  })

  it('respects an explicit widthPx', () => {
    const svg = dimensionSvg(rectPlan(), { palette, widthPx: 640 })
    expect(svg).toContain('width="640"')
  })

  it('does not throw on an empty plan', () => {
    const empty: FloorPlan = {
      id: 'e',
      name: 'empty',
      ceilingHeight: 2.8,
      extent: [0, 0],
      walls: [],
      openings: [],
      rooms: [],
    }
    expect(() => dimensionSvg(empty, { palette })).not.toThrow()
    const svg = dimensionSvg(empty, { palette })
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
  })
})
