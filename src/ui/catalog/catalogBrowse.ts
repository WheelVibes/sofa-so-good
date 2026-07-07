import { itemFitsRoom, type RoomFreeRect } from '../../catalog/roomFit'
import { itemPrice } from '../../furniture/furniturePrices'
import { type GridItem, gridItemId } from './useUnifiedCatalog'

/** Browse-time catalog ordering. `default` keeps the curated order. */
export type SortKey = 'default' | 'name' | 'size' | 'price'

export const SORT_LABEL: Record<SortKey, string> = {
  default: 'Featured',
  name: 'Name (A–Z)',
  size: 'Size (small→large)',
  price: 'Price (low→high)',
}

const cardName = (it: GridItem) =>
  it.kind === 'local' ? it.def.name : it.kind === 'remote' ? it.entry.name : it.item.name

/** Footprint area (m²) for local defs; remote CC0 entries + un-imported shared
 *  library items carry no footprint yet, so they sort last under a size sort. */
const cardArea = (it: GridItem) =>
  it.kind === 'local'
    ? it.def.defaultFootprint.w * it.def.defaultFootprint.d
    : Number.POSITIVE_INFINITY

/** Estimated price: local defs from the price model, shared items from the
 *  manifest price (0 when unknown), un-downloaded CC0 entries are free (0). */
const cardPrice = (it: GridItem) =>
  it.kind === 'local'
    ? itemPrice(it.def, it.def.category)
    : it.kind === 'shared'
      ? (it.item.price ?? 0)
      : 0

/** Sort a category listing. `default` preserves the curated order (built-ins
 *  first, then CC0). Returns a new array; never mutates the input. */
export function sortCards(cards: GridItem[], key: SortKey): GridItem[] {
  if (key === 'default') return cards
  const byName = (a: GridItem, b: GridItem) =>
    cardName(a).localeCompare(cardName(b), undefined, { sensitivity: 'base' })
  if (key === 'name') return [...cards].sort(byName)
  if (key === 'price') return [...cards].sort((a, b) => cardPrice(a) - cardPrice(b) || byName(a, b))
  return [...cards].sort((a, b) => cardArea(a) - cardArea(b) || byName(a, b))
}

/** Drop items priced above `maxPrice` (a raw input string). Un-downloaded CC0
 *  entries are free downloads, so they always pass; shared library items filter
 *  by their manifest price (a missing price passes). An empty/invalid/negative
 *  cap is a no-op (returns the input array). */
export function filterByMaxPrice(cards: GridItem[], maxPrice: string): GridItem[] {
  const cap = maxPrice.trim() === '' ? Number.NaN : Number(maxPrice)
  if (!Number.isFinite(cap) || cap < 0) return cards
  return cards.filter((it) => {
    if (it.kind === 'remote') return true
    if (it.kind === 'shared') return it.item.price == null || it.item.price <= cap
    return itemPrice(it.def, it.def.category) <= cap
  })
}

/** Availability facet: whether a card is already a downloaded/local def or an
 *  un-downloaded remote/shared entry. */
export type AvailabilityFilter = 'all' | 'downloaded' | 'not-downloaded'

/** Source facet, derived from `def.source` / card kind:
 *  - `builtin` — the curated app catalog (parametric primitives + bundled/local GLBs)
 *  - `mine`    — user uploads/imports (`source:'user'`/`'ikea'`, incl. `ikea-*`, and
 *                the not-yet-imported shared-library cards that resolve to them)
 *  - `cc0`     — the CC0 online library (remote provider cards + resolved `remote`
 *                defs + downloadable-content pack defs) */
export type SourceFilter = 'all' | 'builtin' | 'mine' | 'cc0'

/** Catalog browse filter (component-local + ephemeral — never persisted). */
export interface CatalogFilter {
  availability: AvailabilityFilter
  source: SourceFilter
  favouritesOnly: boolean
}

export const DEFAULT_CATALOG_FILTER: CatalogFilter = {
  availability: 'all',
  source: 'all',
  favouritesOnly: false,
}

/** True when the filter narrows anything (drives the icon's active dot + reset). */
export function isCatalogFilterActive(f: CatalogFilter): boolean {
  return f.availability !== 'all' || f.source !== 'all' || f.favouritesOnly
}

/** Bucket a card into a {@link SourceFilter} source group. */
export function cardSource(it: GridItem): Exclude<SourceFilter, 'all'> {
  if (it.kind === 'remote') return 'cc0'
  if (it.kind === 'shared') return 'mine'
  const def = it.def
  if (def.kind === 'parametric') return 'builtin'
  switch (def.source) {
    case 'user':
    case 'ikea':
      return 'mine'
    case 'remote':
    case 'pack':
      return 'cc0'
    default: // 'builtin' | 'local'
      return 'builtin'
  }
}

/** Apply the catalog browse {@link CatalogFilter} to a grid listing. Pure; returns
 *  the input array unchanged when the filter is inactive (a no-op fast path).
 *  `favouriteIds` is the set of `gridItemId`s currently favourited (only consulted
 *  when `favouritesOnly` is set). */
export function filterCatalog(
  cards: GridItem[],
  filter: CatalogFilter,
  favouriteIds: ReadonlySet<string>,
): GridItem[] {
  if (!isCatalogFilterActive(filter)) return cards
  return cards.filter((it) => {
    if (filter.availability === 'downloaded' && it.kind !== 'local') return false
    if (filter.availability === 'not-downloaded' && it.kind === 'local') return false
    if (filter.source !== 'all' && cardSource(it) !== filter.source) return false
    if (filter.favouritesOnly && !favouriteIds.has(gridItemId(it))) return false
    return true
  })
}

/** Drop items flagged `'wont-fit'` for the room being edited (CATALOG-FITS
 *  "Fits only" filter). Remote/shared entries carry no resolved footprint
 *  before import, so they're never hidden (a missing-data "unknown" always
 *  passes, matching `itemFitsRoom`'s "never a false won't-fit" contract). A
 *  `null` `rects` (no room being edited) is a no-op — returns the input array. */
export function filterByFits(cards: GridItem[], rects: RoomFreeRect[] | null): GridItem[] {
  if (!rects || rects.length === 0) return cards
  return cards.filter(
    (it) => it.kind !== 'local' || itemFitsRoom(it.def.defaultFootprint, rects) !== 'wont-fit',
  )
}
