/**
 * MEP symbol/circle/label declutter (H-D1 defect fix, extended for the SG-
 * contractor re-review's circle-overlap follow-up) — shared by
 * `electricalPlanSvg.ts` + `plumbingPlanSvg.ts` (+ `rcpSvg.ts`'s fixture
 * markers, which reuse the same pipeline for free). A WC's soil-pipe +
 * water-point (or a kitchen/nightstand's socket + data + switch cluster) are
 * routinely placed within a few centimetres of each other, so BOTH their
 * symbol CIRCLES sit almost on top of one another AND their side labels
 * ("SP@300" / "W@300") concatenate into unreadable overlapping text.
 *
 * v1 (H-D1) only fanned the LABELS out, leaving true-position circles to
 * still visually merge their glyphs ("W"/"D" unreadable) whenever two points
 * landed within roughly one symbol diameter of each other. This pass adds a
 * second, TIGHTER declutter stage ahead of the label fan-out: circles whose
 * true centres collide (`DEFAULT_CIRCLE_COLLISION_RADIUS_PX`, ~2.2× the
 * shared symbol radius) are nudged apart onto a small regular polygon
 * centred on the cluster's true mean, each capped to at most
 * `DEFAULT_MAX_CIRCLE_NUDGE_PX` (~1.5× the symbol radius) away from its OWN
 * true position — small enough that "roughly here" stays honest, per
 * drafting convention (displace the symbol for clarity; a caller-drawn tick/×
 * at the true position, `MepLabelPlacement.trueCx`/`trueCy` +
 * `hasCircleNudge`, marks the real spot). The pre-existing label fan-out then
 * runs on top of the NUDGED circle positions (not the true ones) — so a
 * label offsets relative to where its circle actually ended up, composing
 * cleanly with the new circle nudge rather than fighting it.
 *
 * Pure pixel-space geometry, no SVG-string concerns — the callers own markup.
 *
 * NOT wired into `ui/floorplan/editor/layers/MepLayer.tsx` (the 2D editor's
 * own point rendering) in this pass — scope here was the exported sheets only
 * (H-D1, and now this circle-nudge follow-up). `MepLayer` draws each point's
 * symbol + label at its raw true position, so a closely-placed cluster can
 * still overlap there too; a future pass giving the editor the same
 * declutter treatment should reuse `layoutMepLabels` rather than re-deriving
 * a second scheme.
 */

/** One point that needs a label placed beside it (already projected to pixel
 *  space by the caller — `px(x)`/`py(z)`). */
export interface MepLabelPoint {
  /** Caller-assigned key (e.g. array index) — echoed back on the placement so
   *  the caller can zip the result back to its point/label markup. */
  id: string
  /** True symbol-circle centre, pixels. */
  cx: number
  cy: number
}

/** Resolved label + circle placement for one point. */
export interface MepLabelPlacement {
  id: string
  /** Circle centre to RENDER — nudged off the true position when it
   *  collided with another circle in its cluster (`hasCircleNudge`), else
   *  identical to the true position. The caller draws the symbol circle
   *  HERE (not at the true position). */
  cx: number
  cy: number
  /** The point's true, un-nudged position — always present so the caller can
   *  draw a small tick/× there when `hasCircleNudge` is true (the drafting
   *  convention that keeps the real location readable after a displaced
   *  symbol). */
  trueCx: number
  trueCy: number
  /** True when the circle itself was nudged off `trueCx`/`trueCy` to clear a
   *  collision with another circle in its cluster. */
  hasCircleNudge: boolean
  /** Where the label TEXT should be drawn. */
  labelX: number
  labelY: number
  /** True when this label was nudged off its natural position (relative to
   *  the, possibly-nudged, circle at `cx`/`cy`) — the caller should draw a
   *  short leader line from `(cx, cy)` to `(labelX, labelY)`. */
  hasLeader: boolean
}

/** Two symbol circles closer than this (px) are considered a colliding
 *  cluster — a touch more than one symbol diameter (`SYM_R` is 9 in both
 *  callers), so two circles that visually overlap or nearly touch always
 *  fan out. */
const DEFAULT_COLLISION_RADIUS_PX = 24

/** Minimum vertical gap (px) between two fanned-out labels — a touch more
 *  than one small-label text line (`SYM_FONT` is 8 in both callers). */
const DEFAULT_LABEL_MIN_GAP_PX = 11

/** Two symbol CIRCLES (not just labels) closer than this (px) visually merge
 *  their glyphs and must be nudged apart — ~2.2× the shared symbol radius
 *  (`SYM_R` is 9 in both callers → 19.8, rounded). Tighter than the label
 *  collision radius above: a circle overlap is a strictly worse defect than
 *  an unlabeled cluster, so it fires whenever two symbols would actually
 *  touch/merge, not merely whenever their labels would crowd. */
const DEFAULT_CIRCLE_COLLISION_RADIUS_PX = 20

/** Once nudged, aim for at least this much separation between adjacent
 *  circle centres — a little past the collision radius so the result reads
 *  as unambiguously clear, not merely at the boundary. */
const CIRCLE_TARGET_GAP_PX = DEFAULT_CIRCLE_COLLISION_RADIUS_PX * 1.15

/** Cap on how far any one circle may move from its TRUE position — ~1.5× the
 *  shared symbol radius. Keeps the drafting displacement small; a caller-
 *  drawn tick at the true position covers the rest. */
const DEFAULT_MAX_CIRCLE_NUDGE_PX = 13.5

/** Group points into clusters via single-linkage: any two points within
 *  `radius` of EACH OTHER join the same cluster (transitively — a chain of
 *  three points closely spaced end-to-end forms one cluster of three, not
 *  two overlapping pairs). Pure BFS over a distance graph. */
function clusterPoints<T extends { cx: number; cy: number }>(points: T[], radius: number): T[][] {
  const n = points.length
  const visited = new Array<boolean>(n).fill(false)
  const clusters: T[][] = []
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue
    visited[i] = true
    const stack = [i]
    const groupIdx: number[] = []
    while (stack.length > 0) {
      const j = stack.pop()!
      groupIdx.push(j)
      for (let k = 0; k < n; k++) {
        if (visited[k]) continue
        const dx = points[j]!.cx - points[k]!.cx
        const dy = points[j]!.cy - points[k]!.cy
        if (Math.hypot(dx, dy) <= radius) {
          visited[k] = true
          stack.push(k)
        }
      }
    }
    clusters.push(groupIdx.map((idx) => points[idx]!))
  }
  return clusters
}

/** One point's nudged circle placement — see `nudgeCircles`. */
interface CircleNudge {
  id: string
  cx: number
  cy: number
  trueCx: number
  trueCy: number
  nudged: boolean
}

/**
 * Nudge colliding circle CENTRES apart: a lone point (no other circle within
 * `collisionRadius`) keeps its true position (`nudged: false`). Two or more
 * points whose circles collide are placed on a regular n-gon centred on the
 * cluster's true mean, radius chosen so adjacent points end up
 * `targetGap` apart (deterministic angle order — stable-sorted by `id`,
 * starting straight up from the mean when the first point IS the mean, i.e.
 * exactly-coincident points, else from that point's own true bearing) —
 * then each point's total displacement from ITS OWN true position is capped
 * to `maxNudge` (scaling the vector back if the n-gon placement would move
 * it further).
 */
function nudgeCircles(
  points: MepLabelPoint[],
  collisionRadius: number,
  targetGap: number,
  maxNudge: number,
): CircleNudge[] {
  const out: CircleNudge[] = []
  const clusters = clusterPoints(points, collisionRadius)
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const p = cluster[0]!
      out.push({ id: p.id, cx: p.cx, cy: p.cy, trueCx: p.cx, trueCy: p.cy, nudged: false })
      continue
    }
    // Deterministic order regardless of input array order.
    const sorted = [...cluster].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const n = sorted.length
    const meanX = sorted.reduce((s, p) => s + p.cx, 0) / n
    const meanY = sorted.reduce((s, p) => s + p.cy, 0) / n
    // Radius needed for `n` evenly-spaced points on a circle to end up
    // `targetGap` apart (regular n-gon side length), capped by the budget.
    const requiredR = targetGap / (2 * Math.sin(Math.PI / n))
    const R = Math.min(requiredR, maxNudge)
    const first = sorted[0]!
    const fdx = first.cx - meanX
    const fdy = first.cy - meanY
    // Exactly-coincident points have no natural bearing from the mean — fan
    // vertically first (canonical "small radial/vertical nudge").
    const baseAngle = Math.hypot(fdx, fdy) > 1e-6 ? Math.atan2(fdy, fdx) : -Math.PI / 2
    sorted.forEach((p, i) => {
      const angle = baseAngle + (i * 2 * Math.PI) / n
      let nx = meanX + R * Math.cos(angle)
      let ny = meanY + R * Math.sin(angle)
      const ddx = nx - p.cx
      const ddy = ny - p.cy
      const dist = Math.hypot(ddx, ddy)
      if (dist > maxNudge) {
        const scale = maxNudge / dist
        nx = p.cx + ddx * scale
        ny = p.cy + ddy * scale
      }
      out.push({ id: p.id, cx: nx, cy: ny, trueCx: p.cx, trueCy: p.cy, nudged: true })
    })
  }
  return out
}

/**
 * Lay out one circle + one label per point. First nudges colliding CIRCLE
 * centres apart (`nudgeCircles`, `circleCollisionRadius`/`maxCircleNudge`),
 * then fans out LABELS exactly as before but relative to the (possibly
 * nudged) circle positions: a lone/isolated label keeps its natural position
 * (`labelOffsetX` to the right of its circle, same Y, `hasLeader: false`).
 * Two or more circles whose (nudged) positions still collide within
 * `collisionRadius` have their labels FANNED OUT — stacked vertically (each
 * ≥`minGap` apart) centred on the cluster's mean position, all offset
 * `labelOffsetX` from the mean X — with `hasLeader: true` so the caller draws
 * a short leader line back to each point's (nudged) circle.
 */
export function layoutMepLabels(
  points: MepLabelPoint[],
  labelOffsetX: number,
  collisionRadius = DEFAULT_COLLISION_RADIUS_PX,
  minGap = DEFAULT_LABEL_MIN_GAP_PX,
  circleCollisionRadius = DEFAULT_CIRCLE_COLLISION_RADIUS_PX,
  maxCircleNudge = DEFAULT_MAX_CIRCLE_NUDGE_PX,
): MepLabelPlacement[] {
  const circleNudges = nudgeCircles(
    points,
    circleCollisionRadius,
    CIRCLE_TARGET_GAP_PX,
    maxCircleNudge,
  )
  const nudgeById = new Map(circleNudges.map((c) => [c.id, c]))
  const nudgedPoints: MepLabelPoint[] = circleNudges.map((c) => ({ id: c.id, cx: c.cx, cy: c.cy }))

  const out: MepLabelPlacement[] = []
  const clusters = clusterPoints(nudgedPoints, collisionRadius)
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const p = cluster[0]!
      const nudge = nudgeById.get(p.id)!
      out.push({
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        trueCx: nudge.trueCx,
        trueCy: nudge.trueCy,
        hasCircleNudge: nudge.nudged,
        labelX: p.cx + labelOffsetX,
        labelY: p.cy,
        hasLeader: false,
      })
      continue
    }
    // Fan out: stack labels top-to-bottom (stable sort by nudged Y so the
    // visual order matches the points' vertical order), centred on the
    // cluster's (nudged) mean position.
    const sorted = [...cluster].sort((a, b) => a.cy - b.cy)
    const meanX = sorted.reduce((s, p) => s + p.cx, 0) / sorted.length
    const meanY = sorted.reduce((s, p) => s + p.cy, 0) / sorted.length
    const startY = meanY - (minGap * (sorted.length - 1)) / 2
    sorted.forEach((p, i) => {
      const nudge = nudgeById.get(p.id)!
      out.push({
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        trueCx: nudge.trueCx,
        trueCy: nudge.trueCy,
        hasCircleNudge: nudge.nudged,
        labelX: meanX + labelOffsetX,
        labelY: startY + i * minGap,
        hasLeader: true,
      })
    })
  }
  return out
}
