/**
 * Pure layout maths for a window's optional bar/cable/slat overlay
 * (`PlanOpening.style`, `openingStyles`) — shared by the safety `grille`
 * (chunky visible bars), `invisible-grille` (hair-thin near-transparent
 * cables), and `louvre` (horizontal slats) window styles so `PlanShell`'s
 * `FadeWindow` stays pure geometry description. Kept render-agnostic (no
 * three/React imports) so it's unit-testable without a GPU, following the
 * furniture `slatLayout.ts` pattern.
 */

/** Interior vertical count for a run of `width` spaced roughly every `pitch`
 *  metres, floored at `min` so a narrow window still reads as barred. Shared
 *  by the safety grille (chunky bars, ~0.16 m pitch) and invisible grille
 *  (hair-thin cables, ~0.10 m pitch, the denser modern convention). */
export function verticalBarCount(width: number, pitch: number, min = 2): number {
  return Math.max(min, Math.round(width / pitch))
}

/** Z-offsets (window-local, centred) of the `n-1` INTERIOR bars/cables spanning
 *  `width` in `n` equal bays — verticals sit AT the bay boundaries, excluding
 *  the two window jambs (bay 0's start and bay n's end are the frame itself,
 *  not barred). */
export function verticalBarOffsets(width: number, pitch: number, min = 2): number[] {
  const n = verticalBarCount(width, pitch, min)
  const offsets: number[] = []
  for (let i = 1; i < n; i++) offsets.push(-width / 2 + (width * i) / n)
  return offsets
}

/** Horizontal louvre-slat count for a run of `height` spaced roughly every
 *  `pitch` metres, floored at `min` (a louvre reads as slats even on a short
 *  window). */
export function louvreSlatCount(height: number, pitch: number, min = 3): number {
  return Math.max(min, Math.round(height / pitch))
}

/** Y-offsets (window-local, centred) of `n` evenly-spaced louvre slats
 *  spanning `height`, each centred in its own equal band (unlike the vertical
 *  bars, every band gets a slat — a louvre has no un-slatted top/bottom
 *  band). */
export function louvreSlatOffsets(height: number, pitch: number, min = 3): number[] {
  const n = louvreSlatCount(height, pitch, min)
  const offsets: number[] = []
  for (let i = 0; i < n; i++) offsets.push(-height / 2 + (height * (i + 0.5)) / n)
  return offsets
}
