import { describe, expect, it } from 'vitest'
import {
  CUSTOM_META_KEY_MAX,
  CUSTOM_META_MAX_ENTRIES,
  CUSTOM_META_VALUE_MAX,
  clampCustomMetaEntries,
} from './itemMetaLimits'

describe('clampCustomMetaEntries', () => {
  it('trims + keeps well-formed entries', () => {
    expect(clampCustomMetaEntries([{ key: '  Fabric  ', value: '  Linen  ' }])).toEqual([
      { key: 'Fabric', value: 'Linen' },
    ])
  })

  it('drops an entry with a blank key or blank value', () => {
    expect(
      clampCustomMetaEntries([
        { key: '   ', value: 'x' },
        { key: 'k', value: '   ' },
        { key: 'ok', value: 'ok' },
      ]),
    ).toEqual([{ key: 'ok', value: 'ok' }])
  })

  it('caps the total at CUSTOM_META_MAX_ENTRIES, earliest entries win', () => {
    const many = Array.from({ length: CUSTOM_META_MAX_ENTRIES + 5 }, (_, i) => ({
      key: `k${i}`,
      value: `v${i}`,
    }))
    const out = clampCustomMetaEntries(many)
    expect(out).toHaveLength(CUSTOM_META_MAX_ENTRIES)
    expect(out?.[0]).toEqual({ key: 'k0', value: 'v0' })
    expect(out?.[CUSTOM_META_MAX_ENTRIES - 1]).toEqual({
      key: `k${CUSTOM_META_MAX_ENTRIES - 1}`,
      value: `v${CUSTOM_META_MAX_ENTRIES - 1}`,
    })
  })

  it('truncates an over-long key/value instead of dropping the entry', () => {
    const out = clampCustomMetaEntries([
      { key: 'k'.repeat(CUSTOM_META_KEY_MAX + 20), value: 'v'.repeat(CUSTOM_META_VALUE_MAX + 200) },
    ])
    expect(out).toHaveLength(1)
    expect(out?.[0]?.key.length).toBe(CUSTOM_META_KEY_MAX)
    expect(out?.[0]?.value.length).toBe(CUSTOM_META_VALUE_MAX)
  })

  it('allows duplicate keys (last-one-wins is a CSV/report concern, not a clamp one)', () => {
    const out = clampCustomMetaEntries([
      { key: 'Color', value: 'Blue' },
      { key: 'Color', value: 'Green' },
    ])
    expect(out).toEqual([
      { key: 'Color', value: 'Blue' },
      { key: 'Color', value: 'Green' },
    ])
  })

  it('drops entries that are the wrong shape without throwing', () => {
    expect(
      clampCustomMetaEntries(['not-an-object', 42, null, { key: 1, value: 2 }]),
    ).toBeUndefined()
  })

  it('returns undefined for a non-array input', () => {
    expect(clampCustomMetaEntries('nope')).toBeUndefined()
    expect(clampCustomMetaEntries(undefined)).toBeUndefined()
    expect(clampCustomMetaEntries(null)).toBeUndefined()
    expect(clampCustomMetaEntries({})).toBeUndefined()
  })

  it('returns undefined for an empty array (keeps saves lean)', () => {
    expect(clampCustomMetaEntries([])).toBeUndefined()
  })
})
