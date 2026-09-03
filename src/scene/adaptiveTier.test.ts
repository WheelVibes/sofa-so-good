import { describe, expect, it } from 'vitest'
import {
  type AutoDeviceState,
  classifyWindow,
  DEMOTE_COST_MS,
  DEMOTE_WINDOWS,
  decideAutoDevice,
  effectiveCeiling,
  FRAME_BUDGET_MS,
  MIN_WINDOW_FRAMES,
  minDevice,
  PROMOTE_COST_MS,
  PROMOTE_WINDOWS,
} from './adaptiveTier'

const at = (
  device: AutoDeviceState['device'],
  autoMaxDevice: AutoDeviceState['autoMaxDevice'] = null,
) => ({
  device,
  autoMaxDevice,
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

describe('minDevice', () => {
  it('orders by the canonical tier ladder', () => {
    expect(minDevice('weak', 'capable')).toBe('weak')
    expect(minDevice('capable', 'weak')).toBe('weak')
    expect(minDevice('capable', 'capable')).toBe('capable')
  })
})

describe('effectiveCeiling', () => {
  it('never exceeds the auto ceiling even on unrestricted hardware', () => {
    expect(effectiveCeiling('capable', null)).toBe('capable')
  })

  it('respects the capability veto', () => {
    expect(effectiveCeiling('weak', null)).toBe('weak')
  })

  it('respects a learned ceiling', () => {
    expect(effectiveCeiling('capable', 'weak')).toBe('weak')
  })

  it('takes the most restrictive of the three', () => {
    expect(effectiveCeiling('weak', 'capable')).toBe('weak')
    expect(effectiveCeiling('capable', 'weak')).toBe('weak')
  })
})

describe('decideAutoDevice — demotion', () => {
  it('steps down after the demote threshold', () => {
    expect(decideAutoDevice(at('capable'), 'capable', 0, DEMOTE_WINDOWS)).toEqual({
      device: 'weak',
      autoMaxDevice: 'weak',
    })
  })

  it('holds below the demote threshold', () => {
    expect(decideAutoDevice(at('capable'), 'capable', 0, DEMOTE_WINDOWS - 1)).toBeNull()
  })

  it('records the failure as the learned ceiling', () => {
    // This — not a wider threshold — is what stops oscillation: the rung that
    // failed is never climbed back into.
    const down = decideAutoDevice(at('capable'), 'capable', 0, DEMOTE_WINDOWS)
    expect(down?.autoMaxDevice).toBe('weak')
    expect(decideAutoDevice(down!, 'capable', PROMOTE_WINDOWS, 0)).toBeNull()
  })

  it('cannot step below the lowest tier', () => {
    expect(decideAutoDevice(at('weak'), 'capable', 0, DEMOTE_WINDOWS * 5)).toBeNull()
  })

  it('prefers demotion over promotion when both thresholds are met', () => {
    // A class failing RIGHT NOW must come down even if good windows accumulated
    // earlier in the session. Started from `capable`, because `weak` is the floor
    // and has nowhere to go — which is a different rule, tested above.
    expect(
      decideAutoDevice(at('capable'), 'capable', PROMOTE_WINDOWS, DEMOTE_WINDOWS)?.device,
    ).toBe('weak')
  })
})

describe('decideAutoDevice — promotion', () => {
  it('steps up after the promote threshold', () => {
    expect(decideAutoDevice(at('weak'), 'capable', PROMOTE_WINDOWS, 0)).toEqual({
      device: 'capable',
      autoMaxDevice: null,
    })
  })

  it('holds below the promote threshold', () => {
    expect(decideAutoDevice(at('weak'), 'capable', PROMOTE_WINDOWS - 1, 0)).toBeNull()
  })

  it('is slower to promote than to demote', () => {
    // Dropping quality is a correction the user wants immediately; raising it is
    // a gamble that costs a visible stutter if it fails.
    expect(PROMOTE_WINDOWS).toBeGreaterThan(DEMOTE_WINDOWS)
  })

  it('stops at the auto ceiling and never reaches maximum', () => {
    const state = at('capable', null)
    expect(decideAutoDevice(state, 'capable', PROMOTE_WINDOWS * 10, 0)).toBeNull()
  })

  it('never promotes past a capability veto', () => {
    expect(decideAutoDevice(at('weak'), 'weak', PROMOTE_WINDOWS * 10, 0)).toBeNull()
  })

  it('does NOT set the learned ceiling on the way up', () => {
    // `autoMaxDevice` means "the rung that failed here". Setting it on a SUCCESS
    // would cap the ladder at the rung just reached, so performance→medium would
    // never continue to high. Boot memory is the persisted `tier` instead.
    expect(decideAutoDevice(at('weak'), 'capable', PROMOTE_WINDOWS, 0)?.autoMaxDevice).toBeNull()
    expect(decideAutoDevice(at('weak'), 'capable', PROMOTE_WINDOWS, 0)?.device).toBe('capable')
  })

  it('climbs one rung and then holds at the top', () => {
    // The ladder is two rungs now, so one step IS the whole climb. What still
    // matters is that it stops: a second promotion attempt from the top must
    // return null rather than stepping off the end of the array.
    const first = decideAutoDevice(at('weak'), 'capable', PROMOTE_WINDOWS, 0)
    expect(first?.device).toBe('capable')
    expect(decideAutoDevice(first!, 'capable', PROMOTE_WINDOWS, 0)).toBeNull()
  })
})

describe('decideAutoDevice — convergence', () => {
  it('settles instead of oscillating when a rung keeps failing', () => {
    // Walk the ladder the way a device that can hold Medium but not High would:
    // promote, fail, demote — and then confirm it stays put no matter how much
    // good evidence accumulates afterwards.
    let state: AutoDeviceState = at('weak')
    state = decideAutoDevice(state, 'capable', PROMOTE_WINDOWS, 0) ?? state
    expect(state.device).toBe('capable')
    state = decideAutoDevice(state, 'capable', 0, DEMOTE_WINDOWS) ?? state
    expect(state.device).toBe('weak')
    for (let i = 0; i < 20; i++) {
      const next = decideAutoDevice(state, 'capable', PROMOTE_WINDOWS, 0)
      expect(next).toBeNull()
      state = next ?? state
    }
    expect(state).toEqual({ device: 'weak', autoMaxDevice: 'weak' })
  })

  it('reaches the ceiling on hardware that sustains it', () => {
    let state: AutoDeviceState = at('weak')
    for (let i = 0; i < 5; i++)
      state = decideAutoDevice(state, 'capable', PROMOTE_WINDOWS, 0) ?? state
    expect(state).toEqual({ device: 'capable', autoMaxDevice: null })
  })
})
