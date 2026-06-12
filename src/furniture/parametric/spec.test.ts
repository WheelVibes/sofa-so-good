import { describe, expect, it } from 'vitest'
import {
  clampSpec,
  DEFAULT_SPECS,
  defaultSpec,
  MAX_SHELVES,
  PARAMETRIC_LIMITS,
  PARAMETRIC_TYPES,
  specLabel,
} from './spec'

describe('clampSpec', () => {
  it('passes a valid spec through unchanged', () => {
    const s = defaultSpec('wardrobe')
    expect(clampSpec(s)).toEqual(s)
  })

  it('falls back to the bookshelf default for garbage input', () => {
    expect(clampSpec(null)).toEqual(DEFAULT_SPECS.bookshelf)
    expect(clampSpec(undefined)).toEqual(DEFAULT_SPECS.bookshelf)
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
    expect(clampSpec({ type: 'sofa' } as any).type).toBe('bookshelf')
  })

  it('clamps every dimension into its per-type envelope', () => {
    for (const type of PARAMETRIC_TYPES) {
      const lim = PARAMETRIC_LIMITS[type]
      const lo = clampSpec({ type, width: 0, height: -5, depth: 0.01 })
      expect(lo.width).toBe(lim.width.min)
      expect(lo.height).toBe(lim.height.min)
      expect(lo.depth).toBe(lim.depth.min)
      const hi = clampSpec({ type, width: 99, height: 99, depth: 99 })
      expect(hi.width).toBe(lim.width.max)
      expect(hi.height).toBe(lim.height.max)
      expect(hi.depth).toBe(lim.depth.max)
    }
  })

  it('NaN / non-numeric dims fall back to the type default (never NaN out)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
    const s = clampSpec({ type: 'wardrobe', width: Number.NaN, height: 'tall' as any })
    expect(s.width).toBe(DEFAULT_SPECS.wardrobe.width)
    expect(s.height).toBe(DEFAULT_SPECS.wardrobe.height)
    expect(Number.isFinite(s.depth)).toBe(true)
  })

  it('parses numeric strings (raw input field values)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: UI fields can hand back strings
    const s = clampSpec({ type: 'bookshelf', width: '1.2' as any })
    expect(s.width).toBe(1.2)
  })

  it('shelf count: auto passes through, numbers round + clamp to 0..MAX', () => {
    expect(clampSpec({ type: 'bookshelf', shelves: 'auto' }).shelves).toBe('auto')
    expect(clampSpec({ type: 'bookshelf', shelves: 3.6 }).shelves).toBe(4)
    expect(clampSpec({ type: 'bookshelf', shelves: -2 }).shelves).toBe(0)
    expect(clampSpec({ type: 'bookshelf', shelves: 99 }).shelves).toBe(MAX_SHELVES)
    expect(clampSpec({ type: 'bookshelf', shelves: Number.NaN }).shelves).toBe(
      DEFAULT_SPECS.bookshelf.shelves,
    )
  })

  it('rejects malformed colours and unknown base values', () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
    const s = clampSpec({ type: 'sideboard', color: 'red' as any, base: 'wheels' as any })
    expect(s.color).toBe(DEFAULT_SPECS.sideboard.color)
    expect(s.base).toBe(DEFAULT_SPECS.sideboard.base)
  })
})

describe('specLabel', () => {
  it('names the piece with its cm dimensions', () => {
    expect(specLabel(defaultSpec('bookshelf'))).toBe('Custom bookshelf 80 × 200 cm')
    expect(specLabel(defaultSpec('sideboard'))).toBe('Custom sideboard 160 × 65 cm')
  })
})
