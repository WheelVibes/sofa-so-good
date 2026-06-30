import { describe, expect, it } from 'vitest'
import { HDRI_PRESETS, hdriById } from './hdriCatalog'

describe('HDRI catalog (F3/R-HDRI)', () => {
  it('has unique ids and CORS-friendly https .hdr URLs', () => {
    const ids = new Set<string>()
    for (const h of HDRI_PRESETS) {
      expect(ids.has(h.id)).toBe(false)
      ids.add(h.id)
      expect(h.url.startsWith('https://')).toBe(true)
      expect(h.url.endsWith('.hdr')).toBe(true)
      expect(h.name.length).toBeGreaterThan(0)
      expect(h.credit).toMatch(/CC0/)
    }
    expect(HDRI_PRESETS.length).toBeGreaterThanOrEqual(3)
  })

  it('hdriById resolves a preset or null', () => {
    expect(hdriById('studio_small_09')?.id).toBe('studio_small_09')
    expect(hdriById(null)).toBeNull()
    expect(hdriById(undefined)).toBeNull()
    expect(hdriById('does-not-exist')).toBeNull()
  })
})
