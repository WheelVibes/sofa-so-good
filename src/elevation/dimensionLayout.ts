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
