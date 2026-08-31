import { describe, expect, it } from 'vitest'
import {
  BUILTIN_MATERIALS,
  BUILTIN_MATERIALS_BY_CATEGORY,
  DEFAULT_FLOOR,
  DEFAULT_ROOM_WALL,
  DEFAULT_WALL,
} from './builtinCatalog'

describe('BUILTIN_MATERIALS', () => {
  it('every entry id matches its key', () => {
    for (const [k, v] of Object.entries(BUILTIN_MATERIALS)) {
      expect(v.id).toBe(k)
    }
  })

  it('every textured floor entry has a parseable source URL', () => {
    for (const m of Object.values(BUILTIN_MATERIALS)) {
      if (m.kind !== 'textured') continue
      expect(() => new URL(m.sourceUrl ?? '')).not.toThrow()
      expect(m.uvScale[0]).toBeGreaterThan(0)
      expect(m.uvScale[1]).toBeGreaterThan(0)
    }
  })

  it('every entry has a valid 6- or 7-char hex swatch', () => {
    for (const m of Object.values(BUILTIN_MATERIALS)) {
      expect(m.swatch).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('default ids exist in the catalog', () => {
    expect(BUILTIN_MATERIALS[DEFAULT_FLOOR]).toBeDefined()
    expect(BUILTIN_MATERIALS[DEFAULT_WALL]).toBeDefined()
  })

  it('groups every entry exactly once', () => {
    const flat = Object.values(BUILTIN_MATERIALS_BY_CATEGORY).flat()
    const ids = new Set(flat.map((m) => m.id))
    expect(ids.size).toBe(Object.keys(BUILTIN_MATERIALS).length)
  })
})

// WARM-WALL-CAST — the default flat's painted walls must stay NEAR-NEUTRAL.
// The living/dining room used to override to `wall-paint-warm` (#e9d8c4), the
// largest single surface in the app at 22–34% of a walk-mode frame, and it was
// the measured reason the rendered picture carried more chroma than any material
// in it (mean 0.206 vs every high-coverage albedo at ≤0.22 saturation). A warm
// cast on the neutral surfaces is the strongest "this is a render" cue there is,
// so a future palette edit must not quietly reintroduce one on the DEFAULT.
describe('default wall finishes are near-neutral (WARM-WALL-CAST)', () => {
  /** HSV saturation of an sRGB hex — the perceptual "how colourful" axis the
   *  chroma probes report, not three's linear-space channel spread. */
  const hsvSat = (hex: string): number => {
    const n = Number.parseInt(hex.slice(1), 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
    const max = Math.max(r, g, b)
    return max === 0 ? 0 : (max - Math.min(r, g, b)) / max
  }

  it('the living/dining room takes the plain plaster default, not a cream', () => {
    expect(DEFAULT_ROOM_WALL.livingDining).toBeUndefined()
  })

  it('every PAINTED default wall sits below 0.10 saturation', () => {
    const ids = [DEFAULT_WALL, ...Object.values(DEFAULT_ROOM_WALL)]
    for (const id of ids) {
      const m = BUILTIN_MATERIALS[id as keyof typeof BUILTIN_MATERIALS]
      expect(m, `${id} is not in the catalog`).toBeDefined()
      // Tiled wet-wall finishes are a spec choice (glazed porcelain in the
      // kitchen/baths) and are judged on their own terms; this bound is about
      // the broad painted plaster that fills the frame. A textured (photo)
      // finish carries no `pattern` at all, hence the `in` narrowing.
      if (!('pattern' in m) || m.pattern !== 'plaster') continue
      expect(hsvSat(m.swatch), `${id} (${m.swatch}) is a tinted paint`).toBeLessThan(0.1)
    }
  })
})
