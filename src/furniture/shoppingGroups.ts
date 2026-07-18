import { itemPrice } from './furniturePrices'
import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
  type FurnitureDef,
  type FurnitureItem,
} from './types'

/** One shopping-list line: a distinct def (+ IKEA variant) with a count + unit price. */
export interface Line {
  defId: string
  name: string
  count: number
  each: number
}

export interface ShoppingGroup {
  cat: FurnitureCategory
  lines: Line[]
  subtotal: number
}

/**
 * Build the budget/shopping breakdown from placed items: lines grouped by
 * category (distinct IKEA finishes priced + counted separately), each category's
 * subtotal, the grand total, and the item count. Categories render in the
 * canonical `FURNITURE_CATEGORIES` order; lines sort by line-total desc. Pure —
 * the single source of truth for the Budget panel's main list + total.
 */
export function buildShoppingGroups(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): { groups: ShoppingGroup[]; total: number; count: number } {
  const byCat = new Map<FurnitureCategory, Map<string, Line>>()
  let total = 0
  let count = 0
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const cat = def.category
    const variant = typeof it.props.variant === 'string' ? it.props.variant : undefined
    const each = itemPrice(def, cat, variant, it.meta?.price)
    total += each
    count += 1
    if (!byCat.has(cat)) byCat.set(cat, new Map())
    const lines = byCat.get(cat)!
    // A custom price override (ITEM-META) joins the grouping key too — two
    // instances of the same def/variant with different overridden prices must
    // stay separate lines rather than one line's `each` silently masking the
    // other's real price.
    let lineKey = variant ? `${it.defId}::${variant}` : it.defId
    if (it.meta?.price !== undefined) lineKey += `::price:${it.meta.price}`
    const existing = lines.get(lineKey)
    if (existing) existing.count += 1
    else lines.set(lineKey, { defId: it.defId, name: def.name, count: 1, each })
  }
  const groups = FURNITURE_CATEGORIES.filter((c) => byCat.has(c)).map((c) => {
    const lines = [...byCat.get(c)!.values()].sort((a, b) => b.each * b.count - a.each * a.count)
    const subtotal = lines.reduce((s, l) => s + l.each * l.count, 0)
    return { cat: c, lines, subtotal }
  })
  return { groups, total, count }
}
