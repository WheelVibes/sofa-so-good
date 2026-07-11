import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/flags/registry'
import { resolveFlags } from '../features/flags/resolve'
import type { RenderTier } from '../scene/quality'
import { RENDER_TIERS } from '../scene/quality'
import {
  POM_ELIGIBLE_PATTERNS,
  pomEligiblePattern,
  pomFloorEligible,
  pomFloorTierEnabled,
  pomHeightScaleForPattern,
  pomStepsForTier,
} from './pomFloor'
import type { ProceduralPattern } from './types'

/**
 * PHOTO-POM — parallax-occlusion mapping on hero floors. These cover the PURE
 * decision helpers (eligibility / tier gating / step budget / height scale) that
 * gate the GPU ray-march, so the tier byte-identical guarantee and the Simple/Pro
 * flag gate are pinned without a WebGL context.
 */
describe('pomFloor eligibility', () => {
  it('flags exactly the geometric grout-relief floor patterns', () => {
    for (const p of ['tile', 'hexagon', 'subway', 'checker', 'brick', 'parquet', 'herringbone']) {
      expect(pomEligiblePattern(p as ProceduralPattern)).toBe(true)
    }
    // Smooth / noise patterns have no crisp relief to recess → excluded.
    for (const p of ['carpet', 'concrete', 'marble', 'terrazzo', 'wood', 'plaster', 'stripe']) {
      expect(pomEligiblePattern(p as ProceduralPattern)).toBe(false)
    }
  })

  it('POM_ELIGIBLE_PATTERNS and pomEligiblePattern agree', () => {
    for (const p of POM_ELIGIBLE_PATTERNS) expect(pomEligiblePattern(p)).toBe(true)
  })
})

describe('pomFloor tier gating (Performance/Medium byte-identical)', () => {
  it('enables POM on High and Maximum only', () => {
    expect(pomFloorTierEnabled('performance')).toBe(false)
    expect(pomFloorTierEnabled('medium')).toBe(false)
    expect(pomFloorTierEnabled('high')).toBe(true)
    expect(pomFloorTierEnabled('maximum')).toBe(true)
  })

  it('gives 0 steps on Performance/Medium and scales up High→Max', () => {
    expect(pomStepsForTier('performance')).toBe(0)
    expect(pomStepsForTier('medium')).toBe(0)
    expect(pomStepsForTier('high')).toBe(16)
    expect(pomStepsForTier('maximum')).toBe(32)
    // Max ray-marches finer than High.
    expect(pomStepsForTier('maximum')).toBeGreaterThan(pomStepsForTier('high'))
  })

  it('every tier has a defined, finite step budget', () => {
    for (const t of RENDER_TIERS) {
      const s = pomStepsForTier(t as RenderTier)
      expect(Number.isFinite(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('pomFloorEligible (flag × tier × pattern)', () => {
  it('is true only for an eligible pattern on High/Max with the flag on', () => {
    expect(pomFloorEligible('tile', 'high', true)).toBe(true)
    expect(pomFloorEligible('parquet', 'maximum', true)).toBe(true)
  })

  it('is false when the flag is off (even on Max with an eligible pattern)', () => {
    expect(pomFloorEligible('tile', 'maximum', false)).toBe(false)
  })

  it('is false on Performance/Medium regardless of pattern/flag', () => {
    expect(pomFloorEligible('tile', 'performance', true)).toBe(false)
    expect(pomFloorEligible('brick', 'medium', true)).toBe(false)
  })

  it('is false for an ineligible (smooth) pattern even on Max', () => {
    expect(pomFloorEligible('carpet', 'maximum', true)).toBe(false)
    expect(pomFloorEligible('wood', 'maximum', true)).toBe(false)
  })
})

describe('pomHeightScaleForPattern', () => {
  it('returns a positive parallax depth for every eligible pattern', () => {
    for (const p of POM_ELIGIBLE_PATTERNS) {
      const s = pomHeightScaleForPattern(p)
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThan(0.1) // stays a realistic grout depth, not a canyon
    }
  })

  it('recesses chunky brick joints deeper than thin tile grout', () => {
    expect(pomHeightScaleForPattern('brick')).toBeGreaterThan(pomHeightScaleForPattern('tile'))
  })
})

describe('pomFloors feature flag (Simple/Pro)', () => {
  it('is registered pro-tier, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.pomFloors
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (pro feature hidden)', () => {
    expect(resolveFlags(false, {}, false, 'simple').pomFloors).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').pomFloors).toBe(true)
  })
})
