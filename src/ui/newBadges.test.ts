import { describe, expect, it } from 'vitest'
import { FEATURE_FLAG_KEYS } from '../features/featureFlags'
import { APP_VERSION, parseVersion } from '../version'
import { isRecentlyIntroduced, NEW_BADGES } from './newBadges'

describe('NEW_BADGES registry', () => {
  it('every key is a valid FeatureFlag', () => {
    for (const flag of Object.keys(NEW_BADGES)) {
      expect(FEATURE_FLAG_KEYS).toContain(flag)
    }
  })

  it('every version parses to real numeric parts', () => {
    for (const version of Object.values(NEW_BADGES)) {
      if (!version) continue
      const parsed = parseVersion(version)
      expect(parsed.major).toBeGreaterThanOrEqual(0)
      expect(parsed.minor).toBeGreaterThanOrEqual(0)
      expect(parsed.patch).toBeGreaterThanOrEqual(0)
      expect(parsed.build).toBeGreaterThanOrEqual(0)
      // Round-trips to the same numeric value (catches garbage like 'abc').
      expect(version.split('.').map(Number)).toEqual([
        parsed.major,
        parsed.minor,
        parsed.patch,
        parsed.build,
      ])
    }
  })

  it('has at least one entry with a real wired toolbar/menu entry (styleQuiz)', () => {
    expect(NEW_BADGES.styleQuiz).toBeDefined()
  })
})

describe('isRecentlyIntroduced', () => {
  it('is recent when within the window on the same major.minor.patch line', () => {
    expect(isRecentlyIntroduced('0.10.0.10', '0.10.0.30', 25)).toBe(true)
    expect(isRecentlyIntroduced('0.10.0.10', '0.10.0.35', 25)).toBe(true) // exactly at window edge
  })

  it('is not recent once past the window, still on the same patch line', () => {
    expect(isRecentlyIntroduced('0.10.0.10', '0.10.0.36', 25)).toBe(false)
  })

  it('is not recent on a different major.minor.patch line, even with a small build diff', () => {
    // 0.9.0.x is a different patch line from 0.10.0.x — always stale, no
    // matter how "close" the raw build numbers look.
    expect(isRecentlyIntroduced('0.9.0.6', '0.10.0.34', 25)).toBe(false)
    expect(isRecentlyIntroduced('0.10.0.30', '0.10.1.0', 25)).toBe(false)
    expect(isRecentlyIntroduced('0.10.0.30', '0.11.0.0', 25)).toBe(false)
  })

  it('defaults to the live APP_VERSION and a 25-build window when unset', () => {
    // Version-drift-proof: an entry introduced in the running build is always
    // recent (build delta 0), whatever APP_VERSION currently is. (A previous
    // hardcoded '0.10.0.33' broke on every minor bump.)
    expect(isRecentlyIntroduced(APP_VERSION)).toBe(true)
  })
  it('treats a future introduced version (not yet shipped) as not recent', () => {
    expect(isRecentlyIntroduced('0.10.0.99', '0.10.0.36')).toBe(false)
  })
})
