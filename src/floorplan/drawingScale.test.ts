import { describe, expect, it } from 'vitest'
import {
  A4_LANDSCAPE_PRINTABLE_MM,
  PAGE_MARGIN_MM,
  PAPER_PRINTABLE_MM,
  PAPER_SIZE_MM,
  paperDimensionsMm,
  pickDrawingScale,
  printableAreaMm,
  SHEET_PADDING_MM,
  STANDARD_SCALE_RATIOS,
  TITLE_BLOCK_RESERVE_MM,
} from './drawingScale'

describe('pickDrawingScale', () => {
  it('picks the largest-detail (smallest ratio) that fits a typical HDB plan', () => {
    // ~10m x 6m plan. At 1:50, printed = 200mm x 120mm — fits 261x150.
    // At 1:20/1:25, printed would overflow (500x300 / 400x240).
    const s = pickDrawingScale({ w: 10, d: 6 })
    expect(s.ratio).toBe(50)
    expect(s.mmPerM).toBeCloseTo(20)
    expect(s.label).toBe('1:50')
  })

  it('picks 1:20 for a tiny extent', () => {
    const s = pickDrawingScale({ w: 0.5, d: 0.5 })
    expect(s.ratio).toBe(20)
  })

  it('falls back to the smallest-detail ratio (1:200) for a huge extent', () => {
    const s = pickDrawingScale({ w: 500, d: 500 })
    expect(s.ratio).toBe(200)
    // Even the fallback doesn't fit — caller still gets a stated ratio.
    expect(s.mmPerM * 500).toBeGreaterThan(A4_LANDSCAPE_PRINTABLE_MM.width)
  })

  it('is exact at the boundary — printed size exactly equal to the printable area fits', () => {
    // Choose extent so 1:50 prints EXACTLY at the printable width.
    const w = A4_LANDSCAPE_PRINTABLE_MM.width / 20 // mmPerM at 1:50 = 20
    const s = pickDrawingScale({ w, d: 1 })
    expect(s.ratio).toBe(50)
  })

  it('rejects a ratio that overflows by a hair and moves to the next', () => {
    const w = A4_LANDSCAPE_PRINTABLE_MM.width / 20 + 0.001
    const s = pickDrawingScale({ w, d: 1 })
    expect(s.ratio).toBe(75)
  })

  it('checks both axes independently — a tall-but-narrow extent picks by height', () => {
    // Width tiny (fits any ratio), height large enough to force a coarser ratio.
    const s = pickDrawingScale({ w: 0.5, d: 20 })
    // At 1:20 (mmPerM=50): 20*50=1000mm > 150mm height budget.
    // At 1:150 (mmPerM=6.667): 20*6.667=133.3mm <= 150mm — fits.
    // At 1:125 (mmPerM=8): 20*8=160mm > 150mm — doesn't fit.
    expect(s.ratio).toBe(150)
  })

  it('respects a custom printable area', () => {
    const s = pickDrawingScale({ w: 10, d: 6 }, { width: 1000, height: 1000 })
    expect(s.ratio).toBe(STANDARD_SCALE_RATIOS[0])
  })

  it('every standard ratio is covered and ascending', () => {
    expect(STANDARD_SCALE_RATIOS).toEqual([...STANDARD_SCALE_RATIOS].sort((a, b) => a - b))
  })

  describe('picking on bigger paper (user-customizable paper size)', () => {
    it('picks a finer (smaller-number) ratio on A3 landscape than A4 landscape for the same plan', () => {
      // 15m x 9m: at 1:50 (300x180mm) overflows A4's 261x150 budget (→ 1:75),
      // but fits A3 landscape's bigger 384x237 budget (→ stays 1:50).
      const extent = { w: 15, d: 9 }
      const a4 = pickDrawingScale(extent, PAPER_PRINTABLE_MM['a4-landscape'])
      const a3 = pickDrawingScale(extent, PAPER_PRINTABLE_MM['a3-landscape'])
      expect(a3.ratio).toBeLessThanOrEqual(a4.ratio)
      expect(a3.ratio).toBeLessThan(a4.ratio) // strictly finer for this extent
    })

    it('picks a finer ratio on A1 portrait than A4 landscape for a large room', () => {
      const extent = { w: 12, d: 20 }
      const a4 = pickDrawingScale(extent, PAPER_PRINTABLE_MM['a4-landscape'])
      const a1 = pickDrawingScale(extent, PAPER_PRINTABLE_MM['a1-portrait'])
      expect(a1.ratio).toBeLessThan(a4.ratio)
    })
  })
})

describe('paper dimensions + printable-area table', () => {
  it('A3 doubles A4 by area (ISO 216) — short edge of A3 == long edge of A4', () => {
    expect(PAPER_SIZE_MM.a3[0]).toBe(PAPER_SIZE_MM.a4[1])
  })

  it('A2/A1 continue the doubling relationship', () => {
    expect(PAPER_SIZE_MM.a2[0]).toBe(PAPER_SIZE_MM.a3[1])
    expect(PAPER_SIZE_MM.a1[0]).toBe(PAPER_SIZE_MM.a2[1])
  })

  it('landscape swaps portrait width/height', () => {
    const portrait = paperDimensionsMm('a3', 'portrait')
    const landscape = paperDimensionsMm('a3', 'landscape')
    expect(landscape.widthMm).toBe(portrait.heightMm)
    expect(landscape.heightMm).toBe(portrait.widthMm)
  })

  it('printable area is paper size minus the (margin+padding) margin, minus the title-block reserve on height', () => {
    const { widthMm, heightMm } = paperDimensionsMm('a2', 'landscape')
    const area = printableAreaMm('a2', 'landscape')
    const margin = (PAGE_MARGIN_MM + SHEET_PADDING_MM) * 2
    expect(area.width).toBe(widthMm - margin)
    expect(area.height).toBe(heightMm - margin - TITLE_BLOCK_RESERVE_MM)
  })

  it('reproduces the hand-derived A4-landscape printable area (261 x 150mm)', () => {
    expect(PAPER_PRINTABLE_MM['a4-landscape']).toEqual(A4_LANDSCAPE_PRINTABLE_MM)
    expect(A4_LANDSCAPE_PRINTABLE_MM).toEqual({ width: 261, height: 150 })
  })

  it('every combo (4 sizes x 2 orientations) is present with a positive printable area', () => {
    const keys = Object.keys(PAPER_PRINTABLE_MM)
    expect(keys.length).toBe(8)
    for (const k of keys) {
      expect(PAPER_PRINTABLE_MM[k].width).toBeGreaterThan(0)
      expect(PAPER_PRINTABLE_MM[k].height).toBeGreaterThan(0)
    }
  })
})
