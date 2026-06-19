/**
 * Equal-spacing smart-guide detection (render-agnostic, pure).
 *
 * While dragging one item, pro tools (Coohom, Figma) surface EQUAL-SPACING hints:
 * when the gap the dragged item forms with a neighbour matches an existing gap
 * between two other items (or between a neighbour and a wall), draw matching
 * distance badges so the user can snap to even spacing.
 *
 * This module computes those matches from 1-D axis spans only — keeping it cheap
 * and independent of three.js. Rendering + snapping live in the scene layer.
 */

/** A 1-D axis-aligned span: an item's footprint extent projected onto one axis.
 *  `lo`/`hi` are the near/far edge coordinates (metres) on that axis. */
export interface Span {
  lo: number
  hi: number
}

/** The empty distance between two adjacent spans (a then b, a fully before b).
 *  Used to describe one "gap" the user could match. The `between` coordinates
 *  are the facing edges the badge bracket should span (`from` = a.hi, `to` = b.lo). */
export interface Gap {
  /** Gap size in metres (>= 0). */
  size: number
  /** Near edge of the gap (the earlier span's far edge). */
  from: number
  /** Far edge of the gap (the later span's near edge). */
  to: number
}

/** A detected equal-spacing relationship along one axis: a set of gaps that all
 *  share the same size (within tolerance), at least one of which involves the
 *  dragged item. Rendered as matching badges/ticks at each gap. */
export interface EqualSpacing {
  axis: 'x' | 'z'
  /** The shared gap size (metres) — what the badges read out. */
  size: number
  /** Each equal gap to draw a badge on, in axis order. */
  gaps: Gap[]
  /** When the dragged item should snap so its gap equals the others exactly,
   *  this is the corrected centre coordinate on this axis; null when no snap
   *  applies (already equal within a tighter snap window, or ambiguous). */
  snapCenter: number | null
}

/** Centre of a span. */
function spanCenter(s: Span): number {
  return (s.lo + s.hi) / 2
}

/** Two spans overlap on this axis (share any coordinate). Overlapping items
 *  don't form a clean gap, so they're skipped as gap partners. */
function overlaps(a: Span, b: Span): boolean {
  return a.lo < b.hi && b.lo < a.hi
}

/** The gap between two spans where `a` is entirely before `b`; null if they
 *  overlap or are mis-ordered. */
function gapBetween(a: Span, b: Span): Gap | null {
  if (a.hi > b.lo) return null
  return { size: b.lo - a.hi, from: a.hi, to: b.lo }
}

const DEFAULT_TOL = 0.08 // metres — gaps within this count as "equal"
const MIN_GAP = 0.02 // ignore touching / negative gaps as spacing candidates

export interface EqualSpacingOpts {
  /** Two gaps count as equal when their sizes differ by less than this (m). */
  tol?: number
}

/**
 * Detect the strongest equal-spacing opportunity along one axis for a dragged
 * item placed at `dragCenter` (axis half-extent `dragHalf`).
 *
 * `others` are the neighbours' spans on THIS axis (filtered to the relevant
 * row/column by the caller). `walls` are fixed boundary coordinates on this axis
 * (e.g. room wall faces) that a gap can also be measured against.
 *
 * Returns the best match (most gaps, then smallest spacing for a tight, tidy
 * result) or null when fewer than two equal gaps can be formed.
 */
export function detectEqualSpacingAxis(
  axis: 'x' | 'z',
  dragCenter: number,
  dragHalf: number,
  others: Span[],
  walls: number[] = [],
  opts: EqualSpacingOpts = {},
): EqualSpacing | null {
  const tol = opts.tol ?? DEFAULT_TOL
  const drag: Span = { lo: dragCenter - dragHalf, hi: dragCenter + dragHalf }

  // Existing gaps between pairs of non-dragged items (and item↔wall), as
  // reference spacings the drag could match. Only adjacent, non-overlapping
  // spans with a real (positive) gap qualify.
  const sorted = [...others].sort((p, q) => spanCenter(p) - spanCenter(q))
  const referenceGaps: Gap[] = []
  for (let i = 0; i < sorted.length; i++) {
    // item ↔ next item
    for (let j = i + 1; j < sorted.length; j++) {
      if (overlaps(sorted[i], sorted[j])) continue
      const g = gapBetween(sorted[i], sorted[j]) ?? gapBetween(sorted[j], sorted[i])
      // Only treat the IMMEDIATE neighbour as a reference gap (skip pairs with a
      // span sitting between them, which isn't a clean visual gap).
      if (!g || g.size < MIN_GAP) continue
      const hasBetween = sorted.some(
        (s, k) => k !== i && k !== j && spanCenter(s) > g.from && spanCenter(s) < g.to,
      )
      if (!hasBetween) referenceGaps.push(g)
    }
  }
  // item ↔ wall
  for (const w of walls) {
    for (const s of sorted) {
      const g =
        s.lo >= w ? { size: s.lo - w, from: w, to: s.lo } : { size: w - s.hi, from: s.hi, to: w }
      if (g.size < MIN_GAP) continue
      // The wall must be on the far side (no span between the wall face and s).
      const between = sorted.some(
        (o) => spanCenter(o) > Math.min(g.from, g.to) && spanCenter(o) < Math.max(g.from, g.to),
      )
      if (!between)
        referenceGaps.push({
          size: g.size,
          from: Math.min(g.from, g.to),
          to: Math.max(g.from, g.to),
        })
    }
  }

  // The gap the dragged item forms with its nearest neighbour on each side.
  const before = sorted.filter((s) => s.hi <= drag.lo + tol).sort((p, q) => q.hi - p.hi)[0]
  const after = sorted.filter((s) => s.lo >= drag.hi - tol).sort((p, q) => p.lo - q.lo)[0]
  const dragGaps: Array<{ neighbour: Span; gap: Gap; side: 'before' | 'after' }> = []
  if (before) {
    const g = gapBetween(before, drag)
    if (g && g.size >= -tol) dragGaps.push({ neighbour: before, gap: g, side: 'before' })
  }
  if (after) {
    const g = gapBetween(drag, after)
    if (g && g.size >= -tol) dragGaps.push({ neighbour: after, gap: g, side: 'after' })
  }
  if (dragGaps.length === 0) return null

  // For each candidate reference spacing, find which drag-gap (if any) matches
  // it within tol, and how many total gaps end up equal. Prefer the match that
  // ties the most gaps together (clearest hint), then the smallest spacing.
  let best: EqualSpacing | null = null
  const candidateSizes = new Set<number>()
  for (const rg of referenceGaps) candidateSizes.add(rg.size)
  // Also allow the two drag-gaps to equalise each other (centre between two
  // neighbours), even with no external reference.
  if (dragGaps.length === 2) {
    candidateSizes.add((dragGaps[0].gap.size + dragGaps[1].gap.size) / 2)
  }

  for (const size of candidateSizes) {
    if (size < MIN_GAP) continue
    // Drag-side gaps that match this size.
    const matchingDrag = dragGaps.filter((d) => Math.abs(d.gap.size - size) <= tol)
    if (matchingDrag.length === 0) continue
    // Reference gaps equal to this size (de-duped by their span).
    const matchingRef = referenceGaps.filter((g) => Math.abs(g.size - size) <= tol)

    const gaps: Gap[] = [...matchingRef.map((g) => ({ ...g })), ...matchingDrag.map((d) => d.gap)]
    if (gaps.length < 2) continue

    // Snap target: nudge the drag centre so its matched gap equals `size`
    // exactly. With two drag-gaps matched, centre it between the neighbours.
    let snapCenter: number | null = null
    if (matchingDrag.length === 2) {
      const lo = matchingDrag.find((d) => d.side === 'before')!.neighbour.hi
      const hi = matchingDrag.find((d) => d.side === 'after')!.neighbour.lo
      snapCenter = (lo + hi) / 2
    } else {
      const d = matchingDrag[0]
      snapCenter =
        d.side === 'before' ? d.neighbour.hi + size + dragHalf : d.neighbour.lo - size - dragHalf
    }

    // De-dupe gaps that cover (nearly) the same span so badges/ticks don't stack.
    const uniq: Gap[] = []
    for (const g of gaps.sort((p, q) => p.from - q.from)) {
      const dup = uniq.some((u) => Math.abs(u.from - g.from) < 1e-3 && Math.abs(u.to - g.to) < 1e-3)
      if (!dup) uniq.push(g)
    }
    if (uniq.length < 2) continue

    const score = uniq.length * 1000 - size // more gaps wins; tie → tighter
    const bestScore = best ? best.gaps.length * 1000 - best.size : -Infinity
    if (score > bestScore) {
      best = { axis, size, gaps: uniq, snapCenter }
    }
  }

  return best
}

/** A minimal axis-aligned wall face description (decoupled from CollisionWall so
 *  this module stays three-free). */
export interface WallFaceInput {
  /** 'v' = vertical wall (constant x face); 'h' = horizontal (constant z face). */
  orient: 'v' | 'h'
  /** The face coordinate (x for vertical, z for horizontal), wall-thickness-adjusted. */
  face: number
  /** The wall's extent on the OTHER axis [min, max] — the drag must fall within
   *  it for the face to be a relevant boundary. */
  spanMin: number
  spanMax: number
}

/** Pick the wall faces (per axis) relevant to a dragged box: vertical walls
 *  whose z-extent brackets the box become x-axis boundaries, horizontal walls
 *  whose x-extent brackets the box become z-axis boundaries. */
export function relevantWallFaces(
  walls: WallFaceInput[],
  box: { x0: number; z0: number; x1: number; z1: number },
): { x: number[]; z: number[] } {
  const cx = (box.x0 + box.x1) / 2
  const cz = (box.z0 + box.z1) / 2
  const x: number[] = []
  const z: number[] = []
  for (const w of walls) {
    if (w.orient === 'v') {
      if (cz >= w.spanMin && cz <= w.spanMax) x.push(w.face)
    } else {
      if (cx >= w.spanMin && cx <= w.spanMax) z.push(w.face)
    }
  }
  return { x, z }
}
