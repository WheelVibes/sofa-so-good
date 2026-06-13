import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/featureFlags'
import { BACKDROPS, resolveBackdrop, visibleBackdrops } from './SceneBackdrop'

describe('resolveBackdrop', () => {
  it('passes non-skyline kinds through unchanged regardless of the flag', () => {
    for (const kind of ['city', 'park', 'hills', 'none'] as const) {
      expect(resolveBackdrop(kind, true)).toBe(kind)
      expect(resolveBackdrop(kind, false)).toBe(kind)
    }
  })

  it('keeps skyline when photoBackdrop is on', () => {
    expect(resolveBackdrop('skyline', true)).toBe('skyline')
  })

  it('falls back to city when photoBackdrop is off (never an empty background)', () => {
    expect(resolveBackdrop('skyline', false)).toBe('city')
  })
})

describe('visibleBackdrops', () => {
  it('hides the skyline option when photoBackdrop is off', () => {
    const ids = visibleBackdrops(() => false).map((b) => b.id)
    expect(ids).not.toContain('skyline')
    expect(ids).toContain('city')
  })

  it('shows the skyline option when photoBackdrop is on', () => {
    expect(visibleBackdrops(() => true).map((b) => b.id)).toContain('skyline')
  })

  it('marks only the skyline entry as flag-gated', () => {
    expect(BACKDROPS.find((b) => b.id === 'skyline')?.flag).toBe('photoBackdrop')
    for (const b of BACKDROPS.filter((x) => x.id !== 'skyline')) expect(b.flag).toBeUndefined()
  })
})

describe('photoBackdrop flag tiering (both modes)', () => {
  it('is a prod-safe simple-tier feature, on in BOTH Simple and Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').photoBackdrop).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').photoBackdrop).toBe(true)
  })
})
