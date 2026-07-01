/**
 * Selection "appear" micro-interaction: when an item becomes selected its
 * outline + floor tint scale up gently from slightly smaller instead of popping
 * in hard — a subtle focus cue (Coohom / Planner 5D do similar). Pure timing so
 * it's unit-tested; `SelectionOutline`'s `ItemOutline` drives a group scale from
 * it on mount. Short enough (< the demand-mode settle tail) that it never needs
 * to hold the render pump open.
 */

/** Appear duration (ms). */
export const APPEAR_MS = 130
/** Starting scale (eases up to 1). */
export const APPEAR_FROM = 0.9

/** Ease-out cubic (clamped 0→1) — quick, decelerating settle. */
export function appearEase(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t
  const inv = 1 - c
  return 1 - inv * inv * inv
}

/** Uniform scale for a selection that appeared `elapsedMs` ago: `APPEAR_FROM`
 *  at the start, eased to exactly 1 by `APPEAR_MS`. */
export function appearScale(elapsedMs: number): number {
  if (elapsedMs >= APPEAR_MS) return 1
  if (elapsedMs <= 0) return APPEAR_FROM
  return APPEAR_FROM + (1 - APPEAR_FROM) * appearEase(elapsedMs / APPEAR_MS)
}
