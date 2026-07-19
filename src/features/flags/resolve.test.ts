import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import {
  clearStoredOverrides,
  isFeatureEnabled,
  loadOverrides,
  persistOverride,
  setResolvedFlags,
} from './resolve'
import type { FeatureFlag } from './types'

/**
 * Gap-fill for `resolve.ts`'s runtime-plumbing surface (`loadOverrides`,
 * `persistOverride`, `clearStoredOverrides`, `isFeatureEnabled`,
 * `setResolvedFlags`). `resolveFlags`/`parseFlagOverrides`/`parseStoredOverrides`
 * are already exhaustively covered by `../featureFlags.test.ts` — this file
 * targets only the localStorage/URL/module-cache plumbing around them, which
 * had zero coverage.
 */

// Minimal in-memory localStorage stand-in (node env has no real one).
class FakeStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

const LS_KEY = 'hdb_feature_flags'

describe('loadOverrides / persistOverride / clearStoredOverrides', () => {
  let storage: FakeStorage

  beforeEach(() => {
    storage = new FakeStorage()
    ;(globalThis as unknown as { localStorage: FakeStorage }).localStorage = storage
    ;(globalThis as unknown as { location: { search: string } }).location = { search: '' }
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { location?: unknown }).location
  })

  it('reads nothing when localStorage is empty and no URL param is set', () => {
    expect(loadOverrides()).toEqual({})
  })

  it('reads a stored override from localStorage', () => {
    storage.setItem(LS_KEY, JSON.stringify({ report: false }))
    expect(loadOverrides()).toEqual({ report: false })
  })

  it('a URL ?ff= override wins over a conflicting stored value', () => {
    storage.setItem(LS_KEY, JSON.stringify({ report: false, walkthrough: false }))
    ;(globalThis as unknown as { location: { search: string } }).location = {
      search: '?ff=report:on',
    }
    const out = loadOverrides()
    expect(out.report).toBe(true) // URL wins
    expect(out.walkthrough).toBe(false) // untouched stored value survives the merge
  })

  it('ignores malformed JSON in localStorage instead of throwing', () => {
    storage.setItem(LS_KEY, '{not json')
    expect(loadOverrides()).toEqual({})
  })

  it('persistOverride merges a new flag into the existing stored set', () => {
    persistOverride('report', false)
    persistOverride('walkthrough', true)
    expect(JSON.parse(storage.getItem(LS_KEY)!)).toEqual({ report: false, walkthrough: true })
  })

  it('persistOverride with undefined clears just that one flag', () => {
    persistOverride('report', false)
    persistOverride('walkthrough', true)
    persistOverride('report', undefined)
    expect(JSON.parse(storage.getItem(LS_KEY)!)).toEqual({ walkthrough: true })
  })

  it('clearStoredOverrides wipes the whole stored set', () => {
    persistOverride('report', false)
    clearStoredOverrides()
    expect(storage.getItem(LS_KEY)).toBeNull()
  })

  it('does not throw when localStorage/location are unavailable (privacy mode / SSR)', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { location?: unknown }).location
    expect(() => loadOverrides()).not.toThrow()
    expect(loadOverrides()).toEqual({})
    expect(() => persistOverride('report', false)).not.toThrow()
    expect(() => clearStoredOverrides()).not.toThrow()
  })
})

describe('isFeatureEnabled / setResolvedFlags (module snapshot)', () => {
  it('setResolvedFlags replaces the snapshot read by isFeatureEnabled', () => {
    const keys = Object.keys(FEATURE_FLAGS) as FeatureFlag[]
    const allOff = Object.fromEntries(keys.map((k) => [k, false])) as Record<FeatureFlag, boolean>
    setResolvedFlags(allOff)
    expect(isFeatureEnabled('report')).toBe(false)
    expect(isFeatureEnabled('walkthrough')).toBe(false)

    const allOn = Object.fromEntries(keys.map((k) => [k, true])) as Record<FeatureFlag, boolean>
    setResolvedFlags(allOn)
    expect(isFeatureEnabled('report')).toBe(true)
    expect(isFeatureEnabled('walkthrough')).toBe(true)
  })
})
