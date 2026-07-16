/**
 * GLB Asset Designer — Stage 6d precision II: **face-to-face magnetic snapping**
 * (CAD-style). Pure geometry over axis-aligned bounding boxes; no three, no
 * store, no React — fully unit-testable.
 *
 * Given the world AABB of the part/group being dragged (at its PROPOSED,
 * post-drag position), the world AABBs of every OTHER part, and a snap threshold
 * (~8 mm world), return the position delta that snaps the dragged selection
 * flush to the nearest neighbouring face on each axis, plus which snaps fired
 * (for a brief visual hint). Two snap flavours, per axis:
 *
 *  - **Abut** (higher priority): an OUTER face of the moving box meets an OUTER
 *    face of a target box — `moving.max` → `target.min` (moving sits to the low
 *    side) or `moving.min` → `target.max` (moving sits to the high side). The two
 *    boxes end up touching with zero gap (the "snap two boards edge-to-edge" move).
 *  - **Align** (lower priority): a same-side face becomes coplanar —
 *    `moving.min` → `target.min` or `moving.max` → `target.max`. Lines two boxes'
 *    faces up flush without abutting.
 *
 * A candidate only counts when the two boxes OVERLAP on the other two axes (so a
 * far-off part on the far side of the piece never yanks the drag). Each axis is
 * decided independently — a snap on X never moves Y/Z (axis isolation). Abut wins
 * over align within the threshold; ties break to the smaller move.
 */

import type { Axis3, Bounds3 } from './arrange'

/** Default magnetic-snap threshold in metres (~8 mm world). */
export const FACE_SNAP_THRESHOLD_M = 0.008

/** Tolerance (m) for the perpendicular-axis overlap gate — lets faces that just
 *  touch on a perpendicular axis still count as overlapping. */
const OVERLAP_EPS = 1e-4

const AXES: Axis3[] = ['x', 'y', 'z']
const AXIS_INDEX: Record<Axis3, 0 | 1 | 2> = { x: 0, y: 1, z: 2 }

/** Which snap flavour fired. Abut = outer faces touching; align = same-side faces
 *  coplanar. */
type FaceSnapKind = 'abut' | 'align'

/** One axis's snap, for the visual hint: the axis, the flavour, and the world
 *  coordinate the snapped face plane sits at. */
export interface FaceSnapHit {
  axis: Axis3
  kind: FaceSnapKind
  /** World coordinate (m) on `axis` of the shared face plane after snapping. */
  coord: number
}

export interface FaceSnapResult {
  /** Position delta (m) to add to the moving selection — 0 on an axis that didn't
   *  snap. */
  delta: [number, number, number]
  /** The snaps that fired (0–3, one per axis). Empty when nothing snapped. */
  hits: FaceSnapHit[]
}

/** Do two closed intervals overlap (touching counts)? */
function overlaps(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return minA <= maxB + OVERLAP_EPS && minB <= maxA + OVERLAP_EPS
}

/** True when `moving` and `target` overlap on BOTH axes other than `axis` — the
 *  gate that keeps a snap local to boxes that actually face each other. */
function overlapsPerpendicular(moving: Bounds3, target: Bounds3, axis: Axis3): boolean {
  for (const other of AXES) {
    if (other === axis) continue
    const i = AXIS_INDEX[other]
    if (!overlaps(moving.min[i], moving.max[i], target.min[i], target.max[i])) return false
  }
  return true
}

interface Candidate {
  d: number
  kind: FaceSnapKind
  coord: number
}

/** The best (nearest, abut-preferred) snap for one axis, or null. */
function bestForAxis(
  moving: Bounds3,
  targets: Bounds3[],
  axis: Axis3,
  threshold: number,
): Candidate | null {
  const i = AXIS_INDEX[axis]
  const mMin = moving.min[i]
  const mMax = moving.max[i]
  const cands: Candidate[] = []
  for (const t of targets) {
    if (!overlapsPerpendicular(moving, t, axis)) continue
    const tMin = t.min[i]
    const tMax = t.max[i]
    // Abutment: outer face meets outer face (zero gap).
    cands.push({ d: tMin - mMax, kind: 'abut', coord: tMin })
    cands.push({ d: tMax - mMin, kind: 'abut', coord: tMax })
    // Alignment: same-side faces become coplanar.
    cands.push({ d: tMin - mMin, kind: 'align', coord: tMin })
    cands.push({ d: tMax - mMax, kind: 'align', coord: tMax })
  }
  let best: Candidate | null = null
  for (const c of cands) {
    if (Math.abs(c.d) > threshold) continue
    if (!best) {
      best = c
      continue
    }
    // Abut beats align; within the same flavour the nearer move wins.
    const better =
      (c.kind === 'abut' && best.kind === 'align') ||
      (c.kind === best.kind && Math.abs(c.d) < Math.abs(best.d))
    if (better) best = c
  }
  return best
}

/**
 * Compute the face-snap delta + fired snaps for a dragged selection. `moving` is
 * the selection's world AABB at its proposed position; `targets` are the world
 * AABBs of every other part. Pure — one call, no side effects.
 */
export function snapFaces(
  moving: Bounds3,
  targets: Bounds3[],
  threshold: number = FACE_SNAP_THRESHOLD_M,
): FaceSnapResult {
  const delta: [number, number, number] = [0, 0, 0]
  const hits: FaceSnapHit[] = []
  for (const axis of AXES) {
    const best = bestForAxis(moving, targets, axis, threshold)
    if (!best || best.d === 0) {
      // d === 0 means already flush — record no move (and no redundant hint).
      continue
    }
    delta[AXIS_INDEX[axis]] = best.d
    hits.push({ axis, kind: best.kind, coord: best.coord })
  }
  return { delta, hits }
}
