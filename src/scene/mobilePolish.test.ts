import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/flags/registry'
import { resolveFlags } from '../features/flags/resolve'
import { MOBILE_MSAA_SAMPLES, mobileMsaaSamples } from './Effects'
import {
  __resetInteractiveDegrade,
  DEGRADE_FLOOR_OF_DEVICE,
  degradedDpr,
  LONG_FRAME_HOLD_COARSE_MS,
  LONG_FRAME_HOLD_MS,
  LONG_FRAME_MS,
  lastLongFrameTime,
  longFrameHoldMs,
  MIN_DEGRADED_DPR,
  noteRenderedFrame,
  shouldDegradeDpr,
} from './interactiveDegrade'

/**
 * MOBILE-POLISH (v0.35.2.0) — the device-aware degrade floor, the coarse-pointer
 * long-frame hold, and the mobile MSAA gate.
 */

describe('degradedDpr — the device floor', () => {
  it('is UNCHANGED on a DPR-1 display (the software-rasteriser floor case)', () => {
    expect(degradedDpr(1, 1)).toBe(MIN_DEGRADED_DPR)
    expect(degradedDpr(1)).toBe(MIN_DEGRADED_DPR)
  })

  it('is UNCHANGED on a DPR-2 display', () => {
    expect(degradedDpr(2, 2)).toBe(1)
  })

  it('degrades a DPR-3 phone to 1.5, not 1', () => {
    // effectiveDpr = min(devicePixelRatio 3, dprMax 2) = 2 at `realistic`/`weak`.
    expect(degradedDpr(2, 3)).toBe(1.5)
  })

  it('never goes below 1 on a DPR-3 phone even at the `dprHalved` last rung', () => {
    // The ladder's last rung caps `effectiveDpr` at 1; halving THAT is what put a
    // 195x422 buffer on a 1170x2532 panel.
    expect(degradedDpr(1, 3)).toBe(1)
  })

  it('never UPsizes the buffer', () => {
    for (const eff of [0.5, 1, 1.5, 2, 3]) expect(degradedDpr(eff, 3)).toBeLessThanOrEqual(eff)
  })

  it('the floor is half the device ratio', () => {
    expect(DEGRADE_FLOOR_OF_DEVICE).toBe(0.5)
    expect(degradedDpr(4, 3)).toBe(2) // half of 4 is above the 1.5 floor
  })
})

describe('shouldDegradeDpr with the floors', () => {
  const base = {
    now: 10_000,
    gestureActive: true,
    gestureEndedAt: 0,
    lastLongFrameAt: 0,
    postprocessing: true,
    effectiveDpr: 2,
    recording: false,
  }

  it('still degrades a DPR-3 phone during a gesture (there is 2 -> 1.5 to shed)', () => {
    expect(shouldDegradeDpr({ ...base, devicePixelRatio: 3 })).toBe(true)
  })

  it('does NOT degrade when the floors leave nothing to shed', () => {
    // DPR-3 phone already pinned to effectiveDpr 1 by `dprHalved`: the floor is
    // also 1, so engaging would only cost a buffer clear + repaint.
    expect(shouldDegradeDpr({ ...base, effectiveDpr: 1, devicePixelRatio: 3 })).toBe(false)
  })

  it('keeps the legacy no-op case (effectiveDpr at the absolute floor)', () => {
    expect(shouldDegradeDpr({ ...base, effectiveDpr: 0.5 })).toBe(false)
  })

  it('holds for 3 s on a fine pointer and 1 s on a coarse one', () => {
    expect(longFrameHoldMs(false)).toBe(LONG_FRAME_HOLD_MS)
    expect(longFrameHoldMs(true)).toBe(LONG_FRAME_HOLD_COARSE_MS)
    const held = { ...base, gestureActive: false, lastLongFrameAt: 8_500 } // 1.5 s ago
    expect(shouldDegradeDpr({ ...held, coarsePointer: false })).toBe(true)
    expect(shouldDegradeDpr({ ...held, coarsePointer: true })).toBe(false)
  })
})

describe('noteRenderedFrame — consecutive long frames on a coarse pointer', () => {
  it('a SINGLE long frame arms the hold on a fine pointer', () => {
    __resetInteractiveDegrade()
    noteRenderedFrame(16, true, 1_000)
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 2_000)
    expect(lastLongFrameTime()).toBe(2_000)
  })

  it('a SINGLE long frame does NOT arm it on a coarse pointer', () => {
    __resetInteractiveDegrade()
    noteRenderedFrame(16, true, 1_000, true)
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 2_000, true)
    expect(lastLongFrameTime()).toBe(0)
  })

  it('TWO consecutive long frames do arm it on a coarse pointer', () => {
    __resetInteractiveDegrade()
    noteRenderedFrame(16, true, 1_000, true)
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 2_000, true)
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 2_300, true)
    expect(lastLongFrameTime()).toBe(2_300)
  })

  it('a fast frame between two slow ones resets the run', () => {
    __resetInteractiveDegrade()
    noteRenderedFrame(16, true, 1_000, true)
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 2_000, true)
    noteRenderedFrame(16, true, 2_020, true)
    noteRenderedFrame(LONG_FRAME_MS + 50, true, 3_000, true)
    expect(lastLongFrameTime()).toBe(0)
  })
})

describe('mobileMsaaSamples', () => {
  const on = { full: true, deviceClass: 'weak', softwareRenderer: false, flagOn: true }
  it('multisamples the full stack on the weak class', () => {
    expect(mobileMsaaSamples(on)).toBe(MOBILE_MSAA_SAMPLES)
  })
  it('EXCLUDES a software rasteriser', () => {
    expect(mobileMsaaSamples({ ...on, softwareRenderer: true })).toBe(0)
  })
  it('is off for the capable class, with the flag off, and in AO-only mode', () => {
    expect(mobileMsaaSamples({ ...on, deviceClass: 'capable' })).toBe(0)
    expect(mobileMsaaSamples({ ...on, flagOn: false })).toBe(0)
    expect(mobileMsaaSamples({ ...on, full: false })).toBe(0)
  })
})

describe('the flags ship in BOTH modes', () => {
  for (const f of ['mobileMsaa', 'mobileDegradeFloor'] as const) {
    it(`${f} is simple-tier and on in Simple AND Pro`, () => {
      expect(FEATURE_FLAGS[f].tier).toBe('simple')
      expect(FEATURE_FLAGS[f].default).toBe(true)
      expect(resolveFlags(false, {}, false, 'simple')[f]).toBe(true)
      expect(resolveFlags(false, {}, false, 'pro')[f]).toBe(true)
    })
  }
})
