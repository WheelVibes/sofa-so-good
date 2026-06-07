import { itemPrice } from '../../furniture/furniturePrices'
import type { GridItem } from './useUnifiedCatalog'

/** Browse-time catalog ordering. `default` keeps the curated order. */
export type SortKey = 'default' | 'name' | 'size'

export const SORT_LABEL: Record<SortKey, string> = {
  default: 'Featured',
  name: 'Name (A–Z)',
  size: 'Size (small→large)',
}

const cardName = (it: GridItem) => (it.kind === 'local' ? it.def.name : it.entry.name)

/** Footprint area (m²) for local defs; remote CC0 entries carry no footprint so
 *  they sort last under a size sort. */
const cardArea = (it: GridItem) =>
  it.kind === 'local'
    ? it.def.defaultFootprint.w * it.def.defaultFootprint.d
    : Number.POSITIVE_INFINITY

/** Sort a category listing. `default` preserves the curated order (built-ins
 *  first, then CC0). Returns a new array; never mutates the input. */
export function sortCards(cards: GridItem[], key: SortKey): GridItem[] {
  if (key === 'default') return cards
  const byName = (a: GridItem, b: GridItem) =>
    cardName(a).localeCompare(cardName(b), undefined, { sensitivity: 'base' })
  return [...cards].sort(
    key === 'name' ? byName : (a, b) => cardArea(a) - cardArea(b) || byName(a, b),
  )
}

/** Drop local items priced above `maxPrice` (a raw input string). Un-downloaded
 *  CC0 entries are free downloads, so they always pass. An empty/invalid/
 *  negative cap is a no-op (returns the input array). */
export function filterByMaxPrice(cards: GridItem[], maxPrice: string): GridItem[] {
  const cap = maxPrice.trim() === '' ? Number.NaN : Number(maxPrice)
  if (!Number.isFinite(cap) || cap < 0) return cards
  return cards.filter((it) => it.kind === 'remote' || itemPrice(it.def, it.def.category) <= cap)
}
