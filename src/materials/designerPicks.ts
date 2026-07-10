/**
 * Curated "designer picks" — the handful of floor + wall finishes a designer
 * reaches for most, surfaced as a one-tap row above the full swatch grid so the
 * common choices are a single click (the long catalog is still a scroll away).
 * Pure + data-only; ids are resolved against the live materials map at the call
 * site so a missing/ungenerated id is silently skipped (never a broken tile).
 */

/** Ordered curated floor finishes (most-reached-for first). */
const DESIGNER_FLOOR_IDS = [
  'floor-wood-oak',
  'floor-wood-walnut',
  'floor-parquet',
  'floor-tile-marble',
  'floor-tile-white',
  'floor-carpet',
] as const

/** Ordered curated wall finishes spanning warm/cool neutrals + a wood accent. */
const DESIGNER_WALL_IDS = [
  'wall-paint-white',
  'wall-paint-greige',
  'wall-paint-sage',
  'wall-paint-navy',
  'wall-fluted-oak',
  'wall-concrete-light',
] as const

/** Curated ids for a surface, in display order. */
export function designerPickIds(surface: 'floor' | 'wall'): readonly string[] {
  return surface === 'floor' ? DESIGNER_FLOOR_IDS : DESIGNER_WALL_IDS
}

/** Resolve curated ids to whatever's actually present in `available`, preserving
 *  curated order and dropping any id the catalog doesn't currently provide. */
export function resolveDesignerPicks<T>(
  surface: 'floor' | 'wall',
  available: Record<string, T>,
): T[] {
  const out: T[] = []
  for (const id of designerPickIds(surface)) {
    const m = available[id]
    if (m) out.push(m)
  }
  return out
}
