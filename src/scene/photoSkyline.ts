import { mulberry32 } from '../materials/procedural/noise'

/**
 * Photo-style equirectangular sky+skyline backdrop — the cheap "budget trick"
 * (a flat photo seen through the windows) instead of instanced 3D estate
 * geometry. Rendered as a single `scene.background` equirectangular texture:
 * one texture, zero per-frame draw calls, correct through every window, and its
 * lack of parallax is physically correct for distant scenery. The image is
 * generated procedurally here (no asset fetch); it can later be swapped for a
 * real CC0 equirectangular photo.
 *
 * This module is the PURE layout core (no canvas / three imports) so it is
 * unit-testable; the painter `paintEquirectSkyline` consumes it on a real
 * canvas in the browser.
 */

/** A single building silhouette placed around the 360° horizon. Coordinates
 *  are normalised: `x`/`w` are fractions of the equirect width (azimuth),
 *  `h` is a fraction of the available band height above the horizon. */
export interface SkylineBuilding {
  /** Left edge, fraction of width [0,1). */
  x: number
  /** Width, fraction of width (0,1). */
  w: number
  /** Height, fraction of the sky band above the horizon (0,1]. */
  h: number
  /** 0 = far/hazy/shorter back row, 1 = nearer/darker/taller front row. */
  layer: 0 | 1
  /** Per-building tone jitter [0,1] for subtle façade variation. */
  tone: number
  /** Window grid columns (derived from width) — for the painter. */
  cols: number
  /** Window grid rows (derived from height) — for the painter. */
  rows: number
}

export interface SkylineOptions {
  /** Buildings in the far (hazy) row. */
  farCount?: number
  /** Buildings in the near (taller) row. */
  nearCount?: number
}

const DEFAULTS = { farCount: 34, nearCount: 22 } as const

/**
 * Deterministically lay out a wrap-around city skyline for the given seed.
 * Buildings are distributed across the full [0,1) azimuth in two depth rows;
 * the near row is taller/darker, the far row shorter/hazier. Never throws;
 * clamps degenerate counts.
 */
export function skylineLayout(seed: number, opts: SkylineOptions = {}): SkylineBuilding[] {
  const farCount = Math.max(0, Math.floor(opts.farCount ?? DEFAULTS.farCount))
  const nearCount = Math.max(0, Math.floor(opts.nearCount ?? DEFAULTS.nearCount))
  const rng = mulberry32(seed >>> 0)
  const out: SkylineBuilding[] = []

  const row = (count: number, layer: 0 | 1) => {
    if (count <= 0) return
    const slot = 1 / count
    for (let i = 0; i < count; i++) {
      // Even slots + jitter so the skyline reads irregular but never overlaps badly.
      const jitter = (rng() - 0.5) * slot * 0.5
      const w = slot * (layer === 1 ? 0.7 : 0.55) * (0.7 + rng() * 0.6)
      const x = (i * slot + jitter + (slot - w) / 2 + 1) % 1
      const base = layer === 1 ? 0.34 : 0.16
      const span = layer === 1 ? 0.5 : 0.32
      const h = Math.min(1, base + rng() * span)
      const cols = Math.max(1, Math.round(w * 90))
      const rows = Math.max(2, Math.round(h * 26))
      out.push({ x, w, h, layer, tone: rng(), cols, rows })
    }
  }
  // Far row first so the painter draws it behind the near row.
  row(farCount, 0)
  row(nearCount, 1)
  return out
}
