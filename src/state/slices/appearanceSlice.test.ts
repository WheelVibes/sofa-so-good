import { describe, expect, it } from 'vitest'
import { THEME_META, THEME_NAMES } from './appearanceSlice'

describe('theme metadata', () => {
  it('every THEME_NAME has complete THEME_META', () => {
    for (const name of THEME_NAMES) {
      const meta = THEME_META[name]
      expect(meta, `missing meta for "${name}"`).toBeDefined()
      expect(meta.name.length).toBeGreaterThan(0)
      expect(meta.desc.length).toBeGreaterThan(0)
      // chip + accent are the two-swatch preview; both must be colour strings.
      expect(meta.chip).toMatch(/oklch|#/)
      expect(meta.accent).toMatch(/oklch|#/)
    }
  })

  it('has no orphan THEME_META keys (every meta is a listed theme)', () => {
    for (const key of Object.keys(THEME_META)) {
      expect(THEME_NAMES, `orphan meta "${key}"`).toContain(key)
    }
  })

  it('lists the five Singapore-rooted themes', () => {
    expect(THEME_NAMES).toEqual(['clay', 'kampong', 'porcelain', 'estate', 'harbour'])
  })
})
