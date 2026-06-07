import type { FurnitureCategory } from './types'

/**
 * One palette mapping each furniture category to a distinct colour — the single
 * source of truth shared by the walk-mode minimap dots and the printable
 * report's furnished-plan footprints + legend, so the two never drift. Hues are
 * spread for at-a-glance distinction; `others` is a neutral grey.
 */
export const CATEGORY_COLORS: Record<FurnitureCategory, string> = {
  beds: '#8b5cf6',
  seating: '#3b82f6',
  tables: '#f59e0b',
  storage: '#10b981',
  kitchen: '#ec4899',
  bathroom: '#06b6d4',
  appliances: '#ef4444',
  lighting: '#eab308',
  decor: '#a78bfa',
  textiles: '#f97316',
  outdoor: '#84cc16',
  electronics: '#0ea5e9',
  kids: '#d946ef',
  laundry: '#14b8a6',
  others: '#9ca3af',
}
