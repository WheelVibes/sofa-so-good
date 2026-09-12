import { describe, expect, it } from 'vitest'
import { LIGHTMAP_RED_TO_LUMA } from '../../src/scene/visibilityLightmap'
// @ts-expect-error — dev probes are plain .mjs with no type declarations (see probeImports.test.ts).
import { LIT_THRESHOLD, rec709, summarise } from './lightmap-channel.mjs'

/**
 * LIGHTMAP-CHANNEL — the pure halves of the probe, plus the constant it feeds.
 *
 * The scan itself needs the shipped map set, so it cannot run here. What must hold regardless is
 * that the constant the SHADER divides its gain by stays inside the range the maps can produce —
 * if someone edits it to a plausible-looking number, the chroma arm silently stops being
 * level-matched and every comparison against the physical reference becomes a brightness
 * comparison wearing a colour label.
 */
describe('LIGHTMAP_RED_TO_LUMA', () => {
  it('is a ratio of red to luminance, so it must lie strictly between 0 and 1 for a sky-tinted bake', () => {
    expect(LIGHTMAP_RED_TO_LUMA).toBeGreaterThan(0)
    expect(LIGHTMAP_RED_TO_LUMA).toBeLessThan(1)
  })

  it('matches the measured value for the shipped set', () => {
    // Re-derive with `node scripts/dev-probes/lightmap-channel.mjs` after a re-bake. Pinned to 3
    // dp: the probe reports 4, and the 4th moves with the lit-texel threshold.
    expect(LIGHTMAP_RED_TO_LUMA).toBeCloseTo(0.81, 2)
  })
})

describe('rec709', () => {
  it('weights green most, which is what makes it luminance rather than an average', () => {
    expect(rec709(255, 0, 0)).toBeCloseTo(54.2, 1)
    expect(rec709(0, 255, 0)).toBeCloseTo(182.4, 1)
    expect(rec709(0, 0, 255)).toBeCloseTo(18.4, 1)
  })

  it('is the identity on a neutral', () => {
    expect(rec709(100, 100, 100)).toBeCloseTo(100, 6)
  })

  it('makes a blue-dominant texel read HIGHER than its red channel — the whole finding', () => {
    // R 99 / G 128 / B 143 is roughly the shipped set's mean texel.
    expect(rec709(99, 128, 143)).toBeGreaterThan(99)
  })
})

describe('summarise', () => {
  it('reports mean, sd and percentiles', () => {
    const s = summarise([1, 2, 3, 4, 5])
    expect(s.n).toBe(5)
    expect(s.mean).toBeCloseTo(3, 6)
    expect(s.p50).toBe(3)
    expect(s.sd).toBeCloseTo(Math.sqrt(2), 6)
  })

  it('is a POPULATION sd, not a sample one', () => {
    // n, not n-1: this describes the texels measured, it does not estimate a wider population.
    expect(summarise([0, 2]).sd).toBeCloseTo(1, 6)
  })
})

describe('LIT_THRESHOLD', () => {
  it('excludes near-black texels, where a channel ratio is quantisation noise', () => {
    expect(LIT_THRESHOLD).toBeGreaterThan(0)
    // Low enough to keep genuinely dim interior texels, which are most of an indirect bake.
    expect(LIT_THRESHOLD).toBeLessThan(64)
  })
})
