import type { QualitySettings } from '../../scene/quality'
import { useStore } from '../../state/store'
import { setProfilerBenchmarkActive } from './benchmarkSignal'
import { COST_SWEEP, runSweep } from './costBreakdown'
import { buildObjectBreakdown } from './objectBreakdown'
import { profilerBridge } from './profilerBridge'
import type { EffectCost, ObjectCost } from './profilerTypes'

/** Frames to let the pipeline settle after changing an override. */
const SETTLE_FRAMES = 20
/** Frames averaged per measurement. */
const SAMPLE_FRAMES = 60

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

/** Average frame time (ms) over `n` frames, driving the canvas each frame. */
function measureAvgFrameMs(invalidate: () => void, n: number): Promise<number> {
  return new Promise((resolve) => {
    let count = 0
    let total = 0
    let last = performance.now()
    const tick = (now: number) => {
      total += now - last
      last = now
      invalidate()
      if (++count >= n) resolve(total / count)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame((now) => {
      last = now
      requestAnimationFrame(tick)
    })
  })
}

/**
 * Run the effect-cost sweep against the live pipeline. Snapshots quality
 * overrides, and for each effect: applies a disabling override, settles,
 * measures, and restores the exact prior overrides. The adaptive FPS guard is
 * suspended for the whole run via the benchmark signal.
 */
export async function runCostBreakdown(
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<EffectCost[]> {
  const refs = profilerBridge.getRefs()
  if (!refs) return []
  const { invalidate } = refs
  const snapshot: Partial<QualitySettings> = { ...useStore.getState().qualityOverrides }
  setProfilerBenchmarkActive(true)
  try {
    return await runSweep(
      COST_SWEEP,
      async (override) => {
        if (override) {
          useStore.setState({ qualityOverrides: { ...snapshot, [override.key]: override.value } })
        } else {
          useStore.setState({ qualityOverrides: { ...snapshot } })
        }
        await driveFrames(invalidate, SETTLE_FRAMES)
        return measureAvgFrameMs(invalidate, SAMPLE_FRAMES)
      },
      onProgress,
    )
  } finally {
    // Restore the exact pre-sweep overrides and re-enable the guard.
    useStore.setState({ qualityOverrides: { ...snapshot } })
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
