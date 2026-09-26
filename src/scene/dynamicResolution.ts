/**
 * R7-AF — dynamic render resolution (pure controller).
 *
 * The owner's decision: scale the render resolution continuously to hold a
 * 60 fps frame-time target, between a floor of 1.0 and the display's own DPR
 * (capped at the tier's `dprMax`), the browser upscaling the canvas — the
 * sharpest image the GPU can afford at each moment.
 *
 * Why it is needed (`docs/research/lights-gpu-bound-2026-09-25.md` §9.4): on an
 * Apple M4 at `dprMax 2` (2400x1800) the living room costs 104 ms lights-on and
 * 60 ms lights-off, and the cost scales with pixel count (~10-13 ms per Mpx for
 * the lights alone). Half the pixels is the biggest single lever there is.
 *
 * ## What it subsumes
 *
 * It is not a third mechanism next to `interactiveDegrade` and the `dprHalved`
 * rung — it REPLACES their resolution decision wherever it has a range to work
 * in (`InteractiveDprController` computes one desired ratio, from here or from
 * the legacy rule, never both):
 *
 *  - `interactiveDegrade`'s blanket halving during every gesture is replaced by
 *    a MEASURED motion level: the GPU that can afford 1.75 in motion keeps 1.75,
 *    instead of dropping to 1 on principle. Its long-frame hold is replaced by
 *    the panic path below (two consecutive frames past {@link PANIC_MS} → floor).
 *  - The `dprHalved` rung collapses the ladder's CEILING to its floor. On every
 *    display the rung's value (`halvedRungDpr`, flag on) is exactly this
 *    module's floor, so the two agree by construction rather than fight.
 *  - Where the ladder has one rung (a DPR-1 display, the software rasteriser's
 *    `dprMax 1`, `performance/weak`) this controller is inert and the legacy
 *    rule runs unchanged — a DPR-1 viewport is byte-identical to flag-off.
 *
 * ## Shape (what production engines do, adapted to a demand-mode web canvas)
 *
 *  - **Quantised steps** of {@link DPR_STEP} (Unreal's
 *    `r.DynamicRes.ChangePercentageThreshold` idea — a resize below a threshold
 *    is not worth its reallocation). Every change re-sizes every composer
 *    target (three disposes and re-allocates a `RenderTarget` on `setSize`), so
 *    the ratio must never be a float that moves every frame.
 *  - **Drop fast, climb slow** with a hysteresis band: drop when the median
 *    frame interval is past {@link DROP_MS} (52 fps), jumping as many steps as
 *    the pixel model says are needed; climb one step only after
 *    {@link CLIMB_WINDOWS} consecutive windows at vsync, never sooner than
 *    {@link MIN_CLIMB_PERIOD_MS} after the last change, and never into a level
 *    that failed recently ({@link blockMsFor} — a doubling back-off, the same
 *    anti-oscillation idea as `adaptiveTier`'s learned ceiling, but decaying,
 *    because a room change or a light switch changes the answer).
 *  - **Panic** (Unreal's `MaxConsecutiveOverbudgetGPUFrameCount`): two
 *    consecutive frames past {@link PANIC_MS} go straight to the floor. This is
 *    what keeps the GPU-watchdog protection `interactiveDegrade` was built for.
 *  - **Sharp at rest.** The canvas is `frameloop="demand"`: a still camera
 *    renders one frame, and a single frame has no frame rate to hold. So at rest
 *    the controller returns the CEILING (one repaint, full sharpness), and a
 *    gesture starts at the LEARNED motion level — the change lands while the
 *    image is moving, where it is masked, and the climb back happens while
 *    still, as the brief asks. This is the old degrade's "soft only in motion"
 *    contract, with the softness measured instead of fixed.
 *
 * ## The signal: rAF interval, not render interval, not GPU timers
 *
 * The interval between the controller's own rAF ticks, sampled only while the
 * camera is being driven (a camera gesture — NOT merely a continuous pump: a
 * still view with a spinning fan in it is judged as a still, measured R7-AF). rAF slows when the GPU
 * backs up (§9.2: 25 ms frames → 38 Hz rAF; §9.4: 104 ms → 9.4 Hz), while the
 * RENDER interval is polluted by demand mode (`frameCost.ts`: 59.7 rAF/s vs
 * 30.5 renders/s at 5.7 ms each). `EXT_disjoint_timer_query_webgl2` is not used:
 * R7-AB measured it at 73-84 ms for a 25 ms frame on ANGLE/Metal (§9.1).
 *
 * Pure: no three, no React, no DOM. `InteractiveDprController` owns the wiring.
 */

/** Frame-time target: 60 fps. */
export const TARGET_MS = 1000 / 60

/** Median interval above which the level DROPS (~52 fps). The band between this
 *  and {@link CLIMB_MS} is the hysteresis dead zone. */
export const DROP_MS = TARGET_MS * 1.15

/** Median interval at or below which a window counts toward a CLIMB — at vsync
 *  (16.7 ms plus rAF jitter). */
const CLIMB_MS = 17.5

/** When dropping, aim the pixel model at this fraction of the target so the
 *  landing level has headroom and the next window doesn't drop again. */
const DROP_AIM = 0.9

/** Quantisation step of the device-pixel ratio. 1 → 1.125 is +27% pixels,
 *  1.875 → 2 is +14%: every step is a real change in cost, none is a
 *  reallocation for a rounding error. Measured (R7-AF, M4, 2400x1800 backing
 *  store): at 0.25 the lights-off rooms cost 11.7-15.8 ms at 1.0 and the next
 *  rung (1.25, +56% pixels) never held vsync, so the ladder settled on its floor
 *  and paid two resizes per failed probe; 0.125 puts a rung inside that gap. */
const DPR_STEP = 0.125

/** One interval past this is a candidate panic frame; two consecutive go
 *  straight to the floor. Matches `interactiveDegrade.LONG_FRAME_MS` in spirit
 *  but tighter — at 10 Hz the picture is already unusable. */
export const PANIC_MS = 100

/** A sample window closes after this many frames… */
const WINDOW_FRAMES = 8
/** …or after this long with at least {@link WINDOW_MIN_FRAMES} frames, so a 10 Hz
 *  scene is judged in ~0.3 s instead of ~0.8 s ("drop fast"). */
const WINDOW_MS = 200
const WINDOW_MIN_FRAMES = 3

/**
 * R7-AG STEADY (`dynamicResolutionSteady`): a frame interval past this is a MISSED vsync. At
 * 60 Hz a miss reads 33.3 ms, a hit 16.7 ms plus jitter, so 1.5x the target splits them cleanly.
 *
 * Why the median alone was not enough (measured on an Apple M4 at a 2400x1800 backing store,
 * `docs/research/lights-gpu-bound-2026-09-25.md` §11): the 1.125 rung costs ~16-18 ms, so most
 * frames hit vsync and the window MEDIAN reads 16.7 — a "good" window — while 3-8 % of frames
 * miss. The controller climbed into it, held it at 55-57 Hz, dropped on the first bad window,
 * and — because every good window cleared the level's failure streak — re-probed it every 8 s:
 * 3-5 resolution changes per 15 s walk, each drop a 50-83 ms hitch, against a legacy control arm
 * that held 1.0 at 59.7 Hz with none.
 */
export const MISS_MS = TARGET_MS * 1.5

/** Steady mode: this many missed frames within the last {@link MISS_WINDOWS} windows (~0.5 s)
 *  is a drop, whatever the median says. Measured: isolated misses at ~5 % never put two in one
 *  8-frame window, so a per-window count let the living room sit at 1.125 and ~57 Hz for 34 s. */
const MISS_DROP = 2
const MISS_WINDOWS = 4

/** Steady mode: a climbed rung must pass this many windows with NO miss before it is kept. */
const PROBE_WINDOWS = 3

/** Steady mode: consecutive clean windows (~5 s of motion at 60 Hz) before a rung's failure
 *  streak clears. Until then each failure doubles its back-off (16 → 32 → 64 s, see streakShift), so a
 *  marginal rung is re-probed a handful of times and then left alone, instead of every 8 s. */
export const PROVEN_WINDOWS = 40

/** Frames discarded after a resolution change or the start of motion: the
 *  resize frame itself is a long frame (GPU-STARVE-3 — it clears the buffer
 *  and repaints synchronously), and the first motion tick measures across the
 *  idle gap. */
export const SETTLE_FRAMES = 2

/** Consecutive at-vsync windows before one step UP (~1 s at 60 Hz). */
export const CLIMB_WINDOWS = 6

/** Never climb sooner than this after ANY change. */
export const MIN_CLIMB_PERIOD_MS = 1000

/** Motion is considered over this long after the last motion tick — the same
 *  debounce `interactiveDegrade.RELEASE_DEBOUNCE_MS` uses, so a
 *  drag→pause→drag rhythm doesn't restore and re-drop between strokes. */
export const REST_SETTLE_MS = 350

/** Back-off for a level that just failed: 8 s, doubling per repeat failure,
 *  capped at 64 s. Each failed probe is two resizes, and a resize measured
 *  ~200 ms of stalled frame on an M4 at 2400x1800 (composer re-allocation +
 *  the same-task repaint), so a probe must be rare to be worth its cost. */
const BLOCK_BASE_MS = 8000
export const BLOCK_MAX_MS = 64_000

/** rAF gaps longer than this are a paused tab / main-thread stall of another
 *  origin, not a frame — the window is reset rather than judged. */
const MAX_TRUSTED_INTERVAL_MS = 1000

/** Round to the step grid, tolerating float noise. */
function snap(v: number): number {
  return Math.round(v / DPR_STEP) * DPR_STEP
}

/**
 * The floor for this display: never below 1.0 — and never below half the
 * display's own ratio, the MOBILE-POLISH density rule (`degradedDpr`,
 * `halvedRungDpr`): a DPR-3 phone floors at 1.5, not at 1 (one render pixel per
 * 9 device pixels on a 460 ppi panel reads as blocking). For every DPR ≤ 2 this
 * is exactly the owner's floor of 1.0.
 */
export function dynamicFloorDpr(devicePixelRatio: number): number {
  return Math.max(1, devicePixelRatio * 0.5)
}

/**
 * The quantised ladder between the floor and the ceiling, inclusive, ascending.
 * The ceiling is always the top rung even when it is off the step grid (a
 * user's `dprMax` slider or an odd display ratio such as 1.1); a rung closer
 * than half a step below it is folded into it. A ceiling at or
 * below the floor yields the single rung `[ceiling]` — nothing to control.
 */
export function dprLadder(floor: number, ceiling: number): number[] {
  if (!(ceiling > floor + 1e-6)) return [ceiling]
  const out: number[] = []
  for (let v = floor; v < ceiling - 1e-6; v = snap(v + DPR_STEP)) {
    out.push(v)
    // A floor off the grid (1.1): the next rung is the first grid point above it.
    if (snap(v) !== v) v = Math.floor(v / DPR_STEP) * DPR_STEP
  }
  // A ceiling just off the grid (1.3) would leave a sliver step (1.25 → 1.3) that
  // costs a reallocation for 8% pixels — fold it into the ceiling instead.
  if (out.length > 1 && ceiling - out[out.length - 1] < DPR_STEP / 2) out.pop()
  // Same at the bottom: an off-grid floor (1.1) must not leave a 1.1 → 1.125 sliver.
  if (out.length > 1 && out[1] - out[0] < DPR_STEP / 2) out.splice(1, 1)
  out.push(ceiling)
  return out
}

export interface DynResState {
  /** Ladder index the controller wants while in MOTION (learned). */
  motionLevel: number
  /** perf.now() of the last level change (0 = never). */
  lastChangeAt: number
  /** perf.now() of the last motion tick (0 = never). */
  lastMotionAt: number
  /** Frames still to discard before sampling again. */
  settle: number
  /** Current window's rAF intervals. */
  window: number[]
  windowStartedAt: number
  /** Consecutive at-vsync windows. */
  goodWindows: number
  /** The previous interval was a panic candidate, and its length. */
  prevPanic: boolean
  prevPanicMs: number
  /** Per-level: blocked from climbing into until this time. */
  blockedUntil: number[]
  /** Per-level: consecutive failures (drives the doubling back-off). */
  failures: number[]
  /** The current level was entered by a CLIMB and has not yet been judged: its
   *  first window must hold vsync, or the probe is reverted (a probe that lands in
   *  the hysteresis band would otherwise sit there at ~53 fps for good). */
  probing: boolean
  /** Steady mode: windows the current probe has passed so far. */
  probeWindows: number
  /** Steady mode: consecutive clean windows at the current level, kept across gestures. */
  heldWindows: number
  /** Steady mode: missed-frame counts of the last {@link MISS_WINDOWS} windows at this level. */
  missHistory: number[]
  /** Total level changes applied (instrumentation). */
  changes: number
}

export function initialDynResState(ladderLength: number): DynResState {
  return {
    motionLevel: Math.max(0, ladderLength - 1),
    lastChangeAt: 0,
    lastMotionAt: 0,
    settle: SETTLE_FRAMES,
    window: [],
    windowStartedAt: 0,
    goodWindows: 0,
    prevPanic: false,
    prevPanicMs: 0,
    blockedUntil: new Array(ladderLength).fill(0),
    failures: new Array(ladderLength).fill(0),
    probing: false,
    probeWindows: 0,
    heldWindows: 0,
    missHistory: [],
    changes: 0,
  }
}

export interface DynResInput {
  now: number
  /** rAF interval since the previous tick, ms. */
  dtMs: number
  /** The camera is being driven (a camera gesture is held). */
  moving: boolean
  /** Frame capture in progress — never change resolution under a recording. */
  recording: boolean
  /** R7-AG steady mode (`dynamicResolutionSteady`): judge missed frames, not only the median.
   *  Off (or omitted) reproduces the R7-AF controller exactly. */
  steady?: boolean
}

/** The doubling back-off for a level that has failed `n` times in a row. */
export function blockMsFor(n: number): number {
  return Math.min(BLOCK_MAX_MS, BLOCK_BASE_MS * 2 ** Math.max(0, n - 1))
}

/**
 * Steady mode starts every rung's back-off one doubling later (16 s, not 8 s). A failed probe is
 * two resizes and a 50-67 ms drop hitch (measured, §11), so on a GPU with no headroom above the
 * floor the first-gesture probes are the whole cost; the cap (64 s) is unchanged.
 */
function streakShift(i: DynResInput): number {
  return i.steady === true ? 1 : 0
}

/** Median of a small array (copied, not mutated). */
function median(xs: ReadonlyArray<number>): number {
  const s = xs.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Highest ladder index whose predicted interval fits the drop aim, under the
 * pixel model `interval ∝ dpr²`. The model is optimistic (a CPU submit floor
 * does not shrink with pixels), which is the safe direction for a DROP: an
 * under-shoot is caught by the next window, 0.2-0.3 s later. Always at least one
 * step below `from` (the caller has already decided to drop).
 */
export function dropTarget(ladder: ReadonlyArray<number>, from: number, medianMs: number): number {
  const cur = ladder[from]
  for (let i = from - 1; i > 0; i--) {
    const r = ladder[i] / cur
    if (medianMs * r * r <= TARGET_MS * DROP_AIM) return i
  }
  return 0
}

/**
 * Rungs skipped on the way down are unproven, but the measurement that caused
 * the drop already condemns every one the pixel model says could not hold vsync.
 * The model under-predicts the cost of a SMALLER rung (the CPU floor does not
 * shrink), so a predicted miss is a certain one — block those rather than pay a
 * probe (two resizes) to re-learn it.
 */
function blockSkipped(
  s: DynResState,
  ladder: ReadonlyArray<number>,
  from: number,
  to: number,
  measuredMs: number,
  until: number,
): void {
  for (let k = to + 1; k < from; k++) {
    const r = ladder[k] / ladder[from]
    if (measuredMs * r * r > CLIMB_MS) s.blockedUntil[k] = Math.max(s.blockedUntil[k], until)
  }
}

function reset(s: DynResState, now: number): void {
  s.window = []
  s.windowStartedAt = now
  s.settle = SETTLE_FRAMES
  s.goodWindows = 0
  s.prevPanic = false
}

function changeLevel(s: DynResState, to: number, now: number): void {
  if (to === s.motionLevel) return
  s.probing = to > s.motionLevel
  s.probeWindows = 0
  s.heldWindows = 0
  s.missHistory = []
  s.motionLevel = to
  s.lastChangeAt = now
  s.changes += 1
  reset(s, now)
}

/** Is the controller at rest (sharp still) right now? */
function isAtRest(s: DynResState, now: number): boolean {
  return s.lastMotionAt === 0 || now - s.lastMotionAt >= REST_SETTLE_MS
}

/**
 * One rAF tick. Mutates `s` (a controller-owned singleton — allocation-free on
 * the hot path apart from the small window array) and returns the ladder index
 * to render at right now.
 *
 * At rest and under a recording the answer is the TOP rung; in motion it is the
 * learned `motionLevel`, adjusted by the window rules above.
 */
export function stepDynamicResolution(
  s: DynResState,
  ladder: ReadonlyArray<number>,
  i: DynResInput,
): number {
  const top = ladder.length - 1
  if (top <= 0) return 0
  if (s.motionLevel > top) s.motionLevel = top
  if (i.recording) {
    s.lastMotionAt = 0
    reset(s, i.now)
    return top
  }
  if (!i.moving) {
    if (isAtRest(s, i.now)) {
      // Leaving motion: the next gesture's first tick measures across the idle
      // gap — discard it (and the resize frame the restore itself causes).
      s.window = []
      s.settle = SETTLE_FRAMES
      s.prevPanic = false
      return top
    }
    // Inside the release debounce: hold the motion level, keep sampling (the
    // damping tail still renders).
  } else {
    if (isAtRest(s, i.now)) reset(s, i.now)
    s.lastMotionAt = i.now
  }

  const dt = i.dtMs
  if (!(dt > 0) || dt > MAX_TRUSTED_INTERVAL_MS) {
    reset(s, i.now)
    return s.motionLevel
  }
  if (s.settle > 0) {
    s.settle -= 1
    if (s.settle === 0) s.windowStartedAt = i.now
    return s.motionLevel
  }

  // PANIC: two consecutive very long frames → floor, now.
  const panic = dt > PANIC_MS
  if (panic && s.prevPanic && s.motionLevel > 0) {
    const from = s.motionLevel
    s.failures[from] += 1
    s.blockedUntil[from] = i.now + blockMsFor(s.failures[from] + streakShift(i))
    blockSkipped(s, ladder, from, 0, Math.min(dt, s.prevPanicMs), s.blockedUntil[from])
    changeLevel(s, 0, i.now)
    return 0
  }
  s.prevPanic = panic
  s.prevPanicMs = dt

  if (s.window.length === 0) s.windowStartedAt = i.now - dt
  s.window.push(dt)
  const elapsed = i.now - s.windowStartedAt
  const full =
    s.window.length >= WINDOW_FRAMES ||
    (elapsed >= WINDOW_MS && s.window.length >= WINDOW_MIN_FRAMES)
  if (!full) return s.motionLevel

  const m = median(s.window)
  const steady = i.steady === true
  let misses = 0
  let sum = 0
  for (const v of s.window) {
    sum += v
    if (v > MISS_MS) misses += 1
  }
  const mean = sum / s.window.length
  s.window = []
  s.windowStartedAt = i.now

  let missDrop = false
  if (steady) {
    s.missHistory.push(misses)
    if (s.missHistory.length > MISS_WINDOWS) s.missHistory.shift()
    let recent = 0
    for (const v of s.missHistory) recent += v
    missDrop = recent >= MISS_DROP
  }
  if (m > DROP_MS || missDrop) {
    s.goodWindows = 0
    s.heldWindows = 0
    const from = s.motionLevel
    if (from > 0) {
      s.failures[from] += 1
      const until = i.now + blockMsFor(s.failures[from] + streakShift(i))
      s.blockedUntil[from] = until
      // A miss-driven drop has a median at vsync; the MEAN carries the missed frames' cost.
      const cost = missDrop ? Math.max(m, mean) : m
      const to = dropTarget(ladder, from, cost)
      blockSkipped(s, ladder, from, to, cost, until)
      changeLevel(s, to, i.now)
    }
    return s.motionLevel
  }
  const clean = m <= CLIMB_MS && (!steady || misses === 0)
  if (s.probing) {
    if (!clean) {
      // A failed probe: back to the rung that held, and back off this one.
      s.probing = false
      const from = s.motionLevel
      s.failures[from] += 1
      s.blockedUntil[from] = i.now + blockMsFor(s.failures[from] + streakShift(i))
      changeLevel(s, from - 1, i.now)
      s.probing = false
      return s.motionLevel
    }
    s.probeWindows += 1
    if (!steady || s.probeWindows >= PROBE_WINDOWS) s.probing = false
  }
  if (clean) {
    s.goodWindows += 1
    s.heldWindows += 1
    // A level that holds vsync has proven itself: its failure streak ends. Steady mode asks for
    // a sustained hold, so a rung that passes a few windows and then misses keeps backing off.
    if (!steady || s.heldWindows >= PROVEN_WINDOWS) s.failures[s.motionLevel] = 0
    const up = s.motionLevel + 1
    if (
      up <= top &&
      !s.probing &&
      s.goodWindows >= CLIMB_WINDOWS &&
      i.now - s.lastChangeAt >= MIN_CLIMB_PERIOD_MS &&
      i.now >= s.blockedUntil[up]
    ) {
      changeLevel(s, up, i.now)
    }
    return s.motionLevel
  }
  // Hysteresis band (or one isolated miss in steady mode): neither evidence to drop nor to climb.
  s.goodWindows = 0
  s.heldWindows = 0
  return s.motionLevel
}

// ---------------------------------------------------------------------------
// Shared read-out for the device-class ladder (QualityController) and the dev
// probes. Written by `InteractiveDprController` once per tick.

let active = false
let motionAtCeiling = true
let lastDpr = 0
let changeCount = 0
let motionDpr = 0

export function publishDynamicResolution(v: {
  active: boolean
  motionAtCeiling: boolean
  dpr: number
  motionDpr: number
  changes: number
}): void {
  active = v.active
  motionAtCeiling = v.motionAtCeiling
  lastDpr = v.dpr
  motionDpr = v.motionDpr
  changeCount = v.changes
}

/**
 * Has resolution been fully restored in motion? The device-class ladder may
 * only PROMOTE when this is true: resolution is the fast inner loop and the
 * class the slow outer one, so recovered headroom goes back into pixels first
 * (the same "resolution returns first" order the `dprHalved` rung already had).
 * True whenever the controller is inactive, so the class ladder is unchanged
 * with the flag off or on a single-rung display.
 */
export function dynamicResolutionAtCeiling(): boolean {
  return !active || motionAtCeiling
}

/** Test-only reset of the published read-out. */
export function __resetDynamicResolutionReadout(): void {
  active = false
  motionAtCeiling = true
  lastDpr = 0
  motionDpr = 0
  changeCount = 0
}

// DEV-only probe hook, same pattern as `window.__cameraGesture`.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(
    window as unknown as {
      __dynamicResolution?: () => {
        active: boolean
        dpr: number
        motionDpr: number
        motionAtCeiling: boolean
        changes: number
      }
    }
  ).__dynamicResolution = () => ({
    active,
    dpr: lastDpr,
    motionDpr,
    motionAtCeiling,
    changes: changeCount,
  })
}
