/**
 * ESTATE-SURROUND presence signal — a plain module boolean the window panes read
 * inside their `useFrame` (no hooks, no store round-trip; the sanctioned pattern for
 * per-frame cross-module reads, see `cameraForward.ts` / `backdropVisibleNow`).
 *
 * Why the panes need it: PHOTO-GLASS tells the night story by dropping transmission to
 * 0.2 and tinting the pane near-black, so an interior "reads its own reflection, not a
 * see-through hole into the void". That was right while the void WAS a void. With real
 * lit neighbours outside, a pane that goes opaque at dusk hides the one thing a night
 * window in an HDB flat shows — the estate's lit windows and corridor tubes — so when
 * the estate is mounted the pane stays clear and the darkness comes from the exterior.
 */
let visible = false

export function setEstateVisible(v: boolean): void {
  visible = v
}

/** True while `<Estate>` has geometry mounted (walk mode, HDB plan, sky backdrop). */
export function estateVisibleNow(): boolean {
  return visible
}
