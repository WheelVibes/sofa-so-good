/**
 * Rubber-band (marquee) multi-select for the 2D plan editor (PARITY-PLAN-MARQUEE).
 *
 * Pure geometry — no React, no store, no three.js. Given a drag rectangle in
 * plan metres plus the candidate furniture footprints (as OBBs) and wall
 * segments, returns the ids whose footprint / segment the rectangle hits.
 *
 * Hit semantics: **intersection**, matching Sweet Home 3D and Coohom — a
 * footprint counts as selected when it *touches or overlaps* the marquee, not
 * only when it is fully enclosed. (A fully-contained footprint is a subset of
 * "intersects", so it is also selected — there is no "must be fully inside"
 * mode here.) We reuse the SAT helpers in `collision/obb.ts`: the marquee is an
 * axis-aligned OBB (`rot: 0`), tested against each furniture OBB via `obbVsObb`
 * and each wall segment via `obbVsSegment`.
 *
 * Edge cases:
 * - **Empty / zero-area rect** (a plain click, no drag): returns no hits so the
 *   caller can fall through to normal click-selection instead of hijacking it.
 *   The threshold is in plan metres (see `MIN_MARQUEE_SIZE_M`).
 * - **Rotated footprints**: handled for free — `obbVsObb` is a full SAT test on
 *   the oriented box, so a rotated piece is hit exactly when its rotated
 *   footprint overlaps the rectangle (we do NOT fall back to its axis-aligned
 *   bounds).
 */

import type { OBB, Segment } from '../../../collision/obb'
import { obbVsObb, obbVsSegment } from '../../../collision/obb'

/** A drag rectangle in plan coordinates (metres). Corners in any order. */
export interface MarqueeRect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** A furniture candidate: its id and its footprint OBB (from `itemFootprint`). */
export interface MarqueeItem {
  id: string
  obb: OBB
}

/** A wall candidate: its id and its centre-line segment. */
export interface MarqueeWall {
  id: string
  segment: Segment
}

export interface MarqueeHits {
  itemIds: string[]
  wallIds: string[]
}

/**
 * Minimum width AND height (plan metres) a marquee must reach before it selects
 * anything. Below this the drag is treated as a click (zero-area), so a simple
 * tap that wobbles a pixel or two doesn't sweep up nearby items. ~1 cm at any
 * zoom — well under the smallest meaningful drag.
 */
export const MIN_MARQUEE_SIZE_M = 0.01

/** Convert a (possibly inverted) rect into an axis-aligned OBB for SAT tests. */
function rectToObb(rect: MarqueeRect): OBB {
  const minX = Math.min(rect.x0, rect.x1)
  const maxX = Math.max(rect.x0, rect.x1)
  const minZ = Math.min(rect.z0, rect.z1)
  const maxZ = Math.max(rect.z0, rect.z1)
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    hx: (maxX - minX) / 2,
    hz: (maxZ - minZ) / 2,
    rot: 0,
  }
}

/** True when the rect is large enough (in both axes) to count as a drag, not a click. */
export function isMarqueeDrag(rect: MarqueeRect): boolean {
  return (
    Math.abs(rect.x1 - rect.x0) >= MIN_MARQUEE_SIZE_M &&
    Math.abs(rect.z1 - rect.z0) >= MIN_MARQUEE_SIZE_M
  )
}

/**
 * Return the ids of every furniture footprint and wall segment the marquee
 * intersects. A zero-area (click-sized) rect returns no hits.
 */
export function marqueeSelect(
  rect: MarqueeRect,
  items: readonly MarqueeItem[],
  walls: readonly MarqueeWall[],
): MarqueeHits {
  if (!isMarqueeDrag(rect)) return { itemIds: [], wallIds: [] }
  const box = rectToObb(rect)
  return {
    itemIds: items.filter((it) => obbVsObb(box, it.obb)).map((it) => it.id),
    wallIds: walls.filter((w) => obbVsSegment(box, w.segment)).map((w) => w.id),
  }
}
