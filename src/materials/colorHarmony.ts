/**
 * Colour-harmony engine (CUSTOMIZE-MASTER-PALETTE). Pure, deterministic, no
 * three/React/store imports — given a master colour palette it derives a set of
 * **recommended blending colours** that harmonise with it (complementary,
 * analogous, triadic companions plus tints/shades and a derived neutral), so the
 * app can offer a "recommended" swatch row that updates whenever the palette (or
 * a per-room override) changes. Unit-tested.
 */

import { relativeLuminance } from '../analysis/imagePalette'

/** Normalise a hex string to lower-case `#rrggbb`, or `null` if not a hex colour.
 *  Accepts `#rgb`, `#rrggbb`, and `#rrggbbaa` (alpha dropped). */
export function normalizeHex(hex: string): string | null {
  if (typeof hex !== 'string') return null
  const m = hex.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(m)) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
  if (/^#[0-9a-f]{6}$/.test(m)) return m
  if (/^#[0-9a-f]{8}$/.test(m)) return m.slice(0, 7)
  return null
}

export interface Hsl {
  h: number // 0..360
  s: number // 0..1
  l: number // 0..1
}

/** Convert a hex colour to HSL, or `null` if it isn't a valid hex. */
export function hexToHsl(hex: string): Hsl | null {
  const n = normalizeHex(hex)
  if (!n) return null
  const r = Number.parseInt(n.slice(1, 3), 16) / 255
  const g = Number.parseInt(n.slice(3, 5), 16) / 255
  const b = Number.parseInt(n.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r:
        h = ((g - b) / d) % 6
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
        break
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, l }
}

/** Convert HSL back to a `#rrggbb` hex (inputs clamped/wrapped to valid ranges). */
export function hslToHex({ h, s, l }: Hsl): string {
  const hh = ((h % 360) + 360) % 360
  const ss = Math.min(1, Math.max(0, s))
  const ll = Math.min(1, Math.max(0, l))
  const c = (1 - Math.abs(2 * ll - 1)) * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const mm = ll - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hh < 60) [r, g, b] = [c, x, 0]
  else if (hh < 120) [r, g, b] = [x, c, 0]
  else if (hh < 180) [r, g, b] = [0, c, x]
  else if (hh < 240) [r, g, b] = [0, x, c]
  else if (hh < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to2 = (v: number) =>
    Math.round((v + mm) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

/**
 * A TONAL contrast colour derived from a host `hex`: the SAME hue + saturation,
 * nudged only in lightness so a thin thread/detail (a tuft stitch) reads AGAINST
 * its host instead of the fixed chalk-white default. The direction is chosen by
 * the host's WCAG relative luminance — a LIGHT host is darkened by `darkenAmt`
 * (relative), a DARK host lightened by `lightenAmt` (toward white) — so stitches
 * on dark velvet read as a slightly lighter thread of the same colour, and on a
 * pale linen as a subtle shadow line. Returns `null` for an unparseable hex.
 * Pure (reuses `relativeLuminance` + the hex↔HSL pair). */
export function tonalContrast(hex: string, lightenAmt = 0.2, darkenAmt = 0.25): string | null {
  const norm = normalizeHex(hex)
  const hsl = norm ? hexToHsl(norm) : null
  if (!norm || !hsl) return null
  const r = Number.parseInt(norm.slice(1, 3), 16)
  const g = Number.parseInt(norm.slice(3, 5), 16)
  const b = Number.parseInt(norm.slice(5, 7), 16)
  // Luminance ~0.2 ≈ the perceptual light/dark midpoint (mid-grey sits near it).
  const light = relativeLuminance({ r, g, b }) > 0.2
  const l = light ? hsl.l * (1 - darkenAmt) : hsl.l + (1 - hsl.l) * lightenAmt
  return hslToHex({ h: hsl.h, s: hsl.s, l: Math.min(1, Math.max(0, l)) })
}

/** Candidate blends derived from ONE base colour, ordered most→least essential:
 *  complementary, the two analogous neighbours, the two triadic companions, a
 *  lighter tint and a darker shade, and a low-saturation neutral. */
function candidatesFor(base: Hsl): string[] {
  const at = (dh: number, s = base.s, l = base.l) => hslToHex({ h: base.h + dh, s, l })
  const tint = hslToHex({
    h: base.h,
    s: Math.max(0, base.s - 0.15),
    l: Math.min(0.92, base.l + 0.22),
  })
  const shade = hslToHex({ h: base.h, s: base.s, l: Math.max(0.08, base.l - 0.22) })
  const neutral = hslToHex({ h: base.h, s: Math.min(0.12, base.s), l: 0.6 })
  return [at(180), at(30), at(-30), at(120), at(-120), tint, shade, neutral]
}

/**
 * Recommended blending colours that harmonise with `palette` (1–5 hex colours).
 * Interleaves each base's candidates (complementary first, then analogous, …) so
 * the result stays varied even when only one base colour is set, drops anything
 * already in the palette or duplicated, and caps at `max` (default 10). A palette
 * with no valid colours yields an empty list. Deterministic.
 */
export function recommendedBlends(palette: string[], max = 10): string[] {
  const bases = palette.map(hexToHsl).filter((h): h is Hsl => h != null)
  if (bases.length === 0) return []
  const seen = new Set(palette.map(normalizeHex).filter((h): h is string => h != null))
  const perBase = bases.map(candidatesFor)
  const out: string[] = []
  // Round-robin across bases so variety leads (each base contributes its
  // complementary before any base contributes its shade, etc.).
  const depth = Math.max(...perBase.map((c) => c.length))
  for (let i = 0; i < depth && out.length < max; i++) {
    for (const cands of perBase) {
      if (out.length >= max) break
      const c = cands[i]
      if (!c) continue
      const n = normalizeHex(c)
      if (!n || seen.has(n)) continue
      seen.add(n)
      out.push(n)
    }
  }
  return out
}
