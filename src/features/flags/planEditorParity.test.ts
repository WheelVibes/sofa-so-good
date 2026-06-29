import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'
import type { FeatureFlag } from './types'

/**
 * Flag gating for the 2D-plan-editor parity features (PARITY-PLAN-GUIDES,
 * PARITY-CORNER-FILLET, PARITY-DIM-CHAIN, GAP-SUGGEST). All are pro-tier
 * authoring aids: present in Pro, hidden in Simple (the default). Tested in BOTH
 * modes per the CLAUDE.md hard rule.
 */
const FLAGS: FeatureFlag[] = [
  'planGuides',
  'cornerFillet',
  'dimensionChain',
  'gapSuggest',
  'triplanarWalls',
]

describe('plan-editor parity feature flags', () => {
  for (const flag of FLAGS) {
    it(`${flag} is a pro-tier prod-safe feature, default on`, () => {
      const def = FEATURE_FLAGS[flag]
      expect(def).toBeDefined()
      expect(def.tier).toBe('pro')
      expect(def.default).toBe(true)
      expect(def.devOnly).toBeUndefined()
    })

    it(`${flag} is ON in Pro mode`, () => {
      expect(resolveFlags(false, {}, false, 'pro')[flag]).toBe(true)
    })

    it(`${flag} is forced OFF in Simple mode`, () => {
      expect(resolveFlags(false, {}, false, 'simple')[flag]).toBe(false)
    })
  }
})
