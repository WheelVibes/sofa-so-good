/**
 * Lux → colour mapping for the 3D floor heatmap (LP5 tail) + its UI legend.
 *
 * The stops follow residential lighting bands (the same guidance behind
 * `roomLux.ts` RECOMMENDED_LUX): <50 lx reads as dark/dim, 100–300 lx is
 * comfortable living-room ambient, 300–500 lx is kitchen/desk task level,
 * 750+ lx is brighter than any home zone needs. Colours run a perceptually
 * obvious cold→hot ramp (deep blue → blue → green → yellow → orange → red).
 *
 * These literal RGB values are **data visualisation inside a texture / legend
 * swatch**, not UI chrome — the no-hardcoded-colour rule applies to surfaces,
 * which the legend renders with token classes.
 *
 * Pure (no three) → unit-testable; `luxGridRgba` feeds a three `DataTexture`.
 */

import { MASKED, type RoomLuxGrid } from './luxGrid'

export interface LuxStop {
  lux: number
  /** 0–255 RGB. */
  color: [number, number, number]
  /** Short band label for the legend. */
  label: string
}

/** Ascending-lux gradient stops (piecewise-linear between them, clamped at
 *  the ends). Shared by the texture builder and the panel legend. */
export const LUX_STOPS: readonly LuxStop[] = [
  { lux: 0, color: [21, 27, 64], label: 'Unlit' },
  { lux: 50, color: [43, 92, 226], label: 'Dim' },
  { lux: 150, color: [34, 178, 122], label: 'Ambient' },
  { lux: 300, color: [240, 205, 47], label: 'Living' },
  { lux: 500, color: [243, 134, 38], label: 'Task' },
  { lux: 750, color: [229, 57, 53], label: 'Bright' },
]

/** Map an illuminance to its heat colour (clamped; non-finite → the 0-lx stop). */
export function luxToRgb(lux: number): [number, number, number] {
  const v = Number.isFinite(lux) ? lux : 0
  if (v <= LUX_STOPS[0].lux) return [...LUX_STOPS[0].color]
  const last = LUX_STOPS[LUX_STOPS.length - 1]
  if (v >= last.lux) return [...last.color]
  for (let i = 0; i < LUX_STOPS.length - 1; i++) {
    const a = LUX_STOPS[i]
    const b = LUX_STOPS[i + 1]
    if (v <= b.lux) {
      const t = (v - a.lux) / (b.lux - a.lux)
      return [
        Math.round(a.color[0] + (b.color[0] - a.color[0]) * t),
        Math.round(a.color[1] + (b.color[1] - a.color[1]) * t),
        Math.round(a.color[2] + (b.color[2] - a.color[2]) * t),
      ]
    }
  }
  return [...last.color]
}

/**
 * Pack a room grid into RGBA bytes for a `DataTexture`. Texture row 0 must
 * land at UV v=0, which on a floor plane rotated -π/2 about X is the **max-z**
 * edge — so grid rows (row 0 = min z) are written bottom-up (flipped).
 * Masked / out-of-room cells get alpha 0; everything else `alpha`.
 */
export function luxGridRgba(grid: RoomLuxGrid, alpha = 255): Uint8Array {
  const { cols, rows, values } = grid
  const out = new Uint8Array(cols * rows * 4)
  for (let iz = 0; iz < rows; iz++) {
    const srcRow = rows - 1 - iz // flip: texture row 0 = max-z grid row
    for (let ix = 0; ix < cols; ix++) {
      const v = values[srcRow * cols + ix]
      const o = (iz * cols + ix) * 4
      if (v === MASKED || !Number.isFinite(v)) {
        // Leave RGB 0, alpha 0 — fully transparent outside the room.
        continue
      }
      const [r, g, b] = luxToRgb(v)
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = alpha
    }
  }
  return out
}
