import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { itemPrice } from '../../furniture/furniturePrices'
import { filterByMaxPrice, sortCards } from './catalogBrowse'
import type { GridItem } from './useUnifiedCatalog'

const local = (id: string): GridItem => ({ kind: 'local', def: BUILTIN_CATALOG[id]! })
const remote = (name: string): GridItem => ({
  kind: 'remote',
  entry: {
    provider: 'polyhaven',
    slug: name.toLowerCase(),
    kind: 'furniture',
    name,
    category: 'seating',
    thumbUrl: '',
    resolutions: [],
    attribution: '',
    sourceUrl: '',
  },
})

// Two builtin seating defs with clearly different footprints + prices.
const stool = local('bar-stool')
const sofa = local('sofa-3seat')

describe('sortCards', () => {
  it('default preserves input order (no mutation)', () => {
    const input = [sofa, stool]
    const out = sortCards(input, 'default')
    expect(out).toBe(input) // same reference — untouched
  })

  it('name sorts case-insensitively, remote included', () => {
    const z = remote('Zzz chair')
    const a = remote('Aaa chair')
    const out = sortCards([sofa, z, stool, a], 'name')
    const names = out.map((c) => (c.kind === 'local' ? c.def.name : c.entry.name))
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)))
  })

  it('size sorts smallest footprint first; remote (no footprint) last', () => {
    const r = remote('CC0 thing')
    const out = sortCards([sofa, r, stool], 'size')
    // stool footprint < sofa footprint; remote sorts last (Infinity area).
    expect(out[0]).toBe(stool)
    expect(out[out.length - 1]).toBe(r)
  })
})

describe('filterByMaxPrice', () => {
  const cheap = Math.min(itemPrice(stool.def!, 'seating'), itemPrice(sofa.def!, 'seating'))
  const expensive = Math.max(itemPrice(stool.def!, 'seating'), itemPrice(sofa.def!, 'seating'))

  it('empty cap is a no-op', () => {
    const input = [stool, sofa]
    expect(filterByMaxPrice(input, '')).toBe(input)
  })

  it('drops local items above the cap, keeps cheaper + remote', () => {
    const r = remote('Free CC0')
    const cap = String((cheap + expensive) / 2)
    const out = filterByMaxPrice([stool, sofa, r], cap)
    expect(out).toContain(r) // free remote always passes
    expect(out.length).toBe(2) // the pricier local is dropped
  })

  it('a zero cap drops priced local items but keeps free remote', () => {
    const r = remote('Free CC0')
    const out = filterByMaxPrice([stool, sofa, r], '0')
    expect(out).toEqual([r])
  })

  it('invalid / negative caps are no-ops', () => {
    const input = [stool, sofa]
    expect(filterByMaxPrice(input, 'abc')).toBe(input)
    expect(filterByMaxPrice(input, '-5')).toBe(input)
  })
})
