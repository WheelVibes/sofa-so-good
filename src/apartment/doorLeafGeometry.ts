/**
 * Pure leaf-placement maths for the multi-leaf door styles — the single source
 * of truth for WHERE each leaf sits inside its opening, shared by the curated
 * flat's {@link Door} and the custom-plan {@link PlanDoorLeaf} so the two
 * renderers can't drift apart.
 *
 * The invariant every helper here exists to protect: **a closed door fully
 * covers its opening.** A leaf placed a half-leaf off its hinge leaves a
 * see-through slice of the doorway (the bifold's inner leaf did exactly that —
 * it was centred ON the fold hinge instead of a half-leaf beyond it, so a
 * closed bifold covered only 3/4 of its opening).
 *
 * All offsets are in the door's local along-wall frame: `0` at the hinge jamb,
 * growing by `direction` (+1 when the door hinges at the wall start, −1 at the
 * end) toward the free jamb.
 */

/** Where a bifold's two half-width leaves sit, in the hinge-local frame. */
export interface BifoldLeafFrame {
  /** Each leaf's width (m) — half the opening. */
  halfWidth: number
  /** Centre of the outer leaf (hinged at the jamb). */
  outerCentre: number
  /** Mid-fold hinge — the outer leaf's far edge, the inner leaf's pivot. */
  foldHinge: number
  /** Centre of the inner leaf, **relative to `foldHinge`** (its parent group). */
  innerCentre: number
}

/**
 * Bifold leaf placement: two half-width leaves, the outer hinged at the jamb,
 * the inner hinged at the outer's far edge. Together they span the full
 * opening when closed.
 */
export function bifoldLeafFrame(width: number, direction: 1 | -1): BifoldLeafFrame {
  const halfWidth = width / 2
  return {
    halfWidth,
    outerCentre: (direction * halfWidth) / 2,
    foldHinge: direction * halfWidth,
    // Relative to the fold hinge — the same half-leaf offset the outer leaf has
    // from the jamb. Omitting it (leaf centred on the pivot) is what left a
    // quarter-width gap at the free jamb.
    innerCentre: (direction * halfWidth) / 2,
  }
}

/**
 * How far past each jamb + the head a CLOSED sliding leaf reaches (m). A slider
 * hangs proud of the wall (barn-door style), so a slab sized exactly to the
 * opening shows a sliver of the gap at any oblique view angle — parallax across
 * the standoff. Real bypass/barn sliders are made oversize for precisely this
 * reason; ~40 mm of overlap kills the sliver at any realistic walk-through
 * angle without reading as an obviously outsized panel.
 */
export const SLIDING_LEAF_OVERLAP = 0.04

/** Gap (m) between the wall face and the sliding leaf's near face. Keeps the
 *  parked leaf legible against the adjacent wall while staying tight enough
 *  that the closed leaf occludes the opening from oblique angles (it clears the
 *  12 mm-proud skirting). */
export const SLIDING_LEAF_STANDOFF = 0.03

export interface SlidingLeafFrame {
  /** Leaf width (m) — the opening plus an overlap at each jamb. */
  width: number
  /** Leaf height (m) — the opening plus an overlap at the head (the foot stays
   *  on the sill so the leaf never sinks through the floor). */
  height: number
  /** Leaf centre height above the sill. */
  yCentre: number
  /** Along-wall travel (m) from closed to fully parked — the leaf's own width,
   *  so an open leaf clears the whole opening including its overlaps. */
  travel: number
}

/** Sliding leaf sizing: oversize the slab past the jambs + head so the closed
 *  door reads solid despite hanging proud of the wall. */
export function slidingLeafFrame(openingWidth: number, openingHeight: number): SlidingLeafFrame {
  const width = openingWidth + SLIDING_LEAF_OVERLAP * 2
  const height = openingHeight + SLIDING_LEAF_OVERLAP
  return { width, height, yCentre: height / 2, travel: width }
}
