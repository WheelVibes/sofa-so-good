import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { itemPrice } from '../../furniture/furniturePrices'
import {
  type CatalogFilter,
  cardSource,
  DEFAULT_CATALOG_FILTER,
  filterByFits,
  filterByMaxPrice,
  filterCatalog,
  isCatalogFilterActive,
  sortCards,
} from './catalogBrowse'
import { type GridItem, gridItemId } from './useUnifiedCatalog'

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
const stoolDef = BUILTIN_CATALOG['bar-stool']!
const sofaDef = BUILTIN_CATALOG['sofa-3seat']!
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
    const names = out.map((c) =>
      c.kind === 'local' ? c.def.name : c.kind === 'remote' ? c.entry.name : c.item.name,
    )
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)))
  })

  it('size sorts smallest footprint first; remote (no footprint) last', () => {
    const r = remote('CC0 thing')
    const out = sortCards([sofa, r, stool], 'size')
    // stool footprint < sofa footprint; remote sorts last (Infinity area).
    expect(out[0]).toBe(stool)
    expect(out[out.length - 1]).toBe(r)
  })

  it('price sorts cheapest first; free remote (price 0) leads', () => {
    const r = remote('Free CC0')
    const out = sortCards([sofa, stool, r], 'price')
    // remote is free → first; among locals, the cheaper one precedes the dearer.
    expect(out[0]).toBe(r)
    const localOrder = out.filter((c) => c.kind === 'local')
    const cheaperFirst =
      itemPrice(stoolDef, 'seating') <= itemPrice(sofaDef, 'seating')
        ? [stool, sofa]
        : [sofa, stool]
    expect(localOrder).toEqual(cheaperFirst)
  })
})

describe('filterByMaxPrice', () => {
  const cheap = Math.min(itemPrice(stoolDef, 'seating'), itemPrice(sofaDef, 'seating'))
  const expensive = Math.max(itemPrice(stoolDef, 'seating'), itemPrice(sofaDef, 'seating'))

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

describe('filterByFits (CATALOG-FITS "Fits only" filter)', () => {
  // sofa-3seat: 2.1 x 0.9m — too big for a 1 x 1m rect. bar-stool: 0.42 x
  // 0.42m — fits comfortably.
  const tinyRoom = [{ w: 1, d: 1 }]

  it('a null rects (no room being edited) is a no-op', () => {
    const input = [stool, sofa]
    expect(filterByFits(input, null)).toBe(input)
  })

  it('drops a local item that won’t fit, keeps one that does', () => {
    const out = filterByFits([stool, sofa], tinyRoom)
    expect(out).toEqual([stool])
  })

  it('never drops remote/shared entries (unresolved footprint stays "unknown")', () => {
    const r = remote('CC0 thing')
    const out = filterByFits([sofa, r], tinyRoom)
    expect(out).toContain(r)
    expect(out).not.toContain(sofa)
  })

  it('keeps everything in a spacious room', () => {
    const input = [stool, sofa]
    expect(filterByFits(input, [{ w: 5, d: 5 }])).toEqual(input)
  })
})

// A user-uploaded local def (source 'user' → the 'My items' source bucket).
const userCard = {
  kind: 'local',
  def: {
    kind: 'gltf',
    source: 'user',
    id: 'user-chair',
    name: 'My Chair',
    category: 'seating',
    assetId: 'a1',
    uploadedAt: '',
    defaultFootprint: { w: 0.5, d: 0.5, h: 0.9 },
  },
} as unknown as GridItem
// An un-imported shared-library card (→ 'My items', resolves to an ikea-* def).
const sharedCard = {
  kind: 'shared',
  item: {
    group: 'x',
    groupKey: 'x',
    name: 'Shared Table',
    type: 'Table',
    category: 'tables',
    size: '',
    series: '',
    variants: 1,
    thumbnail: '',
  },
} as unknown as GridItem
const remoteCard = remote('Remote Sofa')

describe('cardSource', () => {
  it('buckets built-in parametric defs as "builtin"', () => {
    expect(cardSource(sofa)).toBe('builtin')
    expect(cardSource(stool)).toBe('builtin')
  })
  it('buckets user uploads + shared library as "mine"', () => {
    expect(cardSource(userCard)).toBe('mine')
    expect(cardSource(sharedCard)).toBe('mine')
  })
  it('buckets remote provider cards as "cc0"', () => {
    expect(cardSource(remoteCard)).toBe('cc0')
  })
})

describe('isCatalogFilterActive', () => {
  it('the default filter is inactive', () => {
    expect(isCatalogFilterActive(DEFAULT_CATALOG_FILTER)).toBe(false)
  })
  it('any non-default facet is active', () => {
    expect(isCatalogFilterActive({ ...DEFAULT_CATALOG_FILTER, availability: 'downloaded' })).toBe(
      true,
    )
    expect(isCatalogFilterActive({ ...DEFAULT_CATALOG_FILTER, source: 'mine' })).toBe(true)
    expect(isCatalogFilterActive({ ...DEFAULT_CATALOG_FILTER, favouritesOnly: true })).toBe(true)
  })
})

describe('filterCatalog', () => {
  const cards = [sofa, userCard, sharedCard, remoteCard]
  const noFavs = new Set<string>()

  it('the default (inactive) filter is a no-op returning the same array', () => {
    expect(filterCatalog(cards, DEFAULT_CATALOG_FILTER, noFavs)).toBe(cards)
  })

  it('availability "downloaded" keeps only local cards', () => {
    const f: CatalogFilter = { ...DEFAULT_CATALOG_FILTER, availability: 'downloaded' }
    expect(filterCatalog(cards, f, noFavs)).toEqual([sofa, userCard])
  })

  it('availability "not-downloaded" keeps only remote/shared cards', () => {
    const f: CatalogFilter = { ...DEFAULT_CATALOG_FILTER, availability: 'not-downloaded' }
    expect(filterCatalog(cards, f, noFavs)).toEqual([sharedCard, remoteCard])
  })

  it('source "builtin" keeps only built-in cards', () => {
    const f: CatalogFilter = { ...DEFAULT_CATALOG_FILTER, source: 'builtin' }
    expect(filterCatalog(cards, f, noFavs)).toEqual([sofa])
  })

  it('source "mine" keeps uploads + shared', () => {
    const f: CatalogFilter = { ...DEFAULT_CATALOG_FILTER, source: 'mine' }
    expect(filterCatalog(cards, f, noFavs)).toEqual([userCard, sharedCard])
  })

  it('source "cc0" keeps remote provider cards', () => {
    const f: CatalogFilter = { ...DEFAULT_CATALOG_FILTER, source: 'cc0' }
    expect(filterCatalog(cards, f, noFavs)).toEqual([remoteCard])
  })

  it('favouritesOnly keeps only favourited ids', () => {
    const favs = new Set<string>([gridItemId(sofa)])
    const f: CatalogFilter = { ...DEFAULT_CATALOG_FILTER, favouritesOnly: true }
    expect(filterCatalog(cards, f, favs)).toEqual([sofa])
  })

  it('facets compose (AND): downloaded + builtin', () => {
    const f: CatalogFilter = {
      ...DEFAULT_CATALOG_FILTER,
      availability: 'downloaded',
      source: 'builtin',
    }
    expect(filterCatalog(cards, f, noFavs)).toEqual([sofa])
  })
})
