/**
 * Pure layout maths for an open METAL RAILING rendered instead of a solid
 * wall body up to a wall's `topHeight` (`PlanWall.railing`/`WallSpec.railing`
 * — the AC-ledge parapets on the default flat). Kept render-agnostic (no
 * three/React imports) so it's unit-testable without a GPU, following the
 * `windowGrilleLayout.ts` pattern — the members below reuse that module's
 * `GrilleMemberInstance` shape (a plain box centre + size, no rotation) so a
 * consumer can feed them straight into the same `InstancedBoxes` primitive.
 *
 * Frame convention: `x` = along the wall (centred at the wall's midpoint),
 * `y` = height (0 = floor), `z` = across the wall (thickness direction). All
 * members are axis-aligned boxes — no rotation needed. This matches
 * `WallSegment`'s own body-outline frame (`wallBodyShape.ts`) directly; a
 * consumer in `wallBoxes`' x=thickness/z=length box convention (`PlanShell`'s
 * `FadeWall` loop) instead rotates the whole group by `-atan2(dz, dx)` (the
 * same derivation `WallSegment` uses) so local +X lands along the wall — see
 * `PlanShell.tsx`'s railing render block.
 */

import type { GrilleMemberInstance } from './windowGrilleLayout'
import { verticalBarOffsets } from './windowGrilleLayout'

export type { GrilleMemberInstance }

/** Top rail cross-section (m): a flat wide bar along the top, reading as a
 *  capping rail rather than a bare tube. */
const RAIL_W = 0.05
const RAIL_D = 0.05
/** End-post cross-section (m) — the two verticals at the wall's ends,
 *  inset slightly so they sit flush with the wall's outer face. */
const POST_W = 0.04
const POST_D = 0.04
const POST_INSET = 0.02
/** Baluster cross-section (m) and target pitch (m) between them. */
const BALUSTER_W = 0.015
const BALUSTER_D = 0.015
const BALUSTER_PITCH = 0.11

/**
 * One `InstancedBoxes` bucket describing an open railing spanning `length`
 * (m, along the wall) up to `height` (m, the wall's `topHeight`): a top rail,
 * two end posts, and evenly-spaced vertical balusters between them (reusing
 * `windowGrilleLayout.ts`'s bay-spacing maths via `verticalBarOffsets`, at the
 * railing's own ~0.11 m pitch). Degenerate input (`length`/`height` ≤ 0)
 * returns just the structural members that still make sense (posts collapse
 * to zero-length/height boxes rather than throwing — callers already guard
 * on a positive `topHeight`).
 */
export function railingMemberInstances(length: number, height: number): GrilleMemberInstance[] {
  const out: GrilleMemberInstance[] = []
  // Top rail — centred at the top, spanning the full length.
  out.push({
    position: [0, height - RAIL_W / 2, 0],
    size: [length, RAIL_W, RAIL_D],
  })
  // End posts — floor to the underside of the rail, inset from the wall ends.
  const postHalf = length / 2 - POST_INSET
  out.push({ position: [-postHalf, height / 2, 0], size: [POST_W, height, POST_D] })
  out.push({ position: [postHalf, height / 2, 0], size: [POST_W, height, POST_D] })
  // Balusters — interior bay boundaries between the two posts, matching the
  // window-grille bar spacing convention (pitch ~0.11 m), floor to just under
  // the rail.
  const balusterHeight = Math.max(0, height - RAIL_W)
  for (const x of verticalBarOffsets(length, BALUSTER_PITCH)) {
    out.push({
      position: [x, balusterHeight / 2, 0],
      size: [BALUSTER_W, balusterHeight, BALUSTER_D],
    })
  }
  return out
}
