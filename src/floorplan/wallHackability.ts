import { levelAsPlan, planLevels } from './levels'
import { roomCategory } from './roomCategory'
import { roomBoundaryWalls } from './roomWallNames'
import type { FloorPlan, PlanWall } from './types'

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
 * because a template is not a block. That case is still recorded in `TODO.md`.
 *
 * **The household-shelter exception is now handled** — see `shelterWallIds` and
 * `establishedWallStructureInPlan`, which need room context this wall-only
 * function does not have. Prefer those whenever a plan is available.
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

/**
 * Wall ids bounding a household shelter, on any storey.
 *
 * A household shelter is the one internal partition an archetype CAN classify.
 * It is compulsory in HDB flats built from **1996** onwards; its walls, floor
 * and ceiling are cast as blast-resistant reinforced concrete, and SCDF's
 * permitted-works schedule forbids hacking, drilling or removing any part of
 * them — the prohibition is listed alongside load-bearing walls, columns and
 * beams, and unlike those it cannot be lifted by a permit or a PE endorsement.
 * (Sources cited in the v0.31.8.26 CHANGELOG entry.)
 *
 * So this stays within the module's rule that structure is only ever filled in
 * from a DECLARATION plus a documented regulation, never from geometry: the
 * declaration here is `PlanRoom.category === 'shelter'`, exactly as
 * `thickness: 'external'` is the declaration behind the envelope rule.
 *
 * Level-aware (F13): each storey's rooms are matched against ITS OWN walls, so a
 * ground-floor shelter cannot classify a wall on the storey above it.
 *
 * `roomBoundaryWalls` matches a wall within 0.25 m of a boundary edge, so a wall
 * running just outside the shelter can be caught. That over-classifies towards
 * NOT PERMITTED, which is the safe direction for demolition advice — the failure
 * it prevents (telling someone they may remove a blast-shelter wall) is not
 * comparable to the failure it risks (an over-cautious label on an adjacent
 * partition).
 */
export function shelterWallIds(plan: FloorPlan): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const level of planLevels(plan)) {
    const lp = levelAsPlan(plan, level)
    const walls = Array.isArray(lp.walls) ? lp.walls : []
    if (walls.length === 0) continue
    for (const room of Array.isArray(lp.rooms) ? lp.rooms : []) {
      if (roomCategory(room) !== 'shelter') continue
      for (const w of roomBoundaryWalls(walls, room)) ids.add(w.id)
    }
  }
  return ids
}

/**
 * `establishedWallStructure` plus the household-shelter rule, which needs room
 * context. Pass `shelterWallIds(plan)` (compute it ONCE per plan — it walks
 * every room's boundary).
 *
 * Precedence: a user declaration always wins; then the shelter rule; then the
 * envelope rule. Shelter is checked before `thickness` because it is the more
 * specific fact — a shelter wall that is also on the façade is RC either way,
 * and both classify as `'no'`, so nothing is under-reported by the order.
 */
export function establishedWallStructureInPlan(
  wall: Pick<PlanWall, 'id' | 'structure' | 'thickness'>,
  shelterWalls: ReadonlySet<string>,
): PlanWall['structure'] {
  if (wall.structure) return wall.structure
  if (shelterWalls.has(wall.id)) return 'rc-partition'
  if (wall.thickness === 'external') return 'load-bearing'
  return undefined
}
