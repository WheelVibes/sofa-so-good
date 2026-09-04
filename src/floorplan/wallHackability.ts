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
 * - `'load-bearing'` / `'rc-partition'` / `'gable-end'` ⇒ `'no'` — structural;
 *   demolition is NOT PERMITTED under HDB rules (never merely "needs a
 *   permit"). Household-shelter walls are declared load-bearing so they land
 *   here too; `'gable-end'` is the block's exposed external end wall
 *   (walls.jpg legend #3) — reinforced-concrete and structural exactly like
 *   `'load-bearing'`, just tagged separately so rendering can draw its
 *   distinct lining symbol.
 * - `'brick-partition'` / `'drywall'` ⇒ `'permit'` — non-structural partitions
 *   are removable WITH an HDB renovation permit.
 * - `undefined` / `'unknown'` ⇒ `'unknown'` — unclassified; advise confirming
 *   with HDB/PE before any work.
 */
export function wallHackability(structure?: PlanWall['structure']): HackClass {
  switch (structure) {
    // Structural — absolutely not permitted (HDB "important information";
    // elementsid load-bearing/RC + household-shelter guidance). Gable-end is
    // the block's structural exposed end wall — equally never-hackable.
    case 'load-bearing':
    case 'rc-partition':
    case 'gable-end':
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
 * The structure a wall's own AUTHORED properties establish, when nobody has
 * declared one (v0.31.8.4).
 *
 * All 19 shipped TEMPLATES left `structure` unset on every wall (zero
 * occurrences in `templates.ts`), so the hacking-plan feature reported
 * "Unclassified" for an entire flat — including its facade, which is the one
 * wall class HDB is unambiguous about: "the external walls of your HDB flat
 * belong to HDB and cannot be hacked or modified". Reporting that as unknown is
 * not caution, it is a missing fact.
 *
 * The curated default flat is the exception and the precedent: `apartment/
 * constants.ts` already declares its facade and household-shelter ring
 * `'load-bearing'`, and its own header calls tagging mixed external facades that
 * way "deliberately conservative". This function extends that existing
 * convention to the templates and to user-drawn plans rather than inventing one.
 *
 * **This reads `thickness`, which is a DECLARATION, not geometry.** The
 * distinction matters and is the reason this function is allowed to exist at
 * all: `PlanWall.thickness: 'external' | 'internal'` is an authored statement
 * that a wall is the building's envelope, so mapping it to a documented HDB
 * rule about envelopes is a lookup. Deriving structure from a wall's measured
 * THICKNESS IN MM would be the opposite — sources do say "structural walls are
 * typically 150 mm or thicker, partition walls 75-100 mm", but `structure`'s own
 * docstring records why that must not be used: a non-structural precast /
 * Ferrolite partition and a load-bearing wall can be identical on plan, and
 * that confusion is a documented HDB hacking-plan failure mode. A thickness
 * heuristic would manufacture confident wrong answers for exactly the walls
 * people get hurt by getting wrong.
 *
 * **A user declaration always wins**, including a declaration that an external
 * wall is something else — this only fills a blank.
 *
 * **Internal partitions stay `undefined` deliberately, and that is not
 * laziness.** For a generic flat-TYPE archetype there is no single correct
 * answer: the structural layout of a 4-room flat differs by block and by
 * construction era, so an official per-block plan cannot classify a template,
 * because a template is not a block. Household-shelter walls ARE universally RC
 * (post-1997 flats), but the app has no `'shelter'` room category to recognise
 * one without guessing from its name. Both are recorded in `TODO.md`.
 */
export function establishedWallStructure(
  wall: Pick<PlanWall, 'structure' | 'thickness'>,
): PlanWall['structure'] {
  if (wall.structure) return wall.structure
  // Not 'gable-end': that is specifically the block's exposed END wall, which
  // cannot be told apart from any other facade wall here. It stays a user
  // declaration. Both classify as `'no'` anyway, so nothing is under-reported.
  if (wall.thickness === 'external') return 'load-bearing'
  return undefined
}

/**
 * Whether demolishing this wall is restricted (class `'no'`) — the wall delete
 * warning uses this to decide whether to show the "NOT PERMITTED" confirm.
 */
export function isDemolitionRestricted(structure?: PlanWall['structure']): boolean {
  return wallHackability(structure) === 'no'
}
