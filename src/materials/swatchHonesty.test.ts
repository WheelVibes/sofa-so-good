import { describe, expect, it } from 'vitest'
import { GENERATED_MATERIALS } from './generatedCatalog'

/**
 * A finish's NAME must not be contradicted by its own swatch.
 *
 * `.197` found both of the catalog's colour-word names were wrong: "White tiles"
 * was a brown/grey mosaic (swatch `#6e6156`, luma 99) and "White leather" was a
 * flat greige (`#969380`, luma 146). A user picking "White tiles" got a dark
 * floor — measured in the render at open-floor mean **73.2** against oak vinyl's
 * **105.3**, i.e. the "white" floor was the DARKER of the two.
 *
 * The swatch itself is trustworthy: every one matches its albedo texture's mean
 * to within rounding (checked across the floor set), because the asset pipeline
 * derives it. So the swatch is the honest half and the name is what drifts —
 * which is exactly what a test can pin.
 *
 * Deliberately loose. This is not a colour-accuracy assertion; it only catches a
 * name that its own swatch flatly contradicts, so a legitimately off-white cream
 * or a mid grey still passes.
 */
const luma = (hex: string): number => {
  const h = hex.replace('#', '')
  return (
    0.2126 * Number.parseInt(h.slice(0, 2), 16) +
    0.7152 * Number.parseInt(h.slice(2, 4), 16) +
    0.0722 * Number.parseInt(h.slice(4, 6), 16)
  )
}

const RULES: { word: RegExp; ok: (l: number) => boolean; why: string }[] = [
  { word: /\bwhite\b/i, ok: (l) => l >= 190, why: 'a white finish should be bright' },
  { word: /\bblack\b/i, ok: (l) => l <= 60, why: 'a black finish should be dark' },
  { word: /\blight\b/i, ok: (l) => l >= 150, why: 'a light finish should be bright' },
  { word: /\bdark\b/i, ok: (l) => l <= 110, why: 'a dark finish should be dark' },
  { word: /\b(cream|ivory)\b/i, ok: (l) => l >= 175, why: 'a cream finish should be bright' },
]

describe('finish names are not contradicted by their own swatch', () => {
  it('holds for every generated material', () => {
    const bad: string[] = []
    for (const m of GENERATED_MATERIALS) {
      if (!m.swatch) continue
      for (const r of RULES) {
        if (!r.word.test(m.name)) continue
        const l = luma(m.swatch)
        if (!r.ok(l))
          bad.push(`${m.id} "${m.name}" swatch ${m.swatch} luma ${l.toFixed(0)}: ${r.why}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('would catch the two the catalog actually shipped', () => {
    // Guards the guard: without these the test above passes vacuously if the
    // rules ever stop matching anything.
    const check = (name: string, swatch: string) =>
      RULES.some((r) => r.word.test(name) && !r.ok(luma(swatch)))
    expect(check('White tiles', '#6e6156')).toBe(true)
    expect(check('White leather', '#969380')).toBe(true)
    expect(check('Mosaic tiles', '#6e6156')).toBe(false)
    expect(check('Greige leather', '#969380')).toBe(false)
  })
})
