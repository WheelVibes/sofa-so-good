import { describe, expect, it } from 'vitest'
import type { CarpentryView } from '../furniture/carpentryElevation'
import { carpentrySvg } from './carpentrySheetSvg'

const PALETTE = { ink: '#374151', fill: '#e5e7eb', hidden: '#9ca3af' }

const view: CarpentryView = {
  rects: [{ x0: -0.4, x1: 0.4, y0: 0, y1: 2, role: 'side', hidden: false }],
  dims: [
    {
      axis: 'h',
      from: -0.4,
      to: 0.4,
      at: 2.14,
      label: 'Overall width',
      valueMm: 800,
      labelSide: 'right',
    },
  ],
}

describe('carpentrySvg — section cut-line marker (TODO H2)', () => {
  it('draws nothing when cutX is omitted', () => {
    const svg = carpentrySvg(view, { palette: PALETTE })
    expect(svg).not.toContain('section-cut')
    expect(svg).not.toContain('>A</text>')
  })

  it('draws a dash-dot cut line + two "A" bubbles when cutX is set', () => {
    const svg = carpentrySvg(view, { palette: PALETTE, cutX: 0 })
    expect(svg).toContain('class="section-cut"')
    expect(svg).toContain('stroke-dasharray="8 3 2 3"')
    expect(svg.match(/<circle /g)?.length).toBe(2)
    expect(svg.match(/>A<\/text>/g)?.length).toBe(2)
  })

  it('places the cut line at the requested local X', () => {
    const svgLeft = carpentrySvg(view, { palette: PALETTE, cutX: -0.3, widthPx: 700 })
    const svgRight = carpentrySvg(view, { palette: PALETTE, cutX: 0.3, widthPx: 700 })
    const xOf = (svg: string) => {
      const cutGroup = svg.match(/<g class="section-cut">([\s\S]*?)<\/g>/)?.[1] ?? ''
      return Number(cutGroup.match(/<line x1="([\d.]+)"/)?.[1])
    }
    expect(xOf(svgLeft)).toBeLessThan(xOf(svgRight))
  })

  it('does nothing (no crash) for an empty view', () => {
    const empty: CarpentryView = { rects: [], dims: [] }
    const svg = carpentrySvg(empty, { palette: PALETTE, cutX: 0 })
    expect(svg).not.toContain('section-cut')
  })
})
