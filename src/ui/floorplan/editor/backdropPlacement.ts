/**
 * Pure placement/scale math for the plan trace backdrop (ghost stencil).
 * World units are metres; the image is positioned by its top-left corner
 * (`ox`/`oz`) and scaled by `mPerPx` (metres per image pixel). Pure module —
 * no React/DOM/store (see editor/CLAUDE.md).
 */
import type { Backdrop } from './planConstants'

/** Upload size cap for the trace image (mirrors walkBackdrop's 25 MB cap). */
export const MAX_PLAN_BACKDROP_BYTES = 25 * 1024 * 1024

/** Fraction of the plan bounds the freshly-loaded image fits inside. */
const FIT_FRACTION = 0.9

/**
 * Initial placement for a newly-loaded backdrop: uniform-fit inside the plan
 * bounds (90% of the tighter axis) and centre on the plan centre. The canvas
 * grid margin is symmetric, so plan centre == canvas centre.
 */
export function initialBackdropPlacement(
  imgW: number,
  imgH: number,
  ew: number,
  ed: number,
): { mPerPx: number; ox: number; oz: number } {
  const w = Math.max(1, imgW)
  const h = Math.max(1, imgH)
  const spanX = Math.max(1, ew)
  const spanZ = Math.max(1, ed)
  const mPerPx = Math.min(spanX / w, spanZ / h) * FIT_FRACTION
  return {
    mPerPx,
    ox: ew / 2 - (w * mPerPx) / 2,
    oz: ed / 2 - (h * mPerPx) / 2,
  }
}

/**
 * Rescale about a world-space anchor so the image feature under the anchor
 * stays put — used by the Scale tool with the midpoint of the drawn reference
 * segment, so the wall the user just measured doesn't slide away.
 */
export function rescaleBackdropAnchored(
  b: Pick<Backdrop, 'mPerPx' | 'ox' | 'oz'>,
  newMPerPx: number,
  anchorX: number,
  anchorZ: number,
): { mPerPx: number; ox: number; oz: number } {
  if (!Number.isFinite(newMPerPx) || newMPerPx <= 0) {
    return { mPerPx: b.mPerPx, ox: b.ox, oz: b.oz }
  }
  const px = (anchorX - b.ox) / b.mPerPx
  const pz = (anchorZ - b.oz) / b.mPerPx
  return {
    mPerPx: newMPerPx,
    ox: anchorX - px * newMPerPx,
    oz: anchorZ - pz * newMPerPx,
  }
}

/** Re-centre the image on the plan centre at its current scale. */
export function centerBackdrop(
  b: Pick<Backdrop, 'w' | 'h' | 'mPerPx'>,
  ew: number,
  ed: number,
): { ox: number; oz: number } {
  return {
    ox: ew / 2 - (b.w * b.mPerPx) / 2,
    oz: ed / 2 - (b.h * b.mPerPx) / 2,
  }
}
