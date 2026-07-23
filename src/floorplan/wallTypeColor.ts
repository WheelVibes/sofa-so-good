import type { PlanWall } from './types'

/**
 * Wall-types 3D overlay (`wallTypes3d` pro flag) — pure structure→colour map,
 * shared by every 3D renderer that draws the tinted overlay jacket (the
 * default flat's `WallSegment`/`RoomShell`, custom plans' `PlanShell`/
 * `PlanRoomShell`). These are FIXED scene-space overlay colours (like the
 * placement ghost's valid/invalid red/green), not UI surface tokens — three.js
 * needs a real colour, and the overlay sits IN the 3D scene rather than on a
 * DOM surface, so a literal hex here does not violate the "no hardcoded
 * colour" UI rule (`src/ui/CLAUDE.md`), which governs DOM/CSS surfaces.
 *
 * Semantics mirror the 2D plan editor's hackability/structure treatment
 * (`wallHackability.ts`):
 * - `'load-bearing'` / `'rc-partition'` (never-hackable, ordinary structural)
 *   → danger red, matching the "NOT PERMITTED" demolition-sheet treatment.
 * - `'gable-end'` (the block's exposed external end wall, walls.jpg legend #3
 *   — also never-hackable, but visually distinct) → blue, matching the
 *   walls.jpg legend's gable chip.
 * - `'brick-partition'` / `'drywall'` (permit-required) → amber, matching the
 *   "permit" hackability class.
 * - `undefined` / `'unknown'` → `null` — no tint (nothing confidently
 *   classified to show).
 */
const WALL_TYPE_OVERLAY_COLORS: Record<
  Exclude<NonNullable<PlanWall['structure']>, 'unknown'>,
  string
> = {
  'load-bearing': '#e5484d',
  'rc-partition': '#e5484d',
  'gable-end': '#3e63dd',
  'brick-partition': '#f5a524',
  drywall: '#f5a524',
}

/** Resolve a wall's overlay tint colour, or `null` when unclassified (no tint). */
export function wallTypeOverlayColor(structure?: PlanWall['structure']): string | null {
  if (!structure || structure === 'unknown') return null
  return WALL_TYPE_OVERLAY_COLORS[structure]
}
