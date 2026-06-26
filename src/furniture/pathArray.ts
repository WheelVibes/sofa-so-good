/**
 * Path (polyline) array placement — pure geometry, render-agnostic, unit-testable
 * without a store.
 *
 * Places N copies of an item along an ordered polyline by arc-length sampling, so
 * the copies are evenly spaced *along the path* (not chord-spaced between vertices).
 * Each copy optionally yaws to face along the path tangent (e.g. chairs following an
 * L-shaped counter, fence posts tracing a curve, pendant lights along a run).
 *
 * ## Coordinate convention
 * Points are world-space `[x, z]` in the floor plane (metres), matching
 * `FurnitureItem.position`. Yaw is a Three.js Y-axis rotation in radians.
 *
 * ## Facing convention
 * The app's furniture faces local +Z at yaw 0. A copy "facing along the tangent"
 * has its front (+Z) pointing in the direction of travel `(tx, tz)` along the path.
 * For a Three.js Y-rotation θ the item's +Z world direction is `(sin θ, cos θ)` in
 * (X, Z), so we need `θ = atan2(tx, tz)`.
 *
 * ## Spacing modes
 * - `mode: 'count'` (default): N copies spread over the whole path. An **open** path
 *   places copies inclusive of both endpoints (`t = i/(N-1)`); a single copy
 *   (N=1) lands at the path start. A **closed** path spaces them exclusively around
 *   the loop (`t = i/N`) so the last copy doesn't sit on top of the first.
 * - `mode: 'spacing'`: copies every `spacing` metres from the path start until the
 *   path is exhausted (capped at `PATH_ARRAY_MAX_COUNT`). On a closed path the final
 *   stride that would wrap back onto the start is dropped.
 *
 * ## Edge cases
 * - fewer than 2 points, or a path whose total length is ~0 (all points coincide)
 *   → returns [] (no meaningful path).
 * - zero-length segments (consecutive duplicate points) are skipped during
 *   arc-length traversal and never produce a NaN tangent.
 * - count < 1 (count mode) → returns [].
 * - spacing ≤ 0 (spacing mode) → returns [].
 * - spacing larger than the whole path length (spacing mode) → a single copy at the
 *   path start.
 */

/** Maximum copies in a single path array (safety cap, matches the linear/grid ceiling). */
export const PATH_ARRAY_MAX_COUNT = 200

/** A 2D world-space point on the floor plane: `[x, z]` in metres. */
export type PathPoint = [number, number]

export interface PathPlacement {
  /** World-space [x, z] position of this copy. */
  position: [number, number]
  /** Y-axis yaw in radians for this copy. */
  rotation: number
  /** Normalised arc-length parameter of this copy along the path, in [0, 1]. */
  t: number
}

export interface PathArrayOptions {
  /**
   * Spacing mode. `'count'` spreads `count` copies over the whole path;
   * `'spacing'` steps a fixed `spacing` metres until the path is exhausted.
   * Defaults to `'count'`.
   */
  mode?: 'count' | 'spacing'
  /** Number of copies in `'count'` mode. Must be ≥ 1; capped at PATH_ARRAY_MAX_COUNT. */
  count?: number
  /** Centre-to-centre spacing in metres in `'spacing'` mode. Must be > 0. */
  spacing?: number
  /** Treat the polyline as a closed loop (connect last point back to first). */
  closed?: boolean
  /**
   * If true (default), each copy yaws to face along the path tangent at its
   * position. If false, every copy keeps `baseRotation`.
   */
  align?: boolean
  /** Fallback yaw applied when `align=false` (usually the source item's rotation). */
  baseRotation?: number
}

/** A polyline segment with its start point, direction unit vector, and length. */
interface Segment {
  /** Cumulative arc length at the segment's start. */
  startLen: number
  /** Segment length (> 0; zero-length segments are excluded). */
  len: number
  /** Start point [x, z]. */
  p0: PathPoint
  /** Unit direction [dx, dz] from p0 toward p1. */
  dir: [number, number]
}

/**
 * Build the non-degenerate segments of a (possibly closed) polyline plus its total
 * arc length. Consecutive duplicate / coincident points produce zero-length
 * segments which are skipped (never contribute a direction or length).
 */
function buildSegments(
  points: PathPoint[],
  closed: boolean,
): { segments: Segment[]; total: number } {
  const pts = closed && points.length >= 2 ? [...points, points[0]] : points
  const segments: Segment[] = []
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]
    const p1 = pts[i + 1]
    const dx = p1[0] - p0[0]
    const dz = p1[1] - p0[1]
    const len = Math.hypot(dx, dz)
    if (len <= 1e-9) continue // skip zero-length segment
    segments.push({ startLen: total, len, p0, dir: [dx / len, dz / len] })
    total += len
  }
  return { segments, total }
}

/**
 * Sample a `{ position, rotation, t }` at arc-length distance `dist` along the
 * pre-built segments (total path length `total`). `dist` is clamped to [0, total].
 */
function sampleAt(
  segments: Segment[],
  total: number,
  dist: number,
  align: boolean,
  baseRotation: number,
): PathPlacement {
  const d = Math.max(0, Math.min(total, dist))
  // Find the segment containing `d`. Segments are ordered by startLen.
  let seg = segments[segments.length - 1]
  for (const s of segments) {
    if (d <= s.startLen + s.len) {
      seg = s
      break
    }
  }
  const along = d - seg.startLen
  const x = seg.p0[0] + seg.dir[0] * along
  const z = seg.p0[1] + seg.dir[1] * along
  // Tangent-facing yaw: item front (+Z) points along the travel direction.
  // Three.js Y-rotation θ → item +Z world = (sin θ, cos θ); we want (dir).
  const rotation = align ? Math.atan2(seg.dir[0], seg.dir[1]) : baseRotation
  return { position: [x, z], rotation, t: total > 0 ? d / total : 0 }
}

/**
 * Compute N placements along a polyline by arc-length sampling.
 *
 * Returns `{ position, rotation, t }` per copy. The caller is responsible for
 * collision-checking each position and committing to the store in one batch
 * (one undo step), mirroring the linear/grid/radial array callers.
 */
export function pathArrayPlacements(
  points: PathPoint[],
  opts: PathArrayOptions = {},
): PathPlacement[] {
  if (!Array.isArray(points) || points.length < 2) return []

  const { mode = 'count', closed = false, align = true, baseRotation = 0 } = opts
  const { segments, total } = buildSegments(points, closed)
  if (segments.length === 0 || total <= 1e-9) return []

  if (mode === 'spacing') {
    const spacing = opts.spacing ?? 0
    if (!(spacing > 0)) return []
    const out: PathPlacement[] = []
    // Closed loops drop the final stride that would land back on the start.
    const limit = closed ? total - 1e-6 : total + 1e-9
    for (let d = 0; d <= limit && out.length < PATH_ARRAY_MAX_COUNT; d += spacing) {
      out.push(sampleAt(segments, total, d, align, baseRotation))
    }
    // A spacing larger than the whole open path still yields the start copy above.
    return out
  }

  // count mode
  const n = Math.max(0, Math.min(PATH_ARRAY_MAX_COUNT, Math.floor(opts.count ?? 0)))
  if (n < 1) return []
  if (n === 1) return [sampleAt(segments, total, 0, align, baseRotation)]

  // Open path: inclusive both ends → step = total/(n-1).
  // Closed loop: exclusive seam → step = total/n.
  const step = closed ? total / n : total / (n - 1)
  const out: PathPlacement[] = []
  for (let i = 0; i < n; i++) {
    out.push(sampleAt(segments, total, i * step, align, baseRotation))
  }
  return out
}
