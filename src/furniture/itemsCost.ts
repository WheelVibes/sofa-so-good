import { itemPrice } from './furniturePrices'
import type { FurnitureDef, FurnitureItem } from './types'

/**
 * Sum the estimated price of a set of placed items (IKEA variant-aware via
 * `props.variant`). Unknown def ids are skipped. The single source of truth for
 * "what does this set of items cost?" — shared by the budget HUD, the inspector
 * price totals, and the room-editor caption, so they can never drift.
 */
export function itemsCost(items: FurnitureItem[], catalog: Record<string, FurnitureDef>): number {
  let sum = 0
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    const variant = typeof it.props.variant === 'string' ? it.props.variant : undefined
    sum += itemPrice(def, def.category, variant)
  }
  return sum
}
