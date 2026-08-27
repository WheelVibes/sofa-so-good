import { describe, expect, it } from 'vitest'
import {
  AUTO_PROMOTE_CEILING,
  type AutoTierState,
  classifyWindow,
  DEMOTE_COST_MS,
  DEMOTE_WINDOWS,
  decideAutoTier,
  effectiveCeiling,
  FRAME_BUDGET_MS,
  MIN_WINDOW_FRAMES,
  minTier,
  PROMOTE_COST_MS,
  PROMOTE_WINDOWS,
} from './adaptiveTier'

const at = (tier: AutoTierState['tier'], autoMaxTier: AutoTierState['autoMaxTier'] = null) => ({
  tier,
  autoMaxTier,
})

const win = (p90: number, n = MIN_WINDOW_FRAMES) => ({ n, p50: p90, p90 })

describe('classifyWindow', () => {
  it('classifies an over-budget window as bad', () => {
    expect(classifyWindow(win(DEMOTE_COST_MS))).toBe('bad')
    expect(classifyWindow(win(FRAME_BUDGET_MS + 5))).toBe('bad')
  })

  it('classifies a cheap window as good', () => {
    expect(classifyWindow(win(PROMOTE_COST_MS))).toBe('good')
    expect(classifyWindow(win(4.7))).toBe('good')
  })

  it('classifies the band between the two as neutral', () => {
    // Holding ~11ms is neither a failure nor evidence of headroom, so it must
    // accumulate toward neither verdict.
    expect(classifyWindow(win((PROMOTE_COST_MS + DEMOTE_COST_MS) / 2))).toBe('neutral')
  })

  it('treats a too-short window as neutral, NEVER as a failure', () => {
    // The bug this replaced: in demand mode a window can close after a couple of
    // frames, and one expensive discrete edit then read as a sustained failure.
    expect(classifyWindow(win(50, MIN_WINDOW_FRAMES - 1))).toBe('neutral')
    expect(classifyWindow({ n: 0, p50: -1, p90: -1 })).toBe('neutral')
  })

  it('treats a non-finite cost as neutral', () => {
    expect(classifyWindow(win(Number.NaN))).toBe('neutral')
  })

  it('keeps both thresholds inside the frame budget', () => {
    // A tier is demoted BEFORE it eats the whole budget, because the browser
    // still has to composite, lay out the DOM overlays and service input.
    expect(DEMOTE_COST_MS).toBeLessThan(FRAME_BUDGET_MS)
    expect(PROMOTE_COST_MS).toBeLessThan(DEMOTE_COST_MS)
  })

  it('leaves a hysteresis band between promote and demote', () => {
    expect(DEMOTE_COST_MS - PROMOTE_COST_MS).toBeGreaterThanOrEqual(3)
  })
})

describe('minTier', () => {
  it('orders by the canonical tier ladder', () => {
    expect(minTier('performance', 'maximum')).toBe('performance')
    expect(minTier('high', 'medium')).toBe('medium')
    expect(minTier('high', 'high')).toBe('high')
  })
})

describe('effectiveCeiling', () => {
  it('never exceeds the auto ceiling even on unrestricted hardware', () => {
    expect(effectiveCeiling('maximum', null)).toBe(AUTO_PROMOTE_CEILING)
  })

  it('respects the capability veto', () => {
    expect(effectiveCeiling('performance', null)).toBe('performance')
  })

  it('respects a learned ceiling', () => {
    expect(effectiveCeiling('high', 'medium')).toBe('medium')
  })

  it('takes the most restrictive of the three', () => {
    expect(effectiveCeiling('performance', 'high')).toBe('performance')
    expect(effectiveCeiling('high', 'performance')).toBe('performance')
  })
})

describe('decideAutoTier — demotion', () => {
  it('steps down after the demote threshold', () => {
    expect(decideAutoTier(at('high'), 'high', 0, DEMOTE_WINDOWS)).toEqual({
      tier: 'medium',
      autoMaxTier: 'medium',
    })
  })

  it('holds below the demote threshold', () => {
    expect(decideAutoTier(at('high'), 'high', 0, DEMOTE_WINDOWS - 1)).toBeNull()
  })

  it('records the failure as the learned ceiling', () => {
    // This — not a wider threshold — is what stops oscillation: the rung that
    // failed is never climbed back into.
    const down = decideAutoTier(at('high'), 'high', 0, DEMOTE_WINDOWS)
    expect(down?.autoMaxTier).toBe('medium')
    expect(decideAutoTier(down!, 'high', PROMOTE_WINDOWS, 0)).toBeNull()
  })

  it('cannot step below the lowest tier', () => {
    expect(decideAutoTier(at('performance'), 'high', 0, DEMOTE_WINDOWS * 5)).toBeNull()
  })

  it('prefers demotion over promotion when both thresholds are met', () => {
    // A tier failing RIGHT NOW must come down even if good windows accumulated
    // earlier in the session.
    expect(decideAutoTier(at('medium'), 'high', PROMOTE_WINDOWS, DEMOTE_WINDOWS)?.tier).toBe(
      'performance',
    )
  })
})

describe('decideAutoTier — promotion', () => {
  it('steps up after the promote threshold', () => {
    expect(decideAutoTier(at('medium'), 'high', PROMOTE_WINDOWS, 0)).toEqual({
      tier: 'high',
      autoMaxTier: null,
    })
  })

  it('holds below the promote threshold', () => {
    expect(decideAutoTier(at('medium'), 'high', PROMOTE_WINDOWS - 1, 0)).toBeNull()
  })

  it('is slower to promote than to demote', () => {
    // Dropping quality is a correction the user wants immediately; raising it is
    // a gamble that costs a visible stutter if it fails.
    expect(PROMOTE_WINDOWS).toBeGreaterThan(DEMOTE_WINDOWS)
  })

  it('stops at the auto ceiling and never reaches maximum', () => {
    const state = at(AUTO_PROMOTE_CEILING, null)
    expect(decideAutoTier(state, 'maximum', PROMOTE_WINDOWS * 10, 0)).toBeNull()
  })

  it('never promotes past a capability veto', () => {
    expect(decideAutoTier(at('performance'), 'performance', PROMOTE_WINDOWS * 10, 0)).toBeNull()
  })

  it('does NOT set the learned ceiling on the way up', () => {
    // `autoMaxTier` means "the rung that failed here". Setting it on a SUCCESS
    // would cap the ladder at the rung just reached, so performance→medium would
    // never continue to high. Boot memory is the persisted `tier` instead.
    expect(decideAutoTier(at('medium'), 'high', PROMOTE_WINDOWS, 0)?.autoMaxTier).toBeNull()
    expect(decideAutoTier(at('medium'), 'high', PROMOTE_WINDOWS, 0)?.tier).toBe('high')
  })

  it('climbs one rung at a time', () => {
    // Probing two rungs at once would risk a much larger stutter and give no
    // information about the rung in between.
    const first = decideAutoTier(at('performance'), 'high', PROMOTE_WINDOWS, 0)
    expect(first?.tier).toBe('medium')
    expect(decideAutoTier(first!, 'high', PROMOTE_WINDOWS, 0)?.tier).toBe('high')
  })
})

describe('decideAutoTier — convergence', () => {
  it('settles instead of oscillating when a rung keeps failing', () => {
    // Walk the ladder the way a device that can hold Medium but not High would:
    // promote, fail, demote — and then confirm it stays put no matter how much
    // good evidence accumulates afterwards.
    let state: AutoTierState = at('medium')
    state = decideAutoTier(state, 'high', PROMOTE_WINDOWS, 0) ?? state
    expect(state.tier).toBe('high')
    state = decideAutoTier(state, 'high', 0, DEMOTE_WINDOWS) ?? state
    expect(state.tier).toBe('medium')
    for (let i = 0; i < 20; i++) {
      const next = decideAutoTier(state, 'high', PROMOTE_WINDOWS, 0)
      expect(next).toBeNull()
      state = next ?? state
    }
    expect(state).toEqual({ tier: 'medium', autoMaxTier: 'medium' })
  })

  it('reaches the ceiling on hardware that sustains it', () => {
    let state: AutoTierState = at('medium')
    for (let i = 0; i < 5; i++) state = decideAutoTier(state, 'high', PROMOTE_WINDOWS, 0) ?? state
    expect(state).toEqual({ tier: AUTO_PROMOTE_CEILING, autoMaxTier: null })
  })
})
