import { describe, expect, it } from 'vitest'
import { buildCarpentryPiece, hardwareCallouts, materialNotes } from './carpentryElevation'
import { buildParametric } from './parametric/buildParts'
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

  describe('SECTION A-A cut-line marker + title (TODO H2)', () => {
    it('every piece carries the standard section title + a cut X inside its elevation width', () => {
      for (const type of ['bookshelf', 'wardrobe', 'sideboard', 'desk', 'kitchen-run'] as const) {
        const piece = buildCarpentryPiece(defaultSpec(type))
        expect(piece.sectionTitle).toBe('SECTION A-A')
        const halfW = piece.overallMm.w / 1000 / 2
        expect(piece.elevationCutX).toBeGreaterThanOrEqual(-halfW - 1e-6)
        expect(piece.elevationCutX).toBeLessThanOrEqual(halfW + 1e-6)
      }
    })
  })
})

describe('materialNotes (TODO H2 — honest materials/finish note)', () => {
  it('states the finish kind + tint, hedged, never inventing a laminate code', () => {
    const spec = defaultSpec('bookshelf') // finish: 'wood', color: '#9a7b50'
    const { parts } = buildParametric(spec)
    const lines = materialNotes(spec, parts)
    expect(lines.join(' ')).toMatch(/wood-grain laminate/)
    expect(lines.join(' ')).toContain('#9a7b50')
    expect(lines.join(' ')).toContain('confirm exact board/laminate code with fabricator')
    // No invented brand/laminate code token anywhere in the notes.
    expect(lines.join(' ')).not.toMatch(/EGGER|Kronospan|H\d{4}|U\d{3}/)
  })

  it('restates board/back-panel thickness straight off the piece’s own panel parts', () => {
    const spec = defaultSpec('wardrobe')
    const { parts } = buildParametric(spec)
    const lines = materialNotes(spec, parts)
    // PANEL_T = 18mm, BACK_T = 12mm in buildParts.ts.
    expect(lines.some((l) => l.includes('18 mm carcass panel'))).toBe(true)
    expect(lines.some((l) => l.includes('12 mm back panel'))).toBe(true)
  })

  it('names a catalog/DLC material honestly, still hedged', () => {
    const spec = { ...defaultSpec('sideboard'), finish: 'mat:oak-natural' }
    const { parts } = buildParametric(spec)
    const lines = materialNotes(spec, parts)
    expect(lines.join(' ')).toContain('catalog material "oak-natural"')
  })

  it('falls back to an honest TBC when the piece has no side panel to read a thickness from', () => {
    const spec = { ...defaultSpec('desk'), deskLegs: 'legs' as const } // four-leg desk: no 'side' parts
    const { parts } = buildParametric(spec)
    const lines = materialNotes(spec, parts)
    expect(lines).toContain('Board & panel thickness: TBC by fabricator.')
  })
})

describe('hardwareCallouts (TODO H2 — counts derived from the real part list)', () => {
  it('sliding wardrobe front: always 2 door panels + track/roller hardware, regardless of bay count', () => {
    const spec = defaultSpec('wardrobe') // wardrobeFront: 'sliding', 2 bays
    const { parts } = buildParametric(spec)
    const lines = hardwareCallouts(spec, parts)
    expect(lines.some((l) => /Sliding track \+ rollers.*2 door panels/.test(l))).toBe(true)
    // No hinge line for a sliding front.
    expect(lines.some((l) => l.startsWith('Hinges'))).toBe(false)
  })

  it('hinged wardrobe front: hinge count follows the door-height rule (2/door ≤ 1200mm, 3 above)', () => {
    const spec = { ...defaultSpec('wardrobe'), wardrobeFront: 'hinged' as const }
    const { parts } = buildParametric(spec)
    const doorParts = parts.filter((p) => p.role === 'door')
    // Default wardrobe (2.2m tall) → door leaves are well over 1200mm tall → 3 hinges/leaf.
    expect(doorParts.every((p) => p.size[1] * 1000 >= 1200)).toBe(true)
    const lines = hardwareCallouts(spec, parts)
    const hingeLine = lines.find((l) => l.startsWith('Hinges'))
    expect(hingeLine).toBeDefined()
    expect(hingeLine).toContain(`${doorParts.length * 3} total`)
    expect(hingeLine).toContain(`for ${doorParts.length} doors`)
    expect(hingeLine).toContain('2 hinges/door up to 1200 mm tall, 3 above')
    expect(lines.some((l) => l.startsWith('Door handles/pulls'))).toBe(true)
  })

  it('desk with 3 pedestal drawers → 3 runner pairs + 3 drawer handles', () => {
    const spec = { ...defaultSpec('desk'), deskLegs: 'pedestal' as const, height: 0.68 }
    const { parts } = buildParametric(spec)
    const drawerFronts = parts.filter((p) => p.role === 'drawer-front')
    expect(drawerFronts).toHaveLength(3)
    const lines = hardwareCallouts(spec, parts)
    expect(lines).toContain('Drawer runners (soft-close) — 3 pairs.')
    expect(lines).toContain(`Drawer handles/pulls — ×${drawerFronts.length}.`)
  })

  it('four-leg desk (no drawers, no doors) reads as open — no invented hardware', () => {
    const spec = { ...defaultSpec('desk'), deskLegs: 'legs' as const }
    const { parts } = buildParametric(spec)
    const lines = hardwareCallouts(spec, parts)
    expect(lines).toEqual(['Open shelving — shelf supports as required by fabricator.'])
  })

  it('bookshelf (always open, no doors/drawers ever) — shelf-supports fallback, no fixed/adjustable claim', () => {
    const spec = defaultSpec('bookshelf')
    const { parts } = buildParametric(spec)
    const lines = hardwareCallouts(spec, parts)
    expect(lines).toEqual(['Open shelving — shelf supports as required by fabricator.'])
  })

  it('sideboard with a door bay + a drawer bay reports both hinges and runners', () => {
    const spec = {
      ...defaultSpec('sideboard'),
      bays: 2,
      compartments: [{ style: 'door' as const }, { style: 'drawer' as const }],
    }
    const { parts } = buildParametric(spec)
    const doorCount = parts.filter((p) => p.role === 'door').length
    const drawerCount = parts.filter((p) => p.role === 'drawer-front').length
    expect(doorCount).toBeGreaterThan(0)
    expect(drawerCount).toBeGreaterThan(0)
    const lines = hardwareCallouts(spec, parts)
    expect(lines.some((l) => l.startsWith('Hinges'))).toBe(true)
    expect(lines.some((l) => l.startsWith('Drawer runners'))).toBe(true)
  })
})
