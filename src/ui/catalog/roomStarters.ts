/**
 * Room-starter "essentials" (roomStarters, UX-research pick #5). The pure
 * mapping from a room's coarse kind (`analysis/suggestions.ts` `RoomKind` — the
 * same classifier `roomKindFromName` / the room-aware catalog default already
 * use) to a short, ordered list of the KEY ANCHOR pieces a shopper starting an
 * empty room of that kind almost always wants first.
 *
 * The `EmptyRoomHint` empty-state renders one tap-to-add chip per id here, so a
 * Simple-tier user gets concrete starting help (the analytical `suggestions.ts`
 * rule set is Pro-only). Each id MUST resolve in `BUILTIN_CATALOG` — verified by
 * `roomStarters.test.ts`.
 *
 * No new vocabulary: reuses the existing `RoomKind` (per `src/ui/CLAUDE.md`'s
 * "don't invent a new room-kind taxonomy" rule). Kinds with no entry — `balcony`
 * (the classifier's service/utility/yard bucket) and `other`, plus a `null` kind
 * for "no room being edited" — return `[]`, so the empty-state keeps its plain
 * "open the catalog" prompt instead of showing chips.
 */
import type { RoomKind } from '../../analysis/suggestions'

/**
 * Ordered anchor-piece def ids per room kind (first = the primary anchor). Only
 * the habitable kinds worth starting for are listed; an omitted kind means "no
 * chips". Every id is a real `BUILTIN_CATALOG` entry.
 */
const ROOM_KIND_STARTERS: Partial<Record<RoomKind, readonly string[]>> = {
  living: ['sofa-3seat', 'tv-console', 'coffee-table'],
  bedroom: ['bed-queen', 'wardrobe-3door', 'nightstand'],
  kitchen: ['kitchen-counter-l', 'refrigerator', 'stove'],
  bath: ['toilet', 'bathroom-sink', 'shower'],
  dining: ['dining-table-4', 'dining-chair'],
  study: ['desk', 'office-chair', 'bookshelf'],
}

/** The anchor-piece def ids to offer as starter chips for `kind`, in priority
 *  order. Empty for an unmapped kind (`balcony`/`other`) or `null` ("no room").
 *  Pure, total. */
export function starterAnchorsForRoomKind(kind: RoomKind | null): readonly string[] {
  if (!kind) return []
  return ROOM_KIND_STARTERS[kind] ?? []
}
