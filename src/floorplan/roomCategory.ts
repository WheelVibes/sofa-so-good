/**
 * Room categories (RM1 — SG-presets & room categories foundation,
 * 2026-07-19 plan). `PlanRoom.category` is the persisted, USER-declared
 * source of truth for a room's type; this module is the ONE place that
 * resolves it (explicit category wins, else infer from the room's name,
 * else `'other'`) and downmaps it to the two coarser, pre-existing
 * classifiers the rest of the app already reads:
 *
 * - `analysis/suggestions.ts`'s `RoomKind` (living/dining/bedroom/kitchen/
 *   bath/study/balcony/other) — consumed by suggestions, the catalog's
 *   room-aware landing category, and room-starter chips.
 * - `layout/autoArrange.ts`'s internal arranger kind (living/bedroom/
 *   kitchen/bath/generic) — which arrangement strategy a room gets.
 *
 * Why a NEW regex set instead of delegating to `roomKindFromName`
 * (suggestions.ts) or autoArrange's own copy: `RoomCategory` is a strict
 * REFINEMENT of those coarser buckets — it splits `bath` into `bath`/
 * `powder`, `bedroom` into `bedroom`/`masterBedroom`, and the catch-all
 * `balcony` bucket into `serviceYard`/`storeroom`/`foyer`/`balcony` — so a
 * literal delegation can't recover distinctions the coarser classifiers
 * already collapsed away. This module owns its own regex set (documented
 * below, order-sensitive: more specific patterns are checked first) as the
 * new, finer-grained source of truth; `toRoomKind`/`toArrangeKind` downmap
 * it back to the pre-existing vocabularies so every existing coarse
 * consumer keeps working unchanged when a room has no explicit category
 * (verified byte-identical against `roomKindFromName` in
 * `roomCategory.test.ts`). The pre-existing `roomKindFromName` copies in
 * `suggestions.ts`/`autoArrange.ts` are left untouched — every consumer now
 * resolves through this module (RM1 migration COMPLETE, incl. the RM1-tail
 * consumers: suggestions, roomLux, planStatistics, handoverChecklist,
 * electricalSchedule, designChatContext, resetSlice). Each honours an explicit
 * `category` and keeps its legacy name inference byte-identical; the one
 * intentional output change is that `suggestions.ts` maps serviceYard/storeroom
 * to a local non-habitable `'utility'` kind (not `'balcony'`), so a household
 * shelter no longer gets a bogus outdoor-seating suggestion.
 *
 * Pure + total, no React/store/three imports.
 */
import type { RoomKind } from '../analysis/suggestions'
import type { PlanRoom, RoomCategory } from './types'

export type { RoomCategory }

/** Human-readable label for each category, most-specific-noun-first. Used by
 *  the `RoomInspector` "Room type" Select and anywhere else a category needs
 *  a friendly name. */
export const ROOM_CATEGORY_LABELS: Record<RoomCategory, string> = {
  living: 'Living room',
  dining: 'Dining room',
  bedroom: 'Bedroom',
  masterBedroom: 'Master bedroom',
  kitchen: 'Kitchen',
  bath: 'Bathroom',
  powder: 'Powder room / WC',
  study: 'Study',
  serviceYard: 'Service yard',
  storeroom: 'Storeroom',
  balcony: 'Balcony',
  foyer: 'Foyer / entrance',
  shelter: 'Household shelter',
  other: 'Other',
}

/**
 * Room categories that need natural light to be usable as designed — the rooms a
 * daylight shortfall is a real defect in. Wet/utility/circulation rooms (bath,
 * powder, kitchen, service yard, store, foyer, balcony, other) are legitimately
 * windowless in an HDB flat.
 *
 * Lives here, with the category vocabulary, so the daylight check and the design
 * score cannot drift apart on which rooms count.
 */
export const HABITABLE_CATEGORIES: ReadonlySet<RoomCategory> = new Set<RoomCategory>([
  'living',
  'dining',
  'bedroom',
  'masterBedroom',
  'study',
])

/**
 * Infer a room's category from its name. Order matters — more specific
 * patterns are checked first so, e.g., a "Master Bedroom" resolves to
 * `masterBedroom` (not the generic `bedroom` a plain "bed" match would give)
 * and a "Household Shelter" resolves to `shelter` (not
 * `storeroom`, which it shared until v0.31.8.25 — the app could not tell a
 * blast shelter from a store room). `hall` deliberately stays `living` (HDB parlance for a
 * living/dining hall — NOT a corridor), matching `roomKindFromName`.
 * Returns `'other'` when nothing matches (never `null` — every room needs
 * SOME category once inferred, unlike the nullable coarse classifiers).
 */
export function roomCategoryFromName(name: string | undefined): RoomCategory {
  if (!name) return 'other'
  const n = name.toLowerCase()
  // Master/main/primary bedroom before the generic bedroom check below. A
  // bare "master"/"main"/"primary" with no bed/room context is too
  // ambiguous and falls through instead of guessing.
  if (/(master|main|primary)\s*(bed\s?room|bed\b)/.test(n)) return 'masterBedroom'
  if (/\b(kitchen|kitchenette|pantry)\b/.test(n)) return 'kitchen'
  // Powder / WC (half-bath) before the general bath check.
  if (/(powder|\bwc\b)/.test(n)) return 'powder'
  if (/(bath|toilet|en-?suite|shower)/.test(n)) return 'bath'
  if (/(stud(y|io\b)|home\s?office|\boffice\b|\bden\b|library)/.test(n)) return 'study'
  // Foyer / entrance / corridor — before the generic living check (a "Hall"
  // still reads as living per HDB parlance, per module doc).
  if (/(foyer|\bentry\b|entrance|corridor|hallway)/.test(n)) return 'foyer'
  // Service yard / utility (washer, drying rack) before storeroom.
  if (/(\byard\b|service|utility|laundry)/.test(n)) return 'serviceYard'
  // Household shelter (the HDB civil-defence blast shelter) BEFORE the
  // storeroom check — it is a reinforced-concrete enclosure whose walls may not
  // be altered and which is windowless by design, not a store room you may
  // re-line or open up. `hs` is the standard abbreviation on HDB plans.
  if (/(household\s*shelter|\bshelter\b|\bhs\b)/.test(n)) return 'shelter'
  // Storeroom.
  if (/(\bstore\b|storeroom)/.test(n)) return 'storeroom'
  if (/(balcony|ledge|patio|\bbin\b)/.test(n)) return 'balcony'
  // 'living' is checked before 'dining' so a combined "Living / Dining" room
  // reads as living (the superset use) rather than dining-only.
  if (/(living|lounge|family\s?room|great\s?room|hall)/.test(n)) return 'living'
  if (/(dining|\bdine\b)/.test(n)) return 'dining'
  if (/(bed\s?room|\bbed\b|nursery|guest)/.test(n)) return 'bedroom'
  return 'other'
}

/** Resolve a room's category: the explicit, user-set `category` wins; else
 *  infer from `name`; `roomCategoryFromName` never returns undefined, so
 *  this function is total. */
export function roomCategory(room: Pick<PlanRoom, 'name' | 'category'>): RoomCategory {
  return room.category ?? roomCategoryFromName(room.name)
}

/** Downmap a `RoomCategory` to the coarser `analysis/suggestions.ts`
 *  `RoomKind` every suggestion/catalog/starter consumer already reads.
 *  `masterBedroom`→`bedroom`, `powder`→`bath`, `serviceYard`/`storeroom`/
 *  `shelter`/`foyer`→`balcony` (the classifier's existing non-habitable/utility
 *  bucket — see `roomAwareCategories.ts`'s module doc for why `balcony`
 *  already doubles as that bucket). Every other category maps 1:1. */
export function toRoomKind(category: RoomCategory): RoomKind {
  switch (category) {
    case 'masterBedroom':
      return 'bedroom'
    case 'powder':
      return 'bath'
    case 'serviceYard':
    case 'storeroom':
    case 'shelter':
    case 'foyer':
      return 'balcony'
    default:
      return category
  }
}

/** Arranger kind used internally by `layout/autoArrange.ts` (a narrower,
 *  4-habitable-kind + generic union). `living`/`dining`→`living` (the
 *  arranger treats a dining room as living-kind and centres the table),
 *  `masterBedroom`→`bedroom`, `powder`→`bath`, `kitchen`→`kitchen`,
 *  everything else (study/serviceYard/storeroom/balcony/foyer/other)→
 *  `generic`. */
export function toArrangeKind(
  category: RoomCategory,
): 'living' | 'bedroom' | 'kitchen' | 'bath' | 'generic' {
  switch (category) {
    case 'living':
    case 'dining':
      return 'living'
    case 'masterBedroom':
    case 'bedroom':
      return 'bedroom'
    case 'powder':
    case 'bath':
      return 'bath'
    case 'kitchen':
      return 'kitchen'
    default:
      return 'generic'
  }
}
