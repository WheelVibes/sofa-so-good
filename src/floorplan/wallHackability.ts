import type { PlanWall } from './types'

/**
 * R4-7 — wall demolition ("hackability") classification.
 *
 * The ONE pure classifier that maps a wall's USER-declared structural type
 * (`PlanWall.structure`) to whether it may be demolished under Singapore HDB
 * rules. Used by the live hackability overlay in the 2D plan editor and the
 * wall delete-warning — the demolition sheet (`demolitionPlanSvg.ts`) applies
 * the same policy inline.
 *
 * SG sources:
 * - HDB renovation rules — https://www.hdb.gov.sg/residential/living-in-an-hdb-flat/renovation/important-information
 *   Structural elements (reinforced-concrete walls, columns, beams, slabs) must
 *   NEVER be hacked/removed; demolishing a non-structural partition needs an
 *   HDB renovation permit.
 * - Can you hack HDB walls? — https://www.elementsid.com.sg/can-you-hack-hdb-walls/
 *   Load-bearing / RC walls are absolutely off-limits; brick / lightweight
 *   partitions are removable WITH an HDB permit; household-shelter (HS / bomb-
 *   shelter) walls are never touchable (users classify these as 'load-bearing').
 *
 * The classification is user-declared and never verified — the app cannot tell
 * a load-bearing wall from a partition from plan geometry alone.
 */

/** Demolition-permit class for a wall. */
export type HackClass = 'no' | 'permit' | 'unknown'

/**
 * Map a wall's declared `structure` to its demolition class.
 * - `'load-bearing'` / `'rc-partition'` ⇒ `'no'` — structural; demolition is
 *   NOT PERMITTED under HDB rules (never merely "needs a permit"). Household-
 *   shelter walls are declared load-bearing so they land here too.
 * - `'brick-partition'` / `'drywall'` ⇒ `'permit'` — non-structural partitions
 *   are removable WITH an HDB renovation permit.
 * - `undefined` / `'unknown'` ⇒ `'unknown'` — unclassified; advise confirming
 *   with HDB/PE before any work.
 */
export function wallHackability(structure?: PlanWall['structure']): HackClass {
  switch (structure) {
    // Structural — absolutely not permitted (HDB "important information";
    // elementsid load-bearing/RC + household-shelter guidance).
    case 'load-bearing':
    case 'rc-partition':
      return 'no'
    // Non-structural partitions — removable with an HDB renovation permit.
    case 'brick-partition':
    case 'drywall':
      return 'permit'
    default:
      return 'unknown'
  }
}

/** Short human label for a hack class (matches the demolition sheet wording). */
export function hackClassLabel(c: HackClass): string {
  switch (c) {
    case 'no':
      return 'Not permitted'
    case 'permit':
      return 'Permit required'
    default:
      return 'Unclassified'
  }
}

/** One-line legend description for a hack class. */
export function hackClassDescription(c: HackClass): string {
  switch (c) {
    case 'no':
      return 'Load-bearing / RC — demolition NOT permitted under HDB rules'
    case 'permit':
      return 'Brick / partition — removable with an HDB renovation permit'
    default:
      return 'Unclassified — confirm structure with HDB/PE before hacking'
  }
}

/**
 * Whether demolishing this wall is restricted (class `'no'`) — the wall delete
 * warning uses this to decide whether to show the "NOT PERMITTED" confirm.
 */
export function isDemolitionRestricted(structure?: PlanWall['structure']): boolean {
  return wallHackability(structure) === 'no'
}
