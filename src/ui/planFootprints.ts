/**
 * Shared top-down furniture footprints for the plan renderers — the ONE
 * resolver the report plan diagram, the drawing set's floor plan and the plan
 * SVG export all read from (formerly three identical inline copies).
 *
 * Uses `itemFootprintParts`, the shape-aware resolver collision already relies
 * on, rather than the single enclosing OBB `itemFootprint` returns. A def with
 * a `footprintParts` convex decomposition (round/oval tables, L-shaped
 * seating) therefore draws as the union of its parts instead of a rectangle
 * covering bbox corners the item never occupies — the plan now shows the same
 * shape the accessibility/clearance checks measure against. Defs WITHOUT parts
 * are unaffected: `itemFootprintParts` returns `[itemFootprint(...)]`, the
 * exact previous polygon.
 *
 * Pure (no store, no three, no DOM) → unit-testable directly.
 */

import { obbCorners } from '../collision/obb'
import { itemFootprintParts } from '../collision/placement'
import { CATEGORY_COLORS } from '../furniture/categoryColors'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

/** One drawn polygon: world-metre corners + the category tint. */
export interface PlanFootprint {
  corners: [number, number][]
  fill: string
}

/**
 * Top-down polygons for `items`, one per footprint part (so a single item may
 * contribute several). A def missing from the catalog or lacking a
 * `defaultFootprint` is skipped — a malformed def must not crash a whole
 * report/sheet.
 */
export function planFootprints(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): PlanFootprint[] {
  return items.flatMap((it) => {
    const def = catalog[it.defId]
    if (!def?.defaultFootprint) return []
    const fill = CATEGORY_COLORS[def.category]
    return itemFootprintParts(it, def).map((part) => ({ corners: obbCorners(part), fill }))
  })
}
