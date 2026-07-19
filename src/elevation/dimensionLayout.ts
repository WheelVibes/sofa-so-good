/**
 * Dimension-label layout — pure geometry for the elevation renderer (EL5).
 *
 * Per-item width dimensions sit in a row under the floor line; when adjacent
 * items are very narrow their label text boxes collide. These helpers assign
 * each label a row index (0 = the base row, 1 = one step further from the
 * drawing, …) so colliding labels stagger vertically — the standard drafting
 * answer to crowded dimension strings. Pure (no DOM/SVG) → unit-testable.
 */

export interface DimLabelBox {
  /** Horizontal centre of the label text (m, elevation X). */
  center: number
  /** Approximate rendered text width (m). */
  width: number
}

/**
 * Approximate rendered width of an SVG `<text>` string (metres, at `fontSize`
 * metres per em). ~0.62 em average glyph advance for the default sans stack —
 * close enough for collision layout without measuring real glyphs (the pure
 * core has no DOM).
 */
export function approxTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62
}

/**
 * Assign a row to every label so that no two labels in the same row overlap
 * horizontally. Greedy in left-to-right (centre) order: each label takes the
 * shallowest row whose occupied extent ends at least `gap` before the label's
 * left edge. Non-colliding inputs all stay on row 0; the returned array is in
 * INPUT order (rows[i] belongs to labels[i]).
 */
export function staggerDimensionRows(labels: readonly DimLabelBox[], gap = 0.06): number[] {
  const order = labels.map((_, i) => i).sort((a, b) => labels[a].center - labels[b].center || a - b)
  const rowRight: number[] = [] // rightmost occupied edge per row
  const rows: number[] = new Array(labels.length).fill(0)
  for (const i of order) {
    const left = labels[i].center - labels[i].width / 2
    const right = labels[i].center + labels[i].width / 2
    let r = 0
    while (r < rowRight.length && rowRight[r] + gap > left) r++
    rows[i] = r
    rowRight[r] = Math.max(rowRight[r] ?? Number.NEGATIVE_INFINITY, right)
  }
  return rows
}

/** One mount-height dimension's anchor, for the H3 declutter pass below. */
export interface MountDimAnchor {
  /** Horizontal anchor of the dimension line (m, elevation X — near the
   *  item's own footprint). */
  x: number
  /** AFFL mount height (m) — items whose heights are close AND whose anchors
   *  are close read as visually stacked, so they need to fan out. */
  height: number
}

/**
 * Assign each mount-height dimension a "column" (0 = hug the item, 1, 2, …
 * further out) so that when two items on the SAME wall sit close together
 * horizontally (`xGap`) at close AFFL heights (`heightGap`) — their vertical
 * dimension lines/labels would otherwise overlap — the later one fans out to
 * the next column. Mirrors {@link staggerDimensionRows}'s greedy row
 * assignment for the width-dimension row, but the collision test is 2D
 * (x AND height close) since a height dim is a vertical line rather than a
 * horizontal span. Greedy in left-to-right (x) order; returned array is in
 * INPUT order.
 */
export function staggerMountHeightColumns(
  anchors: readonly MountDimAnchor[],
  xGap = 0.3,
  heightGap = 0.3,
): number[] {
  const order = anchors.map((_, i) => i).sort((a, b) => anchors[a].x - anchors[b].x || a - b)
  const placed: { x: number; height: number; col: number }[] = []
  const cols: number[] = new Array(anchors.length).fill(0)
  for (const i of order) {
    const a = anchors[i]
    let col = 0
    while (
      placed.some(
        (p) =>
          p.col === col && Math.abs(p.x - a.x) < xGap && Math.abs(p.height - a.height) < heightGap,
      )
    )
      col++
    cols[i] = col
    placed.push({ x: a.x, height: a.height, col })
  }
  return cols
}
