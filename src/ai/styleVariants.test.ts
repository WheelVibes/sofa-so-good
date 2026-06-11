import { describe, expect, it } from 'vitest'
import {
  buildVariantPrompt,
  defaultPhotorealPrompt,
  STYLE_VARIANTS,
  THEME_HINTS,
} from './styleVariants'

describe('STYLE_VARIANTS', () => {
  it('offers the five restyle chips with unique ids', () => {
    expect(STYLE_VARIANTS.map((v) => v.id)).toEqual([
      'scandinavian',
      'japandi',
      'industrial',
      'luxury',
      'tropical',
    ])
    expect(new Set(STYLE_VARIANTS.map((v) => v.id)).size).toBe(STYLE_VARIANTS.length)
  })

  it('every variant has a label and a non-empty prompt descriptor', () => {
    for (const v of STYLE_VARIANTS) {
      expect(v.label.length).toBeGreaterThan(0)
      expect(v.prompt.length).toBeGreaterThan(10)
    }
  })
})

describe('defaultPhotorealPrompt', () => {
  it('seeds from the theme hint with the photoreal tail', () => {
    expect(defaultPhotorealPrompt('porcelain')).toBe(
      `${THEME_HINTS.porcelain}, photorealistic, natural light, interior design photo`,
    )
  })
  it('falls back for unknown themes', () => {
    expect(defaultPhotorealPrompt('nope')).toMatch(/^modern interior, photorealistic/)
  })
})

describe('buildVariantPrompt', () => {
  const japandi = STYLE_VARIANTS.find((v) => v.id === 'japandi')!
  const industrial = STYLE_VARIANTS.find((v) => v.id === 'industrial')!

  it('leads with the style descriptor and keeps the non-style tail', () => {
    const p = buildVariantPrompt(defaultPhotorealPrompt('clay'), japandi)
    expect(p.startsWith(japandi.prompt)).toBe(true)
    expect(p).toContain('photorealistic')
    expect(p).toContain('natural light')
    expect(p).toContain('interior design photo')
  })

  it('strips the theme hint so styles do not conflict', () => {
    const p = buildVariantPrompt(defaultPhotorealPrompt('estate'), japandi)
    expect(p).not.toContain(THEME_HINTS.estate)
  })

  it('replaces a previous style instead of stacking', () => {
    const first = buildVariantPrompt(defaultPhotorealPrompt('clay'), industrial)
    const second = buildVariantPrompt(first, japandi)
    expect(second.startsWith(japandi.prompt)).toBe(true)
    expect(second).not.toContain('industrial')
    expect(second).not.toContain('charcoal')
    // restyle is idempotent over chains: tail survives intact
    expect(second).toContain('photorealistic, natural light, interior design photo')
  })

  it('keeps user-written extra instructions', () => {
    const p = buildVariantPrompt('golden hour, photorealistic, marble floor', japandi)
    expect(p).toBe(`${japandi.prompt}, golden hour, photorealistic, marble floor`)
  })

  it('handles an empty or all-style base prompt', () => {
    expect(buildVariantPrompt('', japandi)).toBe(japandi.prompt)
    expect(buildVariantPrompt(industrial.prompt, japandi)).toBe(japandi.prompt)
  })
})
