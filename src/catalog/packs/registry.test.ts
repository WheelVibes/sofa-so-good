import { describe, expect, it } from 'vitest'
import { AVAILABLE_PACKS, visiblePacks } from './registry'

describe('visiblePacks', () => {
  it('hides the IKEA live-scrape pack in production', () => {
    const packs = visiblePacks(false)
    expect(packs.some((p) => p.kind === 'ikea-live')).toBe(false)
  })

  it('shows the IKEA live-scrape pack in dev', () => {
    const packs = visiblePacks(true)
    expect(packs.some((p) => p.kind === 'ikea-live')).toBe(true)
  })

  it('keeps non-IKEA (CC0) packs visible in both modes', () => {
    const kenneyIn = (dev: boolean) =>
      visiblePacks(dev).some((p) => p.id === 'kenney-furniture-kit')
    expect(kenneyIn(false)).toBe(true)
    expect(kenneyIn(true)).toBe(true)
  })

  it('does not mutate AVAILABLE_PACKS', () => {
    const before = AVAILABLE_PACKS.length
    visiblePacks(false)
    expect(AVAILABLE_PACKS.length).toBe(before)
  })
})
