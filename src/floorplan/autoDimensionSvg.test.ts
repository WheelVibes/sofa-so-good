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
    expect(svg).toContain('5000')
    expect(svg).toContain('4000')
  })

  it('renders imperial labels when units=imperial', () => {
    const svg = dimensionSvg(rectPlan(), { palette, units: 'imperial' })
    // 5 m ≈ 16′ 5″ and 4 m ≈ 13′ 1″ — should appear; metre labels should not
    expect(svg).not.toContain('5.00 m')
    expect(svg).not.toContain('4.00 m')
    // Unicode primes (′ U+2032, ″ U+2033) are not escaped by the SVG esc helper
    expect(svg).toContain('16′ 4 7/8″')
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

describe('dimensionSvg — setting-out row (G3)', () => {
  it('draws nothing extra when settingOut is unset (default false)', () => {
    const svg = dimensionSvg(rectPlan(), { palette })
    expect(svg).not.toContain('SETTING-OUT DATUM')
  })

  it('draws the datum label + a hand-computed face distance when settingOut is on', () => {
    const svg = dimensionSvg(rectPlan(), { palette, settingOut: true })
    expect(svg).toContain('SETTING-OUT DATUM')
    // The east external wall (x=5, thickness 0.2) faces the datum (x=0) at
    // 5 − 0.1 = 4.90 m, a running distance FROM the datum.
    expect(svg).toContain('4900')
  })

  it('uses the datum palette colour, falling back to ink when absent', () => {
    const withDatum = dimensionSvg(rectPlan(), {
      palette: { ...palette, datum: '#ff0011' },
      settingOut: true,
    })
    expect(withDatum).toContain('#ff0011')
    const withoutDatum = dimensionSvg(rectPlan(), { palette, settingOut: true })
    expect(withoutDatum).toContain(palette.ink)
  })

  it('staggers two close setting-out labels onto two rows instead of concatenating', () => {
    // Two thin internal partitions 0.1 m apart (faces at x=2.89 m / 2.99 m
    // from the datum) — close enough in pixel space to overlap/concatenate
    // ("4.854.95 m") without the two-row stagger.
    const plan: FloorPlan = {
      ...rectPlan(),
      walls: [
        ...rectPlan().walls,
        { id: 'p1', start: [2.9, 0], end: [2.9, 4], thickness: 'internal', thicknessM: 0.02 },
        { id: 'p2', start: [3.0, 0], end: [3.0, 4], thickness: 'internal', thicknessM: 0.02 },
      ],
    }
    const svg = dimensionSvg(plan, { palette, settingOut: true })
    expect(svg).toContain('2890')
    expect(svg).toContain('2990')
    // Extract the <text> y-attributes for the two close labels — they must
    // differ (staggered onto two rows), never sharing the same baseline.
    const yFor = (label: string) => {
      const m = svg.match(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>${label}</text>`))
      if (!m) throw new Error(`label not found: ${label}`)
      return m[1]
    }
    expect(yFor('2890')).not.toBe(yFor('2990'))
  })

  it('staggers a 3-way cluster of close labels without any two sharing a row', () => {
    // Three thin partitions each 0.1 m apart — a cluster wide enough that a
    // naive "always try row 0 first" two-row stagger can still dump two
    // colliding labels into row 1 together.
    const plan: FloorPlan = {
      ...rectPlan(),
      walls: [
        ...rectPlan().walls,
        { id: 'p1', start: [2.9, 0], end: [2.9, 4], thickness: 'internal', thicknessM: 0.02 },
        { id: 'p2', start: [3.0, 0], end: [3.0, 4], thickness: 'internal', thicknessM: 0.02 },
        { id: 'p3', start: [3.1, 0], end: [3.1, 4], thickness: 'internal', thicknessM: 0.02 },
      ],
    }
    const svg = dimensionSvg(plan, { palette, settingOut: true })
    const yFor = (label: string) => {
      const m = svg.match(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>${label}</text>`))
      if (!m) throw new Error(`label not found: ${label}`)
      return m[1]
    }
    const y89 = yFor('2890')
    const y99 = yFor('2990')
    const y09 = yFor('3090')
    // The middle label (2.99, colliding with BOTH its neighbours) must land
    // on a different row from each of them; the two outer labels (0.2 m
    // apart, clear of each other) may safely share row 0.
    expect(y99).not.toBe(y89)
    expect(y99).not.toBe(y09)
    expect(y89).toBe(y09)
  })

  it('does not throw on an empty (wall-less) plan with settingOut on', () => {
    const empty: FloorPlan = {
      id: 'e',
      name: 'empty',
      ceilingHeight: 2.8,
      extent: [0, 0],
      walls: [],
      openings: [],
      rooms: [],
    }
    expect(() => dimensionSvg(empty, { palette, settingOut: true })).not.toThrow()
    expect(dimensionSvg(empty, { palette, settingOut: true })).toContain('SETTING-OUT DATUM')
  })
})
