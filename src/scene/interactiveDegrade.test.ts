import { beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/flags/registry'
import { resolveFlags } from '../features/flags/resolve'
import {
  __resetInteractiveDegrade,
  type DegradeInputs,
  degradedDpr,
  LONG_FRAME_HOLD_MS,
  LONG_FRAME_MS,
  lastLongFrameTime,
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

describe('noteRenderedFrame (long-frame bookkeeping)', () => {
  beforeEach(() => __resetInteractiveDegrade())

  it('records a slow frame only while frames are continuously driven', () => {
    noteRenderedFrame(LONG_FRAME_MS + 100, false, 5_000)
    expect(lastLongFrameTime()).toBe(0) // idle demand-mode gap — not a slow frame
    noteRenderedFrame(LONG_FRAME_MS + 100, true, 6_000)
    expect(lastLongFrameTime()).toBe(6_000)
  })

  it('ignores fast frames', () => {
    noteRenderedFrame(LONG_FRAME_MS - 1, true, 7_000)
    expect(lastLongFrameTime()).toBe(0)
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
