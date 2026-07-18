/**
 * MEP symbol/label declutter (H-D1 defect fix) — shared by `electricalPlanSvg.ts`
 * + `plumbingPlanSvg.ts`. A WC's soil-pipe + water-point (or a kitchen's
 * socket + data point) are routinely placed within a few centimetres of each
 * other, so their SYMBOL CIRCLES sit almost on top of one another and their
 * side labels ("SP@300" / "W@300") concatenate into unreadable overlapping
 * text. Mirrors `ui/carpentrySheetSvg.ts`'s `declutterLabelY` approach: the
 * geometry (circle positions) never moves — only LABEL text is nudged, with a
 * short leader line back to the true point when it was nudged. Pure pixel-space
 * geometry, no SVG-string concerns — the callers own markup.
 *
 * NOT wired into `ui/floorplan/editor/layers/MepLayer.tsx` (the 2D editor's own
 * point rendering) in this pass — scope here was the exported sheets only
 * (H-D1). `MepLayer` draws each point's `label` at the SAME fixed
 * `(cx + R + 3, cz)` offset the sheets used to, so a closely-placed cluster
 * (a WC's soil-pipe + water-point) can overlap there too; a future pass giving
 * the editor the same declutter treatment should reuse `layoutMepLabels`
 * rather than re-deriving a second scheme.
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

/** Resolved label placement for one point. */
export interface MepLabelPlacement {
  id: string
  /** Same as the input point's true circle centre — the leader line's start
   *  (and where the symbol circle itself is drawn; unchanged by decluttering). */
  cx: number
  cy: number
  /** Where the label TEXT should be drawn. */
  labelX: number
  labelY: number
  /** True when this label was nudged off its natural position — the caller
   *  should draw a short leader line from `(cx, cy)` to `(labelX, labelY)`. */
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

/**
 * Lay out one label per point: a lone point keeps its natural position
 * (`labelOffsetX` to the right of its circle, same Y — the pre-existing
 * un-clustered convention, `hasLeader: false`). Two or more points whose
 * circles collide (within `collisionRadius`) have their labels FANNED OUT —
 * stacked vertically (each ≥`minGap` apart) centred on the cluster's mean
 * position, all offset `labelOffsetX` from the mean X — with `hasLeader: true`
 * so the caller draws a short leader line back to each point's true circle.
 * Circle positions themselves are never touched (return them unchanged via
 * `cx`/`cy` for the caller's leader line).
 */
export function layoutMepLabels(
  points: MepLabelPoint[],
  labelOffsetX: number,
  collisionRadius = DEFAULT_COLLISION_RADIUS_PX,
  minGap = DEFAULT_LABEL_MIN_GAP_PX,
): MepLabelPlacement[] {
  const out: MepLabelPlacement[] = []
  const clusters = clusterPoints(points, collisionRadius)
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const p = cluster[0]!
      out.push({
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        labelX: p.cx + labelOffsetX,
        labelY: p.cy,
        hasLeader: false,
      })
      continue
    }
    // Fan out: stack labels top-to-bottom (stable sort by true Y so the
    // visual order matches the points' vertical order), centred on the
    // cluster's mean position.
    const sorted = [...cluster].sort((a, b) => a.cy - b.cy)
    const meanX = sorted.reduce((s, p) => s + p.cx, 0) / sorted.length
    const meanY = sorted.reduce((s, p) => s + p.cy, 0) / sorted.length
    const startY = meanY - (minGap * (sorted.length - 1)) / 2
    sorted.forEach((p, i) => {
      out.push({
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        labelX: meanX + labelOffsetX,
        labelY: startY + i * minGap,
        hasLeader: true,
      })
    })
  }
  return out
}
