/**
 * Room-aware catalog defaults (CATALOG-ROOMAWARE, 2026-07-03 core-loop parity
 * audit). Pure mapping from a room's coarse kind (`analysis/suggestions.ts`
 * `RoomKind` — the same classifier `roomKindFromName` already uses for
 * suggestions/handover/electrical) to the `FurnitureCategory` values a shopper
 * editing that room actually wants first, instead of always landing on the
 * curated `FURNITURE_CATEGORIES` order (today's flat default).
 *
 * No new vocabulary: reuses the existing `RoomKind` and `FurnitureCategory`
 * types. Kinds with no entry below (dining/study/balcony/other, plus a `null`
 * kind for "no room being edited") fall through to the untouched
 * `FURNITURE_CATEGORIES` order — the current behaviour.
 */
import type { RoomKind } from '../../analysis/suggestions'
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../../furniture/types'

/** Ordered, most-relevant-first categories per room kind. Only the kinds worth
 *  reordering for are listed; an omitted kind means "no reorder" (see module
 *  doc). Order within each list is itself a priority — the first entry is
 *  what the room's editor should land on when it has any cards. */
const ROOM_KIND_CATEGORIES: Partial<Record<RoomKind, readonly FurnitureCategory[]>> = {
  bedroom: ['beds', 'storage', 'textiles', 'lighting', 'decor'],
  kitchen: ['appliances', 'kitchen', 'storage', 'lighting'],
  bath: ['bathroom', 'storage', 'textiles'],
  living: ['seating', 'tables', 'electronics', 'lighting', 'decor'],
  dining: ['tables', 'seating', 'lighting', 'decor'],
  study: ['tables', 'storage', 'seating', 'electronics', 'lighting'],
  // `balcony` is the classifier's bucket for BOTH balconies AND service /
  // utility yards (see `roomKindFromName` — "yard/service/utility/store" all
  // resolve here; there is no distinct service-yard `RoomKind` and inventing
  // one is forbidden). Both are where SG pet compliance + smelly gear live —
  // window/balcony safety mesh, litter cabinets, feeding/toy storage — so
  // `pets` is surfaced prominently (right after `outdoor`, ahead of storage).
  balcony: ['outdoor', 'pets', 'storage', 'laundry'],
}

/** The categories most relevant to `kind`, most-relevant-first. Empty for an
 *  unmapped kind (including `null` — "no room being edited"). Pure, total. */
export function relevantCategoriesForRoomKind(kind: RoomKind | null): readonly FurnitureCategory[] {
  if (!kind) return []
  return ROOM_KIND_CATEGORIES[kind] ?? []
}

/**
 * Full ordering of every `FurnitureCategory`: the room's relevant categories
 * first (in their priority order), then every remaining category in its
 * normal curated `FURNITURE_CATEGORIES` order. An unmapped/`null` kind
 * returns `FURNITURE_CATEGORIES` unchanged — the sensible fallback for an
 * unknown room kind or the whole-flat (no room) view. Pure, total; never
 * drops or duplicates a category.
 */
export function orderCategoriesForRoomKind(kind: RoomKind | null): readonly FurnitureCategory[] {
  const relevant = relevantCategoriesForRoomKind(kind)
  if (relevant.length === 0) return FURNITURE_CATEGORIES
  const relevantSet = new Set(relevant)
  const rest = FURNITURE_CATEGORIES.filter((c) => !relevantSet.has(c))
  return [...relevant, ...rest]
}

/**
 * The category the catalog should land on for `kind`: the first category (in
 * room-relevance order, then the curated fallback order) that actually has at
 * least one card per `counts`. Falls back to `fallback` when nothing in the
 * catalog has any cards (e.g. an empty/loading catalog) — callers typically
 * pass the same "first non-empty category" fallback used for the flat
 * default, so an empty relevant category never lands on a dead tab.
 */
export function defaultCategoryForRoomKind(
  kind: RoomKind | null,
  counts: Partial<Record<FurnitureCategory, number>>,
  fallback: FurnitureCategory,
): FurnitureCategory {
  const order = orderCategoriesForRoomKind(kind)
  return order.find((c) => (counts[c] ?? 0) > 0) ?? fallback
}
