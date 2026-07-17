/**
 * Unit tests for the pure parts of the one-tap hero card (feature `shareCard`):
 * the stat-line builder (metric + imperial, pluralisation), the swatch source
 * selection, the palette-strip layout math, the filename builder, and the
 * flag's tier gating in BOTH Simple and Pro modes.
 */
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../features/featureFlags'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureItem } from '../furniture/types'
import {
  buildShareCardStats,
  paletteStripLayout,
  pickShareCardSwatches,
  SHARE_CARD_MAX_SWATCHES,
  shareCardFilename,
} from './shareCard'

const item = (id: string): FurnitureItem => ({
  id,
  defId: 'sofa',
  position: [1, 1],
  rotation: 0,
  props: {},
})

// 4 × 3 m room = 12 m² ≈ 129 ft².
const plan: FloorPlan = {
  id: 'p',
  name: 'Studio',
  ceilingHeight: 2.6,
  extent: [4, 3],
  walls: [],
  openings: [],
  rooms: [{ id: 'r', name: 'Room', origin: [0, 0], width: 4, depth: 3 }],
}

describe('buildShareCardStats', () => {
  it('formats item / area / room parts and joins them (metric)', () => {
    const s = buildShareCardStats(plan, [item('a'), item('b')], 'metric')
    expect(s.itemsText).toBe('2 items')
    expect(s.areaText).toBe('12.0 m²')
    expect(s.roomsText).toBe('1 room')
    expect(s.line).toBe('2 items · 12.0 m² · 1 room')
  })

  it('renders area in imperial when requested', () => {
    const s = buildShareCardStats(plan, [item('a')], 'imperial')
    expect(s.areaText).toMatch(/ft²$/)
    expect(s.itemsText).toBe('1 item')
    expect(s.line).toContain('ft²')
  })

  it('singularises a single item/room and handles an empty design', () => {
    const empty = buildShareCardStats(plan, [], 'metric')
    expect(empty.itemsText).toBe('0 items')
    expect(empty.roomsText).toBe('1 room')
  })
})

describe('pickShareCardSwatches', () => {
  it('prefers the master palette when present', () => {
    expect(pickShareCardSwatches(['#111111', '#222222'], ['#aaaaaa'])).toEqual([
      '#111111',
      '#222222',
    ])
  })

  it('falls back to the design finish swatches when the master palette is empty', () => {
    expect(pickShareCardSwatches([], ['#aaaaaa', '#bbbbbb'])).toEqual(['#aaaaaa', '#bbbbbb'])
  })

  it('drops blanks and caps at the max', () => {
    const many = Array.from({ length: 10 }, (_, i) => `#00000${i}`)
    expect(pickShareCardSwatches(many, [])).toHaveLength(SHARE_CARD_MAX_SWATCHES)
    expect(pickShareCardSwatches(['#111111', '', '#222222'], [])).toEqual(['#111111', '#222222'])
  })

  it('returns empty when neither source has colour', () => {
    expect(pickShareCardSwatches([], [])).toEqual([])
  })
})

describe('paletteStripLayout', () => {
  it('spaces N chips evenly across the width', () => {
    const l = paletteStripLayout({ count: 4, width: 400, gap: 20, min: 10, max: 200 })
    // (400 - 20*3) / 4 = 85
    expect(l.size).toBe(85)
    expect(l.rects).toHaveLength(4)
    expect(l.rects[0].x).toBe(0)
    expect(l.rects[1].x).toBe(85 + 20)
    expect(l.rects[3].x).toBe(3 * (85 + 20))
    expect(l.totalWidth).toBeCloseTo(400)
  })

  it('clamps chip size to the max for few chips', () => {
    const l = paletteStripLayout({ count: 1, width: 400, gap: 16, min: 10, max: 120 })
    expect(l.size).toBe(120)
    expect(l.rects[0].x).toBe(0)
  })

  it('clamps chip size to the min for many chips', () => {
    const l = paletteStripLayout({ count: 6, width: 100, gap: 16, min: 40, max: 120 })
    expect(l.size).toBe(40)
  })

  it('returns an empty layout for non-positive count/width', () => {
    expect(paletteStripLayout({ count: 0, width: 400, gap: 16, min: 10, max: 100 }).rects).toEqual(
      [],
    )
    expect(paletteStripLayout({ count: 3, width: 0, gap: 16, min: 10, max: 100 }).rects).toEqual([])
  })
})

describe('shareCardFilename', () => {
  const date = new Date('2026-07-18T10:00:00Z')

  it('slugifies the name and stamps the date', () => {
    expect(shareCardFilename('HDB 4-Room (default)', date)).toBe(
      'sofa-hero-hdb-4-room-default-2026-07-18.png',
    )
  })

  it('degrades a blank/emoji-only name to "design"', () => {
    expect(shareCardFilename('', date)).toBe('sofa-hero-design-2026-07-18.png')
    expect(shareCardFilename('🎉', date)).toBe('sofa-hero-design-2026-07-18.png')
  })

  it('trims leading/trailing dashes', () => {
    expect(shareCardFilename('  Studio!  ', date)).toBe('sofa-hero-studio-2026-07-18.png')
  })
})

describe('shareCard feature flag', () => {
  it('is defined in the registry with tier=simple and default=true', () => {
    const flag = FEATURE_FLAGS['shareCard']
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('simple')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeFalsy()
  })

  it('is enabled in Simple mode (share is a Simple-tier stage)', () => {
    // resolveFlags(isDev, overrides, isAdmin, uiMode)
    expect(resolveFlags(false, {}, false, 'simple').shareCard).toBe(true)
  })

  it('is enabled in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').shareCard).toBe(true)
  })
})
