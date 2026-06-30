/**
 * Pure plan reference-guide snapping (PARITY-PLAN-GUIDES).
 *
 * Figma / Coohom "ruler guides": PERSISTENT axis-aligned reference lines that a
 * user pins to the 2D plan, and that dragged points snap to — distinct from the
 * transient smart-guides that pop up only while dragging. A guide is an infinite
 * line at one world coordinate:
 *   - `{ axis: 'x', pos }` — a VERTICAL line at `x = pos` (snaps a point's X);
 *   - `{ axis: 'z', pos }` — a HORIZONTAL line at `z = pos` (snaps a point's Z).
 *
 * `snapToGuides(point, guides, threshold)` snaps each axis INDEPENDENTLY to the
 * nearest in-range guide on that axis, so a point can snap to a vertical AND a
 * horizontal guide at once (landing on their intersection). A coordinate with no
 * guide within `threshold` is left as-is. `nearestGuide` exposes the per-axis
 * nearest lookup; `addGuide` appends a guide while de-duplicating against an
 * existing guide on the same axis within `mergeEps`.
 *
 * Coordinates are XZ metres (`PlanVec2` — X is index 0, Z is index 1). Pure +
 * composable — geometry only, no three / React imports. Mirrors `gridSnap.ts`.
 */
import type { PlanGuide, PlanVec2 } from './types'

// PlanGuide is defined in ./types (it's a persisted FloorPlan field); re-export
// so existing `from './snapToGuides'` imports of the type keep working.
export type { PlanGuide } from './types'

/**
 * The closest in-range guide on `axis`, or `null` if none is within `threshold`
 * of `value`. Ties resolve to the first such guide encountered.
 */
export function nearestGuide(
  value: number,
  axis: 'x' | 'z',
  guides: PlanGuide[],
  threshold: number,
): PlanGuide | null {
  let best: PlanGuide | null = null
  let bestDist = threshold
  for (const g of guides) {
    if (g.axis !== axis) continue
    const d = Math.abs(g.pos - value)
    if (d <= bestDist) {
      // `<=` with a strictly-decreasing bestDist keeps the FIRST guide on ties.
      if (best === null || d < bestDist) {
        best = g
        bestDist = d
      }
    }
  }
  return best
}

/**
 * Snap `point` to the reference guides: independently snap X to the nearest
 * `axis:'x'` guide within `threshold` and Z to the nearest `axis:'z'` guide
 * within `threshold`. Both can snap at once (snapping to an intersection).
 * Returns a NEW `PlanVec2`; a coordinate with no guide in range is unchanged.
 */
export function snapToGuides(point: PlanVec2, guides: PlanGuide[], threshold: number): PlanVec2 {
  const gx = nearestGuide(point[0], 'x', guides, threshold)
  const gz = nearestGuide(point[1], 'z', guides, threshold)
  return [gx ? gx.pos : point[0], gz ? gz.pos : point[1]]
}

/**
 * Return a NEW array with `guide` added, UNLESS an existing guide on the same
 * axis lies within `mergeEps` (default `1e-4`) of it (de-dupe). Distinct guides
 * — different axis, or far enough apart — are always kept.
 */
export function addGuide(guides: PlanGuide[], guide: PlanGuide, mergeEps = 1e-4): PlanGuide[] {
  const dup = guides.some((g) => g.axis === guide.axis && Math.abs(g.pos - guide.pos) <= mergeEps)
  return dup ? [...guides] : [...guides, guide]
}
