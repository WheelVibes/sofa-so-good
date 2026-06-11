import { describe, expect, it } from 'vitest'
import { parseBrief, parseBriefBudget } from './briefParser'
import { LAYOUT_PRESETS } from './layoutPresets'

describe('parseBriefBudget', () => {
  it('parses $ / S$ / SGD amounts with k-suffix and separators', () => {
    expect(parseBriefBudget('budget around $15k')).toBe(15000)
    expect(parseBriefBudget('we have S$ 12,500 to spend')).toBe(12500)
    expect(parseBriefBudget('sgd 20000 max')).toBe(20000)
    expect(parseBriefBudget('budget of 18k')).toBe(18000)
    expect(parseBriefBudget('under 25k')).toBe(25000)
    expect(parseBriefBudget('a 10k budget')).toBe(10000)
  })

  it('returns null when absent or out of sane range', () => {
    expect(parseBriefBudget('a cozy scandi home')).toBeNull()
    expect(parseBriefBudget('$5')).toBeNull() // below 100
    expect(parseBriefBudget('$2000000')).toBeNull() // above 1M
  })
})

describe('parseBrief', () => {
  it('matches style keywords to the right preset', () => {
    expect(parseBrief('a calm scandinavian feel with light wood', LAYOUT_PRESETS)?.presetId).toBe(
      'scandi-calm',
    )
    expect(parseBrief('japandi, zen and uncluttered', LAYOUT_PRESETS)?.presetId).toBe('japandi')
    expect(parseBrief('we both work from home and need a desk', LAYOUT_PRESETS)?.presetId).toBe(
      'wfh-studio',
    )
    expect(parseBrief('expecting a baby, need a nursery', LAYOUT_PRESETS)?.presetId).toBe(
      'family-nursery',
    )
    expect(parseBrief('industrial loft vibe with leather', LAYOUT_PRESETS)?.presetId).toBe(
      'warm-industrial',
    )
  })

  it('reports the matched terms and budget honestly', () => {
    const m = parseBrief('tropical resort feel with plants, budget $15k', LAYOUT_PRESETS)
    expect(m?.presetId).toBe('cozy-tropical')
    expect(m?.matchedTerms).toEqual(expect.arrayContaining(['tropical', 'plants']))
    expect(m?.budget).toBe(15000)
  })

  it('matches whole words only (no substring false hits)', () => {
    // "monochrome" must not be matched inside another word; "mono" must not
    // match "monorail" etc.
    const m = parseBrief('we ride the monorail daily', LAYOUT_PRESETS)
    expect(m?.presetId).not.toBe('modern-mono')
  })

  it('returns null for an empty or unmatched brief', () => {
    expect(parseBrief('', LAYOUT_PRESETS)).toBeNull()
    expect(parseBrief('zzz qqq xxx', LAYOUT_PRESETS)).toBeNull()
  })

  it('every curated keyword preset id exists in LAYOUT_PRESETS', () => {
    const ids = new Set(LAYOUT_PRESETS.map((p) => p.id))
    // The keyword table drives matching — a renamed preset would silently stop
    // matching, so assert the linkage both ways for the curated ids.
    for (const id of [
      'move-in',
      'scandi-calm',
      'warm-industrial',
      'cozy-tropical',
      'japandi',
      'coastal',
      'open-lounge',
      'entertainer',
      'broken-plan',
      'wfh-studio',
      'social-lounge',
      'minimalist',
      'boutique-suite',
      'family-nursery',
      'modern-mono',
    ]) {
      expect(ids.has(id), `preset id ${id} missing from LAYOUT_PRESETS`).toBe(true)
    }
  })
})
