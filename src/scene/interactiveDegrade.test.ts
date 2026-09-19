import { beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/flags/registry'
import { resolveFlags } from '../features/flags/resolve'
import {
  __resetInteractiveDegrade,
  type DegradeInputs,
  degradedDpr,
  effectiveCoarsePointer,
  halvedRungDpr,
  LONG_FRAME_HOLD_COARSE_MS,
  LONG_FRAME_HOLD_MS,
  LONG_FRAME_MS,
  lastLongFrameTime,
  longFrameHoldMs,
  MIN_DEGRADED_DPR,
  noteRenderedFrame,
  RELEASE_DEBOUNCE_MS,
  shouldDegradeDpr,
} from './interactiveDegrade'

/** GPU-STARVE-1 — the pure interactive-degrade decision. */

const base: DegradeInputs = {
  now: 10_000,
  gestureActive: false,
  gestureEndedAt: 0,
  lastLongFrameAt: 0,
  postprocessing: true,
  effectiveDpr: 2,
  recording: false,
}

describe('shouldDegradeDpr', () => {
  it('is off when idle (no gesture, no long frame)', () => {
    expect(shouldDegradeDpr(base)).toBe(false)
  })

  it('degrades while a camera gesture is held', () => {
    expect(shouldDegradeDpr({ ...base, gestureActive: true })).toBe(true)
  })

  it('never degrades below the post-processing tiers (High/Maximum only)', () => {
    expect(shouldDegradeDpr({ ...base, gestureActive: true, postprocessing: false })).toBe(false)
  })

  it('never degrades a recording', () => {
    expect(shouldDegradeDpr({ ...base, gestureActive: true, recording: true })).toBe(false)
  })

  it('skips when there is nothing to shed (effective DPR at/below the floor)', () => {
    expect(shouldDegradeDpr({ ...base, gestureActive: true, effectiveDpr: MIN_DEGRADED_DPR })).toBe(
      false,
    )
  })

  it('holds through the release debounce, then restores', () => {
    const endedAt = base.now - RELEASE_DEBOUNCE_MS + 50
    expect(shouldDegradeDpr({ ...base, gestureEndedAt: endedAt })).toBe(true)
    expect(shouldDegradeDpr({ ...base, gestureEndedAt: base.now - RELEASE_DEBOUNCE_MS - 1 })).toBe(
      false,
    )
  })

  it('a recent long frame holds the degrade for the hold window', () => {
    const longAt = base.now - LONG_FRAME_HOLD_MS + 100
    expect(shouldDegradeDpr({ ...base, lastLongFrameAt: longAt })).toBe(true)
    expect(shouldDegradeDpr({ ...base, lastLongFrameAt: base.now - LONG_FRAME_HOLD_MS - 1 })).toBe(
      false,
    )
  })
})

describe('degradedDpr', () => {
  it('halves the effective DPR (device 2 → 1)', () => {
    expect(degradedDpr(2)).toBe(1)
  })

  it('floors at the minimum (device 1 → 0.5, device 0.5 stays 0.5)', () => {
    expect(degradedDpr(1)).toBe(MIN_DEGRADED_DPR)
    expect(degradedDpr(0.5)).toBe(MIN_DEGRADED_DPR)
  })
})

describe('halvedRungDpr (DPR-HALVED-DENSITY)', () => {
  it('flag OFF reproduces the old byte-identical behaviour at every density', () => {
    for (const dpr of [1, 2, 3]) {
      for (const dprMax of [1, 1.5, 2]) {
        expect(halvedRungDpr(dpr, dprMax, false)).toBe(Math.min(dpr, 1))
      }
    }
  })

  it('flag ON: DPR-1 is unchanged (1) at every dprMax', () => {
    for (const dprMax of [1, 1.5, 2]) {
      expect(halvedRungDpr(1, dprMax, true)).toBe(1)
    }
  })

  it('flag ON: DPR-2 lands at 1 at every dprMax', () => {
    for (const dprMax of [1, 1.5, 2]) {
      expect(halvedRungDpr(2, dprMax, true)).toBe(1)
    }
  })

  it('flag ON: DPR-3 lands at 1.5 at every dprMax (device floor dominates)', () => {
    for (const dprMax of [1, 1.5, 2]) {
      expect(halvedRungDpr(3, dprMax, true)).toBeCloseTo(1.5)
    }
  })

  it('never exceeds the device pixel ratio', () => {
    for (const dpr of [1, 2, 3]) {
      for (const dprMax of [1, 1.5, 2]) {
        expect(halvedRungDpr(dpr, dprMax, true)).toBeLessThanOrEqual(dpr)
      }
    }
  })
})

describe('noteRenderedFrame (long-frame bookkeeping)', () => {
  beforeEach(() => __resetInteractiveDegrade())

  it('records a slow frame only while frames are continuously driven', () => {
    noteRenderedFrame(LONG_FRAME_MS + 100, false, 5_000)
    expect(lastLongFrameTime()).toBe(0) // idle demand-mode gap — not a slow frame
    noteRenderedFrame(LONG_FRAME_MS + 100, true, 6_000)
    expect(lastLongFrameTime()).toBe(0) // first driven frame — dt spans the idle gap
    noteRenderedFrame(LONG_FRAME_MS + 100, true, 6_500)
    expect(lastLongFrameTime()).toBe(6_500) // second driven frame — trusted
  })

  it('ignores the first driven frame after an idle gap (GPU-STARVE-3)', () => {
    // Gesture starts: the first frame's delta reaches back to the last idle
    // frame, so a long "delta" here is the gap, not a slow frame.
    noteRenderedFrame(5_000, true, 10_000)
    expect(lastLongFrameTime()).toBe(0)
    // Dropping out of driven mode re-arms the guard.
    noteRenderedFrame(LONG_FRAME_MS + 100, true, 10_400)
    expect(lastLongFrameTime()).toBe(10_400)
    noteRenderedFrame(16, false, 20_000)
    noteRenderedFrame(LONG_FRAME_MS + 100, true, 25_000)
    expect(lastLongFrameTime()).toBe(10_400) // first driven frame again — ignored
  })

  it('ignores fast frames', () => {
    noteRenderedFrame(16, true, 6_900) // arm: previous frame driven
    noteRenderedFrame(LONG_FRAME_MS - 1, true, 7_000)
    expect(lastLongFrameTime()).toBe(0)
  })
})

describe('effectiveCoarsePointer (DEGRADE-UNIFIED, S6)', () => {
  it('flag off: byte-identical to the pre-fix legacy rule at every input', () => {
    for (const actual of [false, true]) {
      for (const mobileFloorFlag of [false, true]) {
        for (const sw of [false, true]) {
          expect(effectiveCoarsePointer(actual, mobileFloorFlag, sw, false)).toBe(
            mobileFloorFlag && actual,
          )
        }
      }
    }
  })

  it('flag on: a fine-pointer desktop takes the coarse-pointer branch (two frames, 1s hold)', () => {
    const coarse = effectiveCoarsePointer(false, true, false, true)
    expect(coarse).toBe(true)
    expect(longFrameHoldMs(coarse)).toBe(LONG_FRAME_HOLD_COARSE_MS)
    // Two consecutive long frames are required to arm, same as touch.
    __resetInteractiveDegrade()
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 1_000, coarse)
    noteRenderedFrame(16, true, 1_050, coarse) // arm the "previous frame driven" gate
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 1_100, coarse)
    expect(lastLongFrameTime()).toBe(0) // first long frame alone never arms
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 1_200, coarse)
    expect(lastLongFrameTime()).toBe(1_200) // second consecutive long frame arms
  })

  it('flag on: a fine-pointer desktop still floors at half the effective DPR (unchanged)', () => {
    expect(degradedDpr(1, 1)).toBe(MIN_DEGRADED_DPR)
  })

  it('flag on: a DPR-2 desktop floors at 1 (unchanged)', () => {
    expect(degradedDpr(2, 2)).toBe(1)
  })

  it('flag on: the SOFTWARE rasteriser keeps the OLD rule regardless of the flag', () => {
    expect(effectiveCoarsePointer(false, true, true, true)).toBe(false)
    expect(effectiveCoarsePointer(true, true, true, true)).toBe(true) // legacy still honours an actually-coarse pointer
  })

  it('mobileDegradeFloor off + unified on: unified still wins (independent flags)', () => {
    expect(effectiveCoarsePointer(false, false, false, true)).toBe(true)
  })
})

describe('degradeRuleUnified feature flag (both modes per CLAUDE.md)', () => {
  it('is registered simple-tier, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.degradeRuleUnified
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').degradeRuleUnified).toBe(true)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').degradeRuleUnified).toBe(true)
  })
})

describe('interactiveDegrade feature flag (both modes per CLAUDE.md)', () => {
  it('is registered simple-tier, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.interactiveDegrade
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (part of the core view loop)', () => {
    expect(resolveFlags(false, {}, false, 'simple').interactiveDegrade).toBe(true)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').interactiveDegrade).toBe(true)
  })
})
