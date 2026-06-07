import { describe, expect, it } from 'vitest'
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAGS,
  parseFlagOverrides,
  parseStoredOverrides,
  resolveFlags,
} from './featureFlags'

describe('resolveFlags', () => {
  it('production uses registry defaults and forces devOnly flags off', () => {
    const prod = resolveFlags(false, {})
    expect(prod.report).toBe(FEATURE_FLAGS.report.default)
    expect(prod.ikeaLive).toBe(false) // devOnly
    expect(prod.livePrices).toBe(false) // devOnly
  })

  it('ignores overrides in production (a shipped build is locked to the registry)', () => {
    const prod = resolveFlags(false, { report: false, ikeaLive: true })
    expect(prod.report).toBe(true) // override ignored
    expect(prod.ikeaLive).toBe(false) // devOnly stays off even if overridden on
  })

  it('applies overrides in dev (incl. turning a devOnly flag off)', () => {
    const dev = resolveFlags(true, { report: false, ikeaLive: false })
    expect(dev.report).toBe(false)
    expect(dev.ikeaLive).toBe(false)
    // A devOnly flag defaults on in dev when not overridden.
    expect(resolveFlags(true, {}).ikeaLive).toBe(true)
  })

  it('covers every registry key', () => {
    const out = resolveFlags(true, {})
    expect(Object.keys(out).sort()).toEqual([...FEATURE_FLAG_KEYS].sort())
  })
})

describe('parseFlagOverrides (URL ?ff=)', () => {
  it('parses on/off pairs for known flags, ignoring junk', () => {
    expect(parseFlagOverrides('report:off,walkthrough:on')).toEqual({
      report: false,
      walkthrough: true,
    })
    expect(parseFlagOverrides('bogus:on,report:maybe,report:off')).toEqual({ report: false })
    expect(parseFlagOverrides('')).toEqual({})
    expect(parseFlagOverrides(null)).toEqual({})
  })
})

describe('parseStoredOverrides (localStorage JSON)', () => {
  it('keeps boolean values for known flags only', () => {
    expect(parseStoredOverrides('{"report":false,"nope":true,"budget":"x"}')).toEqual({
      report: false,
    })
  })
  it('tolerates bad JSON / empty', () => {
    expect(parseStoredOverrides('not json')).toEqual({})
    expect(parseStoredOverrides(null)).toEqual({})
  })
})
