import { normalizeHex } from '../../materials/colorHarmony'

/** HSV colour. `h` 0..360, `s`/`v` 0..1. Used by the colour picker's
 *  saturation/value pad (the clean two-gradient square), distinct from the HSL
 *  helpers in `materials/colorHarmony.ts` used elsewhere. Pure + unit-tested. */
export interface Hsv {
  h: number
  s: number
  v: number
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/** Hex → HSV, or `null` for an invalid hex (reuses `normalizeHex`). */
export function hexToHsv(hex: string): Hsv | null {
  const n = normalizeHex(hex)
  if (!n) return null
  const r = Number.parseInt(n.slice(1, 3), 16) / 255
  const g = Number.parseInt(n.slice(3, 5), 16) / 255
  const b = Number.parseInt(n.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

/** HSV → `#rrggbb`. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const hh = ((h % 360) + 360) % 360
  const ss = clamp01(s)
  const vv = clamp01(v)
  const c = vv * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = vv - c
  let r = 0
  let g = 0
  let b = 0
  if (hh < 60) [r, g, b] = [c, x, 0]
  else if (hh < 120) [r, g, b] = [x, c, 0]
  else if (hh < 180) [r, g, b] = [0, c, x]
  else if (hh < 240) [r, g, b] = [0, x, c]
  else if (hh < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const hex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
