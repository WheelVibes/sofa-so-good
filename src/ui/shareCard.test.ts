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
  SHARE_CARD_DIMS,
  SHARE_CARD_MAX_SWATCHES,
  type ShareCardFormat,
  shareCardFilename,
  shareCardLayout,
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

  it('defaults to the post format (no suffix)', () => {
    expect(shareCardFilename('Studio', date, 'post')).toBe('sofa-hero-studio-2026-07-18.png')
  })

  it('suffixes non-default formats', () => {
    expect(shareCardFilename('Studio', date, 'square')).toBe(
      'sofa-hero-studio-2026-07-18-square.png',
    )
    expect(shareCardFilename('Studio', date, 'story')).toBe('sofa-hero-studio-2026-07-18-story.png')
  })
})

describe('shareCardLayout', () => {
  const formats: ShareCardFormat[] = ['post', 'square', 'story']

  it("matches the original hardcoded 'post' card exactly (byte-identical default)", () => {
    const l = shareCardLayout('post')
    expect(l.width).toBe(1080)
    expect(l.height).toBe(1350)
    expect(l.pad).toBe(56)
    expect(l.radius).toBe(28)
    expect(l.hero).toEqual({ x: 56, y: 56, width: 968, height: 900 })
    expect(l.nameY).toBe(1040)
    expect(l.statsY).toBe(1086)
    expect(l.stripTop).toBe(1126)
    expect(l.wordY).toBe(1294)
    expect(l.maxTextW).toBe(968)
  })

  it('matches the documented dims for each format', () => {
    expect(SHARE_CARD_DIMS.post).toEqual({ width: 1080, height: 1350 })
    expect(SHARE_CARD_DIMS.square).toEqual({ width: 1080, height: 1080 })
    expect(SHARE_CARD_DIMS.story).toEqual({ width: 1080, height: 1920 })
  })

  it.each(formats)('keeps the hero rect within the card bounds for %s', (format) => {
    const l = shareCardLayout(format)
    expect(l.hero.x).toBeGreaterThanOrEqual(0)
    expect(l.hero.y).toBeGreaterThanOrEqual(0)
    expect(l.hero.x + l.hero.width).toBeLessThanOrEqual(l.width)
    expect(l.hero.y + l.hero.height).toBeLessThanOrEqual(l.height)
    expect(l.hero.height).toBeGreaterThan(0)
  })

  it.each(
    formats,
  )('anchors the chrome block (name → strip → wordmark) below the hero for %s', (format) => {
    const l = shareCardLayout(format)
    expect(l.nameY).toBeGreaterThan(l.hero.y + l.hero.height)
    expect(l.statsY).toBeGreaterThan(l.nameY)
    expect(l.stripTop).toBeGreaterThan(l.statsY)
    expect(l.wordY).toBeLessThanOrEqual(l.height)
    expect(l.wordY).toBeGreaterThan(l.stripTop)
  })

  it.each(formats)('fits the max-swatch strip within maxTextW for %s', (format) => {
    const l = shareCardLayout(format)
    const strip = paletteStripLayout({
      count: SHARE_CARD_MAX_SWATCHES,
      width: l.maxTextW,
      gap: 16,
      min: 48,
      max: 120,
    })
    expect(strip.totalWidth).toBeLessThanOrEqual(l.maxTextW + 1e-6)
  })

  it('grows only the hero (not the chrome footer) for a taller format', () => {
    const post = shareCardLayout('post')
    const story = shareCardLayout('story')
    // Same fixed distance from stripTop to wordY on every format (the chrome
    // footer's own internal layout never changes size, only its position).
    expect(story.wordY - story.stripTop).toBe(post.wordY - post.stripTop)
    expect(story.hero.height).toBeGreaterThan(post.hero.height)
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
