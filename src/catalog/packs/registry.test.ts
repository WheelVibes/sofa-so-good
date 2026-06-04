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

  it('hides Kenney in production (dev-only Vite proxy / no CORS) but shows it in dev', () => {
    const kenneyIn = (dev: boolean) =>
      visiblePacks(dev).some((p) => p.id === 'kenney-furniture-kit')
    expect(kenneyIn(false)).toBe(false)
    expect(kenneyIn(true)).toBe(true)
  })

  it('shows the Poly Pizza pack (programmatic API download) in both modes', () => {
    const polyPizzaIn = (dev: boolean) => visiblePacks(dev).some((p) => p.id === 'poly-pizza')
    expect(polyPizzaIn(false)).toBe(true)
    expect(polyPizzaIn(true)).toBe(true)
  })

  it('hides manual link-out sources in production, shows them in dev', () => {
    expect(visiblePacks(false).some((p) => p.kind === 'manual')).toBe(false)
    expect(visiblePacks(true).some((p) => p.kind === 'manual')).toBe(true)
  })

  it('includes dev-only manual material/texture sources tagged assetType=material', () => {
    const materials = visiblePacks(true).filter((p) => p.assetType === 'material')
    expect(materials.length).toBeGreaterThan(0)
    expect(materials.every((p) => p.kind === 'manual' && p.devOnly)).toBe(true)
    // None leak into production.
    expect(visiblePacks(false).some((p) => p.assetType === 'material')).toBe(false)
  })

  it('does not mutate AVAILABLE_PACKS', () => {
    const before = AVAILABLE_PACKS.length
    visiblePacks(false)
    expect(AVAILABLE_PACKS.length).toBe(before)
  })
})
