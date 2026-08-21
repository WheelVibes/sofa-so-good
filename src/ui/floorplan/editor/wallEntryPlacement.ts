/**
 * Where the wall numeric-entry overlay sits relative to the cursor endpoint
 * (UIUX-75). Pure geometry — no React, no DOM reads; the caller passes the
 * viewport size in.
 *
 * The overlay prefers below-right of the endpoint so it doesn't cover the point
 * being placed, and flips to the opposite side when that would overflow. The
 * flip alone is not enough, because the endpoint is not guaranteed to be ON
 * screen: the plan canvas pans and zooms freely, so a draft whose end sits left
 * of or above the viewport (a paper rect starting at -1036, -782 is ordinary
 * after panning) yields a negative `endScreenPx`, no overflow to flip against,
 * and a panel placed entirely off-screen. The final clamp is what actually keeps
 * it visible.
 *
 * `panelH` is passed in rather than assumed because the panel grows by the
 * validation row — the old caller hardcoded the error-free height, so near the
 * bottom edge the error message hung below the fold exactly when the user needed
 * to read it.
 */
export interface OverlayPlacementInput {
  /** Screen-px position of the wall draft's end point. */
  endScreenPx: [number, number]
  panelW: number
  panelH: number
  /** Minimum gap kept between the panel and every viewport edge. */
  margin: number
  vw: number
  vh: number
}

/** Preferred offset from the endpoint, so the panel clears the point itself. */
const OFFSET = 18
/** Gap left between the panel and the endpoint when flipped to the near side. */
const FLIP_GAP = 12

export function wallEntryOverlayPos({
  endScreenPx,
  panelW,
  panelH,
  margin,
  vw,
  vh,
}: OverlayPlacementInput): { left: number; top: number } {
  let left = endScreenPx[0] + OFFSET
  let top = endScreenPx[1] + OFFSET
  if (left + panelW + margin > vw) left = endScreenPx[0] - panelW - FLIP_GAP
  if (top + panelH + margin > vh) top = endScreenPx[1] - panelH - FLIP_GAP
  // Clamp last. `Math.max` wins a tie so a viewport too small to fit the panel
  // plus both margins pins it to the top-left edge rather than off the other one.
  return {
    left: Math.max(margin, Math.min(left, vw - panelW - margin)),
    top: Math.max(margin, Math.min(top, vh - panelH - margin)),
  }
}
