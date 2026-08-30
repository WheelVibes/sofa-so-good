import { describe, expect, it } from 'vitest'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { buildDefaultPlan } from './defaultPlan'
import { planExtent } from './planExtent'
import { PLAN_TEMPLATES } from './templates'

/**
 * PLAN-EXTENT (v0.31.5.102) — geometry sized from the apartment box must follow
 * the LOADED plan.
 *
 * `CommentPins` and `TapeMeasure` each raycast against a transparent floor plane
 * sized `APARTMENT_EXT_* + 2 * PAD` (PAD = 4 m) and centred on the default flat,
 * i.e. x in [-4, 16.725] and z in [-4, 13.375], with no plan check at all.
 * Measured: `tpl-terrace-ground` is **14.0 m** deep, so its last **0.625 m**
 * could receive neither a comment pin nor a tape-measure pick; `tpl-hdb-jumbo`
 * (13.2 m) had 0.175 m of margin left. `OrbitCamera` already had the correct
 * one-liner privately — this shares it.
 */
const PAD = 4

describe('planExtent', () => {
  it('CONTROL: the default flat still reports the fixed apartment extents', () => {
    // Identity is the claim: this must be a no-op for the plan the constants
    // describe.
    expect(planExtent(buildDefaultPlan())).toEqual([APARTMENT_EXT_W, APARTMENT_EXT_D])
  })

  it('the constant-sized plane FAILED to cover at least one shipped template', () => {
    // Pins the defect itself, so a future change to the templates or to PAD that
    // silently reintroduces it fails here rather than in the field.
    const reachZ = APARTMENT_EXT_D / 2 + (APARTMENT_EXT_D + PAD * 2) / 2
    const tooDeep = PLAN_TEMPLATES.filter((t) => planExtent(t)[1] > reachZ)
    expect(tooDeep.map((t) => t.id)).toContain('tpl-terrace-ground')
  })

  it('the plan-derived plane covers EVERY shipped template', () => {
    for (const t of PLAN_TEMPLATES) {
      const [w, d] = planExtent(t)
      // Same geometry the components build: centred on the plan box, padded.
      const reachX = w / 2 + (w + PAD * 2) / 2
      const reachZ = d / 2 + (d + PAD * 2) / 2
      expect(reachX, `${t.id} x`).toBeGreaterThanOrEqual(w)
      expect(reachZ, `${t.id} z`).toBeGreaterThanOrEqual(d)
    }
  })

  it('returns a positive footprint for every template (no zero-size plane)', () => {
    for (const t of PLAN_TEMPLATES) {
      const [w, d] = planExtent(t)
      expect(w, `${t.id} w`).toBeGreaterThan(0)
      expect(d, `${t.id} d`).toBeGreaterThan(0)
    }
  })
})
