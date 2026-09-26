import { beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/flags/registry'
import { resolveFlags } from '../features/flags/resolve'
import { gateVerdictOnResolution } from './adaptiveTier'
import {
  __resetDynamicResolutionReadout,
  BLOCK_MAX_MS,
  blockMsFor,
  CLIMB_WINDOWS,
  DROP_MS,
  type DynResState,
  dprLadder,
  dropTarget,
  dynamicFloorDpr,
  dynamicResolutionAtCeiling,
  initialDynResState,
  MIN_CLIMB_PERIOD_MS,
  MISS_MS,
  PANIC_MS,
  PROVEN_WINDOWS,
  publishDynamicResolution,
  REST_SETTLE_MS,
  SETTLE_FRAMES,
  stepDynamicResolution,
  TARGET_MS,
} from './dynamicResolution'
import { halvedRungDpr } from './interactiveDegrade'

/** R7-AF — the pure dynamic-resolution controller. */

const LADDER_2X = [1, 1.25, 1.5, 1.75, 2]

/** Drive the controller with a constant rAF interval for `ms` of wall clock. */
function run(
  s: DynResState,
  ladder: number[],
  clock: { t: number },
  dt: number,
  ms: number,
  moving = true,
): number {
  let idx = s.motionLevel
  const end = clock.t + ms
  while (clock.t < end) {
    clock.t += dt
    idx = stepDynamicResolution(s, ladder, { now: clock.t, dtMs: dt, moving, recording: false })
  }
  return idx
}

describe('dynamicFloorDpr / dprLadder', () => {
  it('floors at 1.0 on every display up to DPR 2 (the owner floor)', () => {
    expect(dynamicFloorDpr(1)).toBe(1)
    expect(dynamicFloorDpr(1.5)).toBe(1)
    expect(dynamicFloorDpr(2)).toBe(1)
  })

  it('floors a DPR-3 phone at 1.5 — the MOBILE-POLISH density rule', () => {
    expect(dynamicFloorDpr(3)).toBe(1.5)
  })

  it('agrees with the flag-on dprHalved rung on every display, so the two cannot fight', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3]) {
      expect(halvedRungDpr(dpr, 2, true)).toBe(dynamicFloorDpr(dpr))
    }
  })

  it('builds quantised 0.125 rungs from floor to ceiling', () => {
    expect(dprLadder(1, 2)).toEqual([1, 1.125, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875, 2])
    expect(dprLadder(1, 1.5)).toEqual([1, 1.125, 1.25, 1.375, 1.5])
    expect(dprLadder(1.5, 2)).toEqual([1.5, 1.625, 1.75, 1.875, 2])
  })

  it('is a single rung (inert) when the ceiling is at or below the floor — a DPR-1 display', () => {
    expect(dprLadder(1, 1)).toEqual([1])
    expect(dprLadder(1.5, 1)).toEqual([1])
  })

  it('keeps an off-grid ceiling as the top rung and folds a sliver step into it', () => {
    expect(dprLadder(1, 1.3)).toEqual([1, 1.125, 1.3])
    expect(dprLadder(1, 1.28)).toEqual([1, 1.125, 1.28])
    expect(dprLadder(1, 1.15)).toEqual([1, 1.15])
  })

  it('handles an off-grid floor (DPR 2.2 → floor 1.1)', () => {
    expect(dprLadder(1.1, 2)).toEqual([1.1, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875, 2])
  })
})

describe('dropTarget (pixel model)', () => {
  it('jumps straight to the floor from a 104 ms frame at DPR 2 (the measured living room)', () => {
    expect(dropTarget(LADDER_2X, 4, 104)).toBe(0)
  })

  it('takes the highest rung the model says fits', () => {
    // 20 ms at 2.0: 1.75 → 15.3 (> 15.0 aim), 1.5 → 11.25 fits.
    expect(dropTarget(LADDER_2X, 4, 20)).toBe(2)
  })

  it('always drops at least one rung', () => {
    expect(dropTarget(LADDER_2X, 4, DROP_MS + 0.01)).toBeLessThanOrEqual(3)
  })
})

describe('stepDynamicResolution', () => {
  let s: DynResState
  const clock = { t: 0 }
  beforeEach(() => {
    s = initialDynResState(LADDER_2X.length)
    clock.t = 10_000
  })

  it('is sharp at rest: the top rung, whatever was learned in motion', () => {
    s.motionLevel = 0
    expect(
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: 16.7,
        moving: false,
        recording: false,
      }),
    ).toBe(4)
  })

  it('a single-rung ladder is always index 0 (DPR-1 display untouched)', () => {
    const one = initialDynResState(1)
    expect(
      stepDynamicResolution(one, [1], { now: 1, dtMs: 500, moving: true, recording: false }),
    ).toBe(0)
  })

  it('never changes resolution under a recording', () => {
    run(s, LADDER_2X, clock, 104, 2000)
    expect(
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t + 16,
        dtMs: 104,
        moving: true,
        recording: true,
      }),
    ).toBe(4)
  })

  it('drops FAST: a 10 Hz scene reaches the floor in well under half a second', () => {
    const t0 = clock.t
    // The panic path fires on the 2nd consecutive >100 ms frame after the settle frames.
    let reached = -1
    while (clock.t - t0 < 1000) {
      clock.t += 104
      const idx = stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: 104,
        moving: true,
        recording: false,
      })
      if (idx === 0) {
        reached = clock.t - t0
        break
      }
    }
    expect(reached).toBeGreaterThan(0)
    expect(reached).toBeLessThanOrEqual((SETTLE_FRAMES + 2) * 104)
  })

  it('drops by window median for a moderately slow scene (30 Hz at 2.0 → settles at 1.25)', () => {
    // A GPU whose frame is 33.3 ms at DPR 2 and scales with pixels, vsync-clamped.
    const t0 = clock.t
    while (clock.t - t0 < 3500) {
      const r = LADDER_2X[s.motionLevel] / 2
      const dt = Math.max(TARGET_MS, 33.3 * r * r)
      clock.t += dt
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: dt,
        moving: true,
        recording: false,
      })
    }
    // 1.5 → 18.7 ms (misses), 1.25 → 13.0 ms (holds vsync): it settles on 1.25, and the
    // skipped 1.5 rung is blocked by the same measurement rather than probed at once.
    expect(LADDER_2X[s.motionLevel]).toBe(1.25)
    expect(s.changes).toBe(1)
    // Over a minute the doubling back-off keeps re-probes of the doomed rungs rare.
    while (clock.t - t0 < 60_000) {
      const r = LADDER_2X[s.motionLevel] / 2
      const dt = Math.max(TARGET_MS, 33.3 * r * r)
      clock.t += dt
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: dt,
        moving: true,
        recording: false,
      })
    }
    expect(s.changes).toBeLessThanOrEqual(11)
  })

  it('holds in the hysteresis band (18 ms is neither a drop nor a climb)', () => {
    s.motionLevel = 2
    const before = s.changes
    run(s, LADDER_2X, clock, 18, 5000)
    expect(s.motionLevel).toBe(2)
    expect(s.changes).toBe(before)
  })

  it('climbs SLOW: one rung per ≥ CLIMB_WINDOWS at vsync and ≥ MIN_CLIMB_PERIOD_MS', () => {
    s.motionLevel = 0
    s.lastChangeAt = clock.t
    run(s, LADDER_2X, clock, 16.7, MIN_CLIMB_PERIOD_MS - 50)
    expect(s.motionLevel).toBe(0)
    run(s, LADDER_2X, clock, 16.7, 400)
    expect(s.motionLevel).toBe(1)
    // Never two rungs inside one climb period.
    run(s, LADDER_2X, clock, 16.7, MIN_CLIMB_PERIOD_MS - 500)
    expect(s.motionLevel).toBe(1)
  })

  it('needs CLIMB_WINDOWS consecutive good windows, not just elapsed time', () => {
    expect(CLIMB_WINDOWS).toBeGreaterThanOrEqual(4)
  })

  it('does not re-climb into a level that just failed (anti-oscillation back-off)', () => {
    // Fails at 2.0 → drops; then the scene becomes cheap at 1.75 but NOT at 2.0.
    run(s, LADDER_2X, clock, 20, 400)
    const landed = s.motionLevel
    expect(landed).toBeLessThan(4)
    expect(s.blockedUntil[4]).toBeGreaterThan(clock.t)
    // Simulate a GPU where every rung below 2.0 holds vsync and 2.0 misses: count changes.
    const t0 = clock.t
    let changes = 0
    let last = s.motionLevel
    while (clock.t - t0 < 30_000) {
      const dt = s.motionLevel === 4 ? 20 : 16.7
      clock.t += dt
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: dt,
        moving: true,
        recording: false,
      })
      if (s.motionLevel !== last) {
        changes++
        last = s.motionLevel
      }
    }
    // Without the back-off this probes 2.0 every ~1.2 s (≈50 changes in 30 s); with it the
    // doubling back-off caps the retries at a handful.
    expect(changes).toBeLessThanOrEqual(10)
  })

  it('reverts a climb that lands in the hysteresis band instead of settling at ~53 fps', () => {
    s.motionLevel = 2
    s.lastChangeAt = 1
    const t0 = clock.t
    let sawThree = false
    while (clock.t - t0 < 3000) {
      const dt = s.motionLevel === 3 ? 18 : 16.7
      clock.t += dt
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: dt,
        moving: true,
        recording: false,
      })
      if (s.motionLevel === 3) sawThree = true
    }
    expect(sawThree).toBe(true)
    expect(s.motionLevel).toBe(2)
    expect(s.blockedUntil[3]).toBeGreaterThan(clock.t)
  })

  it('settles on the measured M4 lights-off living room at 1.125, not the floor', () => {
    // R7-AB §9.4 cost model at a 1200x900 CSS viewport: 11.7 ms at DPR 1, 13.4 ms per extra Mpx.
    const full = dprLadder(1, 2)
    const d = initialDynResState(full.length)
    const c = { t: 10_000 }
    const cost = (L: number) => Math.max(TARGET_MS, 11.7 + 13.4 * (1.08 * L * L - 1.08))
    const t0 = c.t
    let changes = 0
    let last = d.motionLevel
    while (c.t - t0 < 60_000) {
      const dt = cost(full[d.motionLevel])
      c.t += dt
      stepDynamicResolution(d, full, { now: c.t, dtMs: dt, moving: true, recording: false })
      if (d.motionLevel !== last) {
        changes++
        last = d.motionLevel
      }
    }
    expect(full[d.motionLevel]).toBe(1.125)
    // One drop, one climb to 1.125, then only the back-off probes of 1.25 (a probe + revert
    // pair at roughly 8, 16, 32 s intervals): ~11 changes in a minute, falling off with time.
    expect(changes).toBeLessThanOrEqual(12)
  })

  it('the back-off doubles and caps', () => {
    expect(blockMsFor(1)).toBe(8000)
    expect(blockMsFor(2)).toBe(16_000)
    expect(blockMsFor(10)).toBe(BLOCK_MAX_MS)
  })

  it('remembers the motion level across a rest, and restarts measuring cleanly', () => {
    run(s, LADDER_2X, clock, 104, 800)
    expect(s.motionLevel).toBe(0)
    // Rest: sharp.
    clock.t += REST_SETTLE_MS + 10
    expect(
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: 16.7,
        moving: false,
        recording: false,
      }),
    ).toBe(4)
    // Next gesture starts at the learned level — the snap lands during motion.
    clock.t += 5000
    expect(
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: 5000,
        moving: true,
        recording: false,
      }),
    ).toBe(0)
  })

  it('holds the motion level through the release debounce', () => {
    run(s, LADDER_2X, clock, 104, 800)
    clock.t += REST_SETTLE_MS - 100
    expect(
      stepDynamicResolution(s, LADDER_2X, {
        now: clock.t,
        dtMs: 16.7,
        moving: false,
        recording: false,
      }),
    ).toBe(0)
  })

  it('ignores an idle gap / paused tab rather than reading it as a slow frame', () => {
    const before = s.motionLevel
    stepDynamicResolution(s, LADDER_2X, {
      now: clock.t + 3000,
      dtMs: 3000,
      moving: true,
      recording: false,
    })
    stepDynamicResolution(s, LADDER_2X, {
      now: clock.t + 6000,
      dtMs: 3000,
      moving: true,
      recording: false,
    })
    expect(s.motionLevel).toBe(before)
  })

  it('one isolated long frame (a shader compile) does not panic', () => {
    run(s, LADDER_2X, clock, 16.7, 300)
    clock.t += PANIC_MS + 50
    stepDynamicResolution(s, LADDER_2X, {
      now: clock.t,
      dtMs: PANIC_MS + 50,
      moving: true,
      recording: false,
    })
    run(s, LADDER_2X, clock, 16.7, 300)
    expect(s.motionLevel).toBe(4)
  })

  it('a scene that already holds vsync at the top never moves', () => {
    run(s, LADDER_2X, clock, TARGET_MS, 20_000)
    expect(s.motionLevel).toBe(4)
    expect(s.changes).toBe(0)
  })
})

describe('steady mode (R7-AG dynamicResolutionSteady)', () => {
  /**
   * The measured M4 2400x1800 case (§11): at the floor every frame holds vsync; one rung up the
   * MEDIAN still reads 16.7 ms but frames miss (33.3 ms): an isolated one in `missEvery`, plus a
   * burst of five every ~3 s (what flips a window median past DROP_MS and made the R7-AF
   * controller drop). A constant-interval model cannot represent either, which is why the R7-AF
   * tests never saw the oscillation.
   */
  function jittery(steady: boolean, missEvery: number, ms: number) {
    const full = dprLadder(1, 2)
    const d = initialDynResState(full.length)
    const c = { t: 10_000 }
    let n = 0
    let changes = 0
    let last = d.motionLevel
    let atFloorFrames = 0
    let frames = 0
    let visitedAbove = false
    const probeTimes: number[] = []
    const t0 = c.t
    while (c.t - t0 < ms) {
      n++
      const lvl = d.motionLevel
      // Floor holds; 1.125 is marginal; anything higher misses outright.
      const miss = n % missEvery === 0 || n % 180 < 5
      const dt = lvl === 0 ? 16.7 : lvl === 1 ? (miss ? 33.3 : 16.7) : 33.3
      c.t += dt
      stepDynamicResolution(d, full, { now: c.t, dtMs: dt, moving: true, recording: false, steady })
      if (d.motionLevel !== last) {
        changes++
        if (d.motionLevel === 1 && last === 0) probeTimes.push(c.t)
        last = d.motionLevel
      }
      if (c.t - t0 > 1000 && d.motionLevel >= 2) visitedAbove = true
      frames++
      if (d.motionLevel === 0) atFloorFrames++
    }
    return { d, full, changes, floorShare: atFloorFrames / frames, visitedAbove, probeTimes }
  }

  it('keeps the marginal rung out of motion: the floor held, no climb past it', () => {
    const r = jittery(true, 40, 60_000)
    const control = jittery(false, 40, 60_000)
    // The R7-AF controller (control arm) holds the marginal rung and probes the one above it.
    expect(control.visitedAbove).toBe(true)
    expect(r.floorShare).toBeGreaterThan(0.9)
    // Steady never keeps 1.125 long enough to earn a probe of 1.25.
    expect(r.visitedAbove).toBe(false)
  })

  it('backs a marginal rung off by doubling instead of re-probing it every 8 s', () => {
    const r = jittery(true, 40, 120_000)
    // Steady starts the back-off one doubling later (16 s), so the first re-probe is not at 8 s.
    expect(r.probeTimes[1] - r.probeTimes[0]).toBeGreaterThan(16_000)
    // Every probe of 1.125 failed and none was ever "proven", so the streak keeps growing.
    expect(r.d.failures[1]).toBeGreaterThanOrEqual(3)
    const gaps = r.probeTimes.slice(1).map((t, i) => t - r.probeTimes[i])
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1] * 1.5)
  })

  it('still climbs to and holds a rung that genuinely holds vsync (no misses)', () => {
    const full = dprLadder(1, 2)
    const d = initialDynResState(full.length)
    d.motionLevel = 0
    const c = { t: 10_000 }
    run(d, full, c, 16.7, 1) // prime
    let last = 0
    const t0 = c.t
    while (c.t - t0 < 30_000) {
      c.t += 16.7
      last = stepDynamicResolution(d, full, {
        now: c.t,
        dtMs: 16.7,
        moving: true,
        recording: false,
        steady: true,
      })
    }
    expect(last).toBe(full.length - 1)
  })

  it('a scene at vsync at the top never moves in steady mode either', () => {
    const d = initialDynResState(LADDER_2X.length)
    const c = { t: 10_000 }
    const t0 = c.t
    while (c.t - t0 < 20_000) {
      c.t += TARGET_MS
      stepDynamicResolution(d, LADDER_2X, {
        now: c.t,
        dtMs: TARGET_MS,
        moving: true,
        recording: false,
        steady: true,
      })
    }
    expect(d.motionLevel).toBe(4)
    expect(d.changes).toBe(0)
  })

  it('one isolated missed frame is neither a drop nor a climb credit', () => {
    const d = initialDynResState(LADDER_2X.length)
    const c = { t: 10_000 }
    run(d, LADDER_2X, c, 16.7, 300)
    c.t += MISS_MS + 10
    stepDynamicResolution(d, LADDER_2X, {
      now: c.t,
      dtMs: MISS_MS + 10,
      moving: true,
      recording: false,
      steady: true,
    })
    run(d, LADDER_2X, c, 16.7, 300)
    expect(d.motionLevel).toBe(4)
  })

  it('needs a sustained hold before a rung sheds its failure streak', () => {
    expect(PROVEN_WINDOWS).toBeGreaterThan(CLIMB_WINDOWS)
  })
})

describe('class-ladder coupling (resolution inner, class outer)', () => {
  beforeEach(() => __resetDynamicResolutionReadout())

  it('holds a good class verdict to neutral while resolution is below its ceiling', () => {
    expect(gateVerdictOnResolution('good', false)).toBe('neutral')
    expect(gateVerdictOnResolution('good', true)).toBe('good')
  })

  it('never gates a demotion', () => {
    expect(gateVerdictOnResolution('bad', false)).toBe('bad')
    expect(gateVerdictOnResolution('neutral', false)).toBe('neutral')
  })

  it('reads at-ceiling whenever the controller is inactive (identity with the flag off)', () => {
    expect(dynamicResolutionAtCeiling()).toBe(true)
    publishDynamicResolution({
      active: false,
      motionAtCeiling: false,
      dpr: 1,
      motionDpr: 1,
      changes: 0,
    })
    expect(dynamicResolutionAtCeiling()).toBe(true)
    publishDynamicResolution({
      active: true,
      motionAtCeiling: false,
      dpr: 2,
      motionDpr: 1,
      changes: 3,
    })
    expect(dynamicResolutionAtCeiling()).toBe(false)
  })
})

describe('dynamicResolutionSteady flag', () => {
  it('is registered simple-tier, default on, and on in BOTH Simple and Pro mode', () => {
    expect(FEATURE_FLAGS.dynamicResolutionSteady.tier).toBe('simple')
    expect(FEATURE_FLAGS.dynamicResolutionSteady.default).toBe(true)
    expect(resolveFlags(false, {}, false, 'simple').dynamicResolutionSteady).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').dynamicResolutionSteady).toBe(true)
  })
})

describe('dynamicResolution flag', () => {
  it('is registered simple-tier, default on', () => {
    expect(FEATURE_FLAGS.dynamicResolution.tier).toBe('simple')
    expect(FEATURE_FLAGS.dynamicResolution.default).toBe(true)
  })

  it('is on in BOTH Simple and Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').dynamicResolution).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').dynamicResolution).toBe(true)
  })
})
