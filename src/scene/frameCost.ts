/**
 * Per-displayed-frame render COST meter (TIER-ADAPTIVE).
 *
 * ## Why cost, not frame rate
 *
 * The main Canvas is `frameloop="demand"`. Frame RATE therefore measures how
 * often the app was *asked* to draw, not how fast it *can* draw — and the two
 * diverge badly. Measured on a Mac mini M4 at 2560x1600 during a real orbit:
 * 59.7 `requestAnimationFrame` ticks per second against 30.5 actual renders,
 * while each render cost only ~5.7 ms. A frame-rate guard reads that as "30 fps,
 * failing" and demotes a scene that is in fact using a third of its budget. The
 * first cut of the adaptive ladder did exactly that: it walked Medium down to
 * Performance on hardware with room for two more tiers.
 *
 * Frame rate is also useless for PROMOTION, for a separate reason: it is clamped
 * by vsync. Performance and Medium both report exactly 60 — the compositor will
 * not let us render faster than the display, so there is no headroom to read.
 *
 * Cost has neither problem. Measured p90 per displayed frame, same machine:
 *
 * | tier        | p50     | p90     | max     |
 * | ----------- | ------- | ------- | ------- |
 * | performance |  4.5 ms |  4.7 ms | 11.4 ms |
 * | medium      |  5.7 ms |  6.0 ms | 14.1 ms |
 * | high        |  8.1 ms |  8.9 ms | 15.5 ms |
 * | maximum     | 11.1 ms | 11.7 ms | 21.9 ms |
 *
 * That is a signal with real dynamic range, it says how much budget is left, and
 * it is independent of how often the pump chose to draw.
 *
 * ## How it is measured
 *
 * `renderer.render` is wrapped and timed, and the durations are SUMMED per
 * animation frame. Summing is the load-bearing part: at the post tiers the
 * composer issues ~18 sibling `render()` calls per frame (plus a mirror's full
 * extra scene pass when one is active), so timing them individually reports the
 * parts rather than the whole and inflates the apparent render rate to ~1000/s.
 * Nesting depth cannot separate them — the passes are siblings, not nested.
 *
 * This is CPU submit time, not GPU completion time. It is the honest cheap
 * option in WebGL: a real GPU timer needs `EXT_disjoint_timer_query_webgl2`,
 * which is unavailable in most browsers for privacy reasons. Submit time tracks
 * well enough in practice because a starved GPU backs pressure up into the
 * submitting call.
 */

/** A displayed frame's total render cost, and the samples it came from. */
export interface CostWindow {
  /** Number of displayed frames sampled. */
  n: number
  /** CPU time inside `gl.render`, ms. */
  p50: number
  p90: number
  /**
   * WALL-CLOCK interval between consecutive displayed frames, ms. `-1` when
   * fewer than two frames were sampled.
   *
   * **Why submit time alone is not enough.** `v0.31.7.84` measured
   * `realistic`/walk at **10.9 fps — 92 ms per frame — while p90 inside
   * `gl.render` was 6.9 ms**, comfortably under `DEMOTE_COST_MS`. A GPU-bound
   * frame submits fast and then blocks, so the guard whose whole job is holding a
   * frame-rate floor could not see the floor being missed. The retired ladder
   * papered over it by hand (`AUTO_PROMOTE_CEILING = 'high'`, whose comment said
   * `maximum` "WOULD pass the probe, which is exactly why it needs an explicit
   * ceiling"); `v0.31.7.68` deleted that ceiling and left nothing in its place.
   * This is the missing signal rather than another hand-placed cap.
   */
  intervalP50: number
  intervalP90: number
}

/**
 * Percentile of an ALREADY-SORTED ascending array. Nearest-rank (no
 * interpolation) — with a few dozen samples per window, interpolating adds
 * nothing but a chance to mis-index. Returns -1 for an empty array so callers
 * can tell "no data" from "0 ms".
 */
export function percentileSorted(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return -1
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))
  return sorted[i]
}

/**
 * Summarise raw per-frame SUBMIT costs. Pure, so the stats are unit-testable.
 *
 * Reports `intervalP50/P90` as `-1` — "not measured here". Wall-clock intervals
 * are a property of the live sampling sequence, not of a bag of costs, so
 * {@link takeCostWindow} supplies them and this stays pure.
 */
export function summariseCosts(samples: ReadonlyArray<number>): CostWindow {
  const finite = samples.filter((x) => Number.isFinite(x) && x >= 0)
  const none = { intervalP50: -1, intervalP90: -1 }
  if (finite.length === 0) return { n: 0, p50: -1, p90: -1, ...none }
  const sorted = finite.slice().sort((a, b) => a - b)
  return {
    n: sorted.length,
    p50: percentileSorted(sorted, 0.5),
    p90: percentileSorted(sorted, 0.9),
    ...none,
  }
}

// ---------------------------------------------------------------------------
// Live meter (module singleton — one renderer, one meter).

interface Renderable {
  render: (...args: never[]) => unknown
}

let installedOn: Renderable | null = null
let restore: (() => void) | null = null
/** Render cost accumulating for the frame currently in flight. */
let pending = 0
/** Completed per-frame costs since the last `takeCostWindow()`. */
let samples: number[] = []
/** Wall-clock gaps between consecutive DISPLAYED frames, ms. */
let intervals: number[] = []
let lastCloseMs = 0
/**
 * A gap longer than this is treated as "resumed after idle", not a slow frame.
 * Demand mode idles constantly, so without this every wake-up would look like a
 * multi-hundred-millisecond frame. Generous on purpose: a genuinely terrible
 * 5 fps frame is 200 ms and must still count as evidence.
 */
const IDLE_GAP_MS = 500

/**
 * Wrap a renderer's `render` so its cost is accumulated. Idempotent per
 * renderer; re-installing on a NEW renderer (a context loss rebuilds it)
 * transparently re-wraps.
 */
export function installFrameCostMeter(gl: Renderable): void {
  if (installedOn === gl) return
  restore?.()
  // Keep the ORIGINAL function value, not a bound copy: `uninstall` must be able
  // to restore the exact same reference, or repeated install/uninstall cycles
  // leave a stack of bound wrappers behind. `this` is supplied at call time.
  const orig = gl.render
  gl.render = function (this: unknown, ...args: never[]) {
    const t = performance.now()
    try {
      return orig.apply(this ?? gl, args)
    } finally {
      pending += performance.now() - t
    }
  } as Renderable['render']
  installedOn = gl
  restore = () => {
    gl.render = orig
    installedOn = null
    restore = null
  }
}

/** Remove the wrapper (Canvas teardown / flag off). */
export function uninstallFrameCostMeter(): void {
  restore?.()
  pending = 0
  samples = []
}

/**
 * Close the frame currently in flight. Call once per animation frame, AFTER the
 * frame's rendering has happened — a frame that rendered nothing contributes no
 * sample (demand mode idles constantly, and a 0 ms non-frame would drag every
 * percentile toward zero and make any tier look free).
 */
export function closeFrameCostSample(): void {
  if (pending > 0) {
    samples.push(pending)
    pending = 0
    // Bound the buffer: a long continuous span must not grow without limit.
    if (samples.length > 600) samples.shift()
    // Wall-clock interval between DISPLAYED frames. Only between two frames that
    // both rendered, and only when the gap is plausibly one frame: demand mode
    // idles constantly, so a resumed-after-idle gap of 400 ms is not a slow frame
    // and must not be read as one. `IDLE_GAP_MS` is generous enough to keep a
    // genuinely terrible 5 fps frame (200 ms) as evidence.
    const now = performance.now()
    if (lastCloseMs > 0) {
      const dt = now - lastCloseMs
      if (dt <= IDLE_GAP_MS) {
        intervals.push(dt)
        if (intervals.length > 600) intervals.shift()
      }
    }
    lastCloseMs = now
  }
}

/** Drain and summarise everything sampled since the last call. */
export function takeCostWindow(): CostWindow {
  const out = summariseCosts(samples)
  const iv = intervals.slice().sort((a, b) => a - b)
  samples = []
  intervals = []
  // `lastCloseMs` is deliberately NOT reset: the next window's first interval is
  // still a real frame-to-frame gap, and dropping it would discard one sample per
  // window for no reason.
  return {
    ...out,
    intervalP50: iv.length ? percentileSorted(iv, 0.5) : -1,
    intervalP90: iv.length ? percentileSorted(iv, 0.9) : -1,
  }
}

/** Test-only: reset the singleton. */
export function __resetFrameCostMeter(): void {
  installedOn = null
  restore = null
  pending = 0
  samples = []
  intervals = []
  lastCloseMs = 0
}
