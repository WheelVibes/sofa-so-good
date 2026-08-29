import { describe, expect, it } from 'vitest'
import { composerPlan } from './Effects'
import { QUALITY_PRESETS } from './quality'

/**
 * WALL-NO-COMPOSER (v0.31.5.67). `Effects` used to return `null` when a tier
 * wanted neither the full post stack nor AO, which left `performance` — and only
 * `performance` — rasterising into the canvas' DEFAULT framebuffer. That
 * framebuffer is created with `preserveDrawingBuffer: true` for the in-app
 * capture features, and in that combination interior WALL FACES are not drawn.
 * Measured in three environments; centre-band luminance 150.7 (gone) -> 113.8
 * (present) once a composer mounts.
 *
 * The invariant is deliberately about EXISTENCE, not contents: a tier may drop
 * every optional pass, but it may never drop the composer.
 */
describe('composer plan', () => {
  it('mounts a composer for every shipped tier', () => {
    for (const [tier, q] of Object.entries(QUALITY_PRESETS)) {
      expect(composerPlan(q).mount, `${tier} must mount a composer`).toBe(true)
    }
  })

  it('still mounts one for the tier that wants no passes at all', () => {
    // This is exactly the `performance` combination that regressed.
    expect(composerPlan({ postprocessing: false, ao: false })).toEqual({
      mount: true,
      full: false,
      ao: false,
    })
  })

  it('passes the tier flags through without deciding existence', () => {
    expect(composerPlan({ postprocessing: true, ao: true })).toEqual({
      mount: true,
      full: true,
      ao: true,
    })
    // AO-only (medium, TIER-AO) still mounts, and still asks for AO.
    expect(composerPlan({ postprocessing: false, ao: true }).ao).toBe(true)
  })
})
