import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/featureFlags'
import { BACKDROP_PRESETS } from './backdropEquirect'
import { BACKDROPS, isPhotoBackdropActive } from './SceneBackdrop'

describe('isPhotoBackdropActive', () => {
  it('is active only in walk mode for a real photo preset', () => {
    expect(isPhotoBackdropActive('city', 'firstPerson')).toBe(true)
    expect(isPhotoBackdropActive('dusk', 'firstPerson')).toBe(true)
  })

  it('treats the sun-driven `sky` kind as an active backdrop in walk mode', () => {
    // The procedural sky occupies the same `scene.background` slot, so the
    // DreiSky dome hides for it too (SkyBackdrop owns the paint).
    expect(isPhotoBackdropActive('sky', 'firstPerson')).toBe(true)
    expect(isPhotoBackdropActive('sky', 'orbit')).toBe(false)
  })

  it('is inactive in orbit mode (surroundings not needed for the dollhouse)', () => {
    for (const kind of ['city', 'dusk', 'park', 'hills', 'sky', 'custom', 'none'] as const) {
      expect(isPhotoBackdropActive(kind, 'orbit', true)).toBe(false)
    }
  })

  it('is inactive for the `none` backdrop even in walk mode (plain sky)', () => {
    expect(isPhotoBackdropActive('none', 'firstPerson')).toBe(false)
  })

  it('activates `custom` only when an uploaded image is present', () => {
    expect(isPhotoBackdropActive('custom', 'firstPerson', false)).toBe(false)
    expect(isPhotoBackdropActive('custom', 'firstPerson', true)).toBe(true)
  })
})

describe('BACKDROPS picker options', () => {
  it('lists every photo preset plus sky + custom + none, and each photo preset id has a bake', () => {
    const ids = BACKDROPS.map((b) => b.id)
    expect(ids).toEqual(['city', 'dusk', 'park', 'hills', 'sky', 'custom', 'none'])
    for (const id of ids) {
      // `none`/`custom` have no procedural bake; `sky` is baked from the analytic
      // core (`bakeSkyEquirect`), not from BACKDROP_PRESETS.
      if (id === 'none' || id === 'custom' || id === 'sky') continue
      expect(BACKDROP_PRESETS[id as keyof typeof BACKDROP_PRESETS]).toBeDefined()
    }
  })
})

describe('backdrop flags tiering (both modes)', () => {
  it('backdrops + customBackdrop are prod-safe simple-tier, on in Simple AND Pro', () => {
    for (const mode of ['simple', 'pro'] as const) {
      const flags = resolveFlags(false, {}, false, mode)
      expect(flags.backdrops).toBe(true)
      expect(flags.customBackdrop).toBe(true)
    }
  })

  it('proceduralSky (the `sky` backdrop) is pro-tier: off in Simple, on in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').proceduralSky).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').proceduralSky).toBe(true)
  })
})
