import { describe, expect, it } from 'vitest'
import { entryFromMeta } from './build-library-index.mjs'

const meta = {
  group_key: 'alex-desk-100x48',
  product_name: 'ALEX Desk',
  type_name: 'Desk',
  design: { category: 'desk' },
  size: '100x48',
  series: 'ALEX',
  variants: [{ glb: 'white.glb', main_image: 'white.jpg', price_numeral: 199, currency: 'SGD' }],
}

describe('entryFromMeta', () => {
  it('carries group_key as groupKey', () => {
    const entry = entryFromMeta('alex-desk-100x48', meta)
    expect(entry).not.toBeNull()
    expect(entry.groupKey).toBe('alex-desk-100x48')
    expect(entry.variants).toBe(1)
    expect(entry.thumbnail).toBe('white.jpg')
  })

  it('falls back to the directory group when group_key is missing', () => {
    const { group_key, ...noKey } = meta
    const entry = entryFromMeta('fallback-dir', noKey)
    expect(entry.groupKey).toBe('fallback-dir')
  })

  it('returns null when no variant has a GLB', () => {
    expect(entryFromMeta('x', { ...meta, variants: [{ main_image: 'a.jpg' }] })).toBeNull()
  })
})
