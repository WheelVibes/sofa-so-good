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
  p50: number
  p90: number
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

/** Summarise raw per-frame costs. Pure, so the stats are unit-testable. */
export function summariseCosts(samples: ReadonlyArray<number>): CostWindow {
  const finite = samples.filter((x) => Number.isFinite(x) && x >= 0)
  if (finite.length === 0) return { n: 0, p50: -1, p90: -1 }
  const sorted = finite.slice().sort((a, b) => a - b)
  return {
    n: sorted.length,
    p50: percentileSorted(sorted, 0.5),
    p90: percentileSorted(sorted, 0.9),
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
  }
}

/** Drain and summarise everything sampled since the last call. */
export function takeCostWindow(): CostWindow {
  const out = summariseCosts(samples)
  samples = []
  return out
}

/** Test-only: reset the singleton. */
export function __resetFrameCostMeter(): void {
  installedOn = null
  restore = null
  pending = 0
  samples = []
}
