import type { QualitySettings } from '../../scene/quality'
import { useStore } from '../../state/store'
import { setProfilerBenchmarkActive } from './benchmarkSignal'
import { COST_SWEEP, runSweep } from './costBreakdown'
import { buildObjectBreakdown } from './objectBreakdown'
import { profilerBridge } from './profilerBridge'
import type { EffectCost, ObjectCost } from './profilerTypes'

/**
 * Frames to let the pipeline settle after changing an override — a FLOOR, not
 * the whole wait; `settleUntilStable` keeps going until the render time stops
 * moving.
 *
 * A fixed 20 was not enough. Changing a quality override reallocates render
 * targets and recompiles materials (a shadow-map resize, the PMREM rebuild, the
 * post stack re-creating its buffers), and at Maximum that cost lands INSIDE the
 * measurement window: the sweep reported sun shadows at 11.16 ms and fixture
 * lights at 9.75 ms, where a controlled fixed-camera A/B measured the same
 * lights at 1.36 ms. A profiler that misattributes an order of magnitude sends
 * you optimising the wrong thing, which is exactly what it did.
 */
const SETTLE_FRAMES = 20
/** Hard cap on settling, so a genuinely unstable scene can't hang the sweep. */
const SETTLE_MAX_FRAMES = 240
/** Consecutive stable windows required before a measurement is trusted. */
const SETTLE_STABLE_WINDOWS = 3
/** Relative change between windows counted as "settled". */
const SETTLE_TOLERANCE = 0.05
/** Frames averaged per measurement. */
const SAMPLE_FRAMES = 60
/** Coarse mode: enough to rank effects, ~4x faster. A full sweep is
 *  (settle + sample) x (1 + steps) driven frames — 720 at the default counts,
 *  which is minutes on a slow GPU (or a headless software rasteriser) and long
 *  enough that a background hiccup lands inside the run. */
const QUICK_SETTLE_FRAMES = 6
const QUICK_SAMPLE_FRAMES = 15
/** Renders timed together per sample — see `measureRenderMs`. */
const RENDER_BATCH = 10

export interface CostBreakdownOptions {
  /** Fewer frames per measurement: ranks the effects without the wait, at the
   *  cost of noise on close-together rows. */
  quick?: boolean
}

/** Await `n` rendered frames, driving the demand-mode canvas via invalidate. */
function driveFrames(invalidate: () => void, n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0
    const tick = () => {
      invalidate()
      if (++count >= n) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Render until the frame cost stops moving, so a reallocation or shader
 * recompile triggered by the override can't be counted as the effect's cost.
 * Returns once `stableWindows` consecutive windows agree within
 * {@link SETTLE_TOLERANCE}, or at {@link SETTLE_MAX_FRAMES}.
 */
function settleUntilStable(
  refs: NonNullable<ReturnType<typeof profilerBridge.getRefs>>,
  stableWindows: number,
): void {
  let prev = Number.POSITIVE_INFINITY
  let stable = 0
  let frames = 0
  while (frames < SETTLE_MAX_FRAMES && stable < stableWindows) {
    const ms = measureRenderMs(refs, RENDER_BATCH)
    frames += RENDER_BATCH
    const delta = Math.abs(ms - prev) / Math.max(ms, prev, 1e-6)
    stable = delta <= SETTLE_TOLERANCE ? stable + 1 : 0
    prev = ms
  }
}

/**
 * Mean cost of ONE full pipeline render (ms).
 *
 * NOT an rAF delta. Frame deltas are pinned to the display refresh, so on any
 * GPU that comfortably makes 60 fps every row of the sweep reads 16.67 ms and
 * every saving reads 0.00 ms — the report is structurally blind to exactly the
 * hardware people run. (Measured on an M4: the entire breakdown came back as
 * zeros.) Instead this drives r3f's synchronous `advance` — a real render
 * through the real pipeline, post composer included — and blocks on
 * `gl.finish()` so the GPU has actually completed before the clock stops.
 *
 * Renders are timed individually and the MEDIAN is returned: a mean lets one
 * compositor hiccup or shader recompile dominate a short sample.
 */
function measureRenderMs(refs: NonNullable<ReturnType<typeof profilerBridge.getRefs>>, n: number) {
  const { advance, gl } = refs
  const ctx = gl.getContext()
  // Renders are timed in BATCHES because `performance.now()` is clamped to
  // 100 µs in a non-cross-origin-isolated page: a 3 ms render measured one at a
  // time quantises to ±0.1 ms, which is larger than most individual effects.
  // Timing RENDER_BATCH renders per sample amortises the clamp down to
  // 100 µs / RENDER_BATCH.
  const batches = Math.max(3, Math.ceil(n / RENDER_BATCH))
  const samples: number[] = []
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now()
    for (let i = 0; i < RENDER_BATCH; i++) advance(performance.now(), true)
    ctx.finish()
    samples.push((performance.now() - t0) / RENDER_BATCH)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)] ?? 0
}

/**
 * Run the effect-cost sweep against the live pipeline. Snapshots quality
 * overrides, and for each effect: applies a disabling override, settles,
 * measures, and restores the exact prior overrides. The adaptive FPS guard is
 * suspended for the whole run via the benchmark signal.
 */
export async function runCostBreakdown(
  onProgress?: (done: number, total: number, label: string) => void,
  opts: CostBreakdownOptions = {},
): Promise<EffectCost[]> {
  const settleFrames = opts.quick ? QUICK_SETTLE_FRAMES : SETTLE_FRAMES
  const sampleFrames = opts.quick ? QUICK_SAMPLE_FRAMES : SAMPLE_FRAMES
  const refs = profilerBridge.getRefs()
  if (!refs) return []
  const { invalidate } = refs
  const snapshot: Partial<QualitySettings> = { ...useStore.getState().qualityOverrides }
  const lightsSnapshot = useStore.getState().lightsMode
  // A step that would change nothing measures nothing — drop it rather than
  // print a guaranteed 0 ms row (switching lights "off" in a scene where they
  // are already off).
  const steps = COST_SWEEP.filter(
    (s) => !s.store?.lightsMode || s.store.lightsMode !== lightsSnapshot,
  )
  setProfilerBenchmarkActive(true)
  try {
    return await runSweep(
      steps,
      async (step) => {
        useStore.setState({
          qualityOverrides: step?.quality
            ? { ...snapshot, [step.quality.key]: step.quality.value }
            : { ...snapshot },
          // Store-level render inputs restore to their pre-sweep value on every
          // measurement, so each step is measured against the same baseline.
          lightsMode: step?.store?.lightsMode ?? lightsSnapshot,
        })
        await driveFrames(invalidate, settleFrames)
        settleUntilStable(refs, opts.quick ? 1 : SETTLE_STABLE_WINDOWS)
        return measureRenderMs(refs, sampleFrames)
      },
      onProgress,
    )
  } finally {
    // Restore the exact pre-sweep state and re-enable the guard.
    useStore.setState({ qualityOverrides: { ...snapshot }, lightsMode: lightsSnapshot })
    setProfilerBenchmarkActive(false)
    invalidate()
  }
}

/** Snapshot per-item GPU cost from the live scene. */
export function getObjectBreakdown(): ObjectCost[] {
  const refs = profilerBridge.getRefs()
  if (!refs) return []
  const items = useStore.getState().items
  const labelFor = (id: string) => {
    const it = items.find((i) => i.id === id)
    return it?.label ?? it?.defId ?? id
  }
  return buildObjectBreakdown(refs.scene, labelFor)
}
