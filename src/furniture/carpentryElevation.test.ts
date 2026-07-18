import { describe, expect, it } from 'vitest'
import { buildCarpentryPiece } from './carpentryElevation'
import { defaultSpec } from './parametric/spec'

describe('buildCarpentryPiece', () => {
  describe('bookshelf (single bay, no doors — hand-computed against buildParts constants)', () => {
    const spec = defaultSpec('bookshelf') // 0.8w × 2.0h × 0.3d, shelves: 'auto'
    const piece = buildCarpentryPiece(spec)

    it('reports the overall size in mm', () => {
      expect(piece.overallMm).toEqual({ w: 800, h: 2000, d: 300 })
    })

    it('draws no bay-width dim for a single bay (no dividers)', () => {
      const bayDims = piece.elevation.dims.filter((d) => d.label.startsWith('Bay'))
      expect(bayDims).toHaveLength(0)
    })

    it('elevation carries the overall width + height dims', () => {
      const w = piece.elevation.dims.find((d) => d.label === 'Overall width')
      const h = piece.elevation.dims.find((d) => d.label === 'Overall height')
      expect(w?.valueMm).toBe(800)
      expect(h?.valueMm).toBe(2000)
    })

    it('section carries the panel thickness + plinth height', () => {
      const panel = piece.section.dims.find((d) => d.label === 'Panel thickness')
      const plinth = piece.section.dims.find((d) => d.label === 'Plinth height')
      // PANEL_T / PLINTH_H in buildParts.ts.
      expect(panel?.valueMm).toBe(18)
      expect(plinth?.valueMm).toBe(60)
    })

    it('section carries every shelf height AFF, hand-computed from autoShelfCount', () => {
      // innerH = h - PLINTH_H - 2*PANEL_T = 2.0 - 0.06 - 0.036 = 1.904
      // autoShelfCount(1.904) = round(1.904/0.35) - 1 = 4
      // spacing = 1.904 / 5 = 0.3808; innerBottom = 0.06 + 0.018 = 0.078
      // shelf s height = innerBottom + spacing*s
      const shelfDims = piece.section.dims
        .filter((d) => d.label.startsWith('Shelf'))
        .map((d) => d.valueMm)
      expect(shelfDims).toEqual([459, 840, 1220, 1601])
    })

    it('cuts through the first (only) bay', () => {
      expect(piece.sectionLabel).toBe('Section through bay 1')
    })
  })

  describe('wardrobe (dedicated shelf-bay cut)', () => {
    const spec = defaultSpec('wardrobe') // 1.2w × 2.2h × 0.6d, 2 bays, default 'hang' fit-out
    const piece = buildCarpentryPiece(spec)

    it('reports the overall width/height in mm', () => {
      expect(piece.overallMm.w).toBe(1200)
      expect(piece.overallMm.h).toBe(2200)
    })

    it('draws two equal bay-width dims (2 bays, 1 divider)', () => {
      const bayDims = piece.elevation.dims.filter((d) => d.label.startsWith('Bay'))
      expect(bayDims).toHaveLength(2)
      expect(bayDims[0]?.valueMm).toBe(bayDims[1]?.valueMm)
    })

    it('picks a bay carrying a shelf, and dimensions its top-shelf height AFF', () => {
      expect(piece.sectionLabel).toMatch(/shelf bay|bay 1/)
      // WR_TOP_SHELF_DROP = 0.32; carcassTop = h = 2.2; innerTop = 2.2 - 0.018 = 2.182
      // top shelf y = innerTop - 0.32 = 1.862
      const shelf = piece.section.dims.find((d) => d.label === 'Shelf 1 height AFF')
      expect(shelf?.valueMm).toBe(1862)
      // WR_RAIL_BELOW_SHELF = 0.06 → rail at 1.862 - 0.06 = 1.802
      const rail = piece.section.dims.find((d) => d.label === 'Rail 1 height AFF')
      expect(rail?.valueMm).toBe(1802)
    })
  })

  describe('desk (section through the leg structure)', () => {
    it('four-leg desk cuts through a leg', () => {
      const spec = { ...defaultSpec('desk'), deskLegs: 'legs' as const }
      const piece = buildCarpentryPiece(spec)
      expect(piece.sectionLabel).toBe('Section through leg')
      // A leg rect should be present in the section (its Z-range straddles
      // the cut, so it appears as a box in the depth×height view).
      expect(piece.section.rects.some((r) => r.role === 'leg')).toBe(true)
    })

    it('pedestal desk cuts through the pedestal (drawers visible in section)', () => {
      const spec = { ...defaultSpec('desk'), deskLegs: 'pedestal' as const }
      const piece = buildCarpentryPiece(spec)
      expect(piece.sectionLabel).toBe('Section through pedestal')
      expect(piece.section.rects.some((r) => r.role === 'drawer-front')).toBe(true)
    })
  })

  describe('kitchen-run (base-cabinet cut)', () => {
    it('cuts through a base cabinet and reports plinth + worktop thickness', () => {
      const spec = defaultSpec('kitchen-run')
      const piece = buildCarpentryPiece(spec)
      expect(piece.sectionLabel).toBe('Section through a base cabinet')
      const plinth = piece.section.dims.find((d) => d.label === 'Plinth height')
      const worktop = piece.section.dims.find((d) => d.label === 'Worktop thickness')
      expect(plinth?.valueMm).toBe(100) // KT_TOE_H
      expect(worktop?.valueMm).toBe(40) // KT_WORKTOP_T
    })
  })

  describe('sideboard', () => {
    it('cuts through the first bay', () => {
      const spec = defaultSpec('sideboard')
      const piece = buildCarpentryPiece(spec)
      expect(piece.sectionLabel).toBe('Section through bay 1')
      expect(piece.overallMm.h).toBe(650)
    })
  })
})
