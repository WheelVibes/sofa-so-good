import { useProgress } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { subscribeProceduralSwap } from '../materials/proceduralSwapSignal'
import { useStore } from '../state/store'
import { animatedSourceCount } from './animatedSources'
import {
  assetsSettleDirtyUntil,
  isContinuous,
  type PumpInputs,
  settleTailMs,
  shouldRender,
} from './renderDecision'
import { setRenderingContinuously } from './renderPumpSignal'
import { pulseShadowRefresh } from './shadowRefreshSignal'
import { changeAffectsShadow } from './shadowRelevance'
import { useQuality } from './useQuality'

/**
 * Drives rendering for the demand-mode main `<Canvas>` (frameloop="demand").
 *
 * One always-on `requestAnimationFrame` loop calls `invalidate()` whenever
 * `shouldRender()` says a frame is wanted: continuously while something is
 * animating (walk, turntable, tour, recording, shadow accumulation, a drag, a
 * spinning fan, boot, or asset streaming), and for a short "settle tail" after
 * any discrete store change (place/move/finish/time-scrub/etc.). When nothing
 * is happening the scene draws 0 frames — the idle battery/thermal win. While
 * the tab is hidden it never renders at all.
 *
 * The rAF loop itself is cheap (a few flag reads per frame); only `invalidate()`
 * triggers actual GPU work, and only when needed.
 */
export function RenderPump() {
  const invalidate = useThree((s) => s.invalidate)
  const showcaseEnabled = useQuality().showcase

  // drei's loader progress — keep rendering while assets stream in.
  //
  // Read IMPERATIVELY (`useProgress.getState()`) inside the rAF loop rather than
  // subscribing with `useProgress()`. drei updates that store from its loading
  // manager *during* React's render phase, so subscribing here made a mounted
  // RenderPump set state while another component was still rendering:
  //   "Cannot update a component (RenderPump) while rendering a different
  //    component (TexturedRoomFloor)"
  // — reproducible by applying a textured floor finish (Chrome audit 2026-08).
  // Nothing is lost: the value was only ever copied into a ref and read once per
  // frame, so the loop now reads a fresher value with no subscription at all.

  const showcaseRef = useRef(showcaseEnabled)
  showcaseRef.current = showcaseEnabled

  const dirtyUntil = useRef(0)
  const lastOverlayRenderMs = useRef(0)

  useEffect(() => {
    // Any store change marks the scene dirty for a settle tail, so discrete
    // edits (place/move/select/finish/door/time-scrub/theme/plan) draw without
    // a dedicated invalidate call at each call site. drei's OrbitControls also
    // invalidates on its own `change` event.
    const markDirty = (next?: object, prev?: object) => {
      dirtyUntil.current = performance.now() + settleTailMs(showcaseRef.current)
      // PERF-MAX-1: a discrete change happened — let Lighting re-render the frozen
      // sun shadow map across this same settle tail (see shadowRefreshSignal).
      // PERF-MAX-5: but ONLY when the change can actually alter the (depth-only) map.
      // A store-subscription change passes (state, prev); other callers (procedural
      // swap, focus/visibility, mount prime) pass nothing → pulse (safe default).
      // Fail-open: pulses unless every changed key is provably shadow-irrelevant, so
      // a missed key costs an extra refresh, never a stale shadow.
      if (
        !next ||
        !prev ||
        changeAffectsShadow(next as Record<string, unknown>, prev as Record<string, unknown>)
      ) {
        pulseShadowRefresh(dirtyUntil.current)
      }
      const s = useStore.getState()
      // While the opaque loader is up, defer to the rAF pump (which freezes or
      // throttles WebGL) — a direct invalidate here would bypass that gate.
      if (s.loading.active || !s.sceneReady || s.bootPhase !== 'ready') return
      invalidate()
    }
    const unsub = useStore.subscribe(markDirty)

    // Procedural texture worker swap: when an OffscreenCanvas worker finishes
    // and hot-swaps a material's textures, kick one extra frame so the upgrade
    // is visible (demand mode won't render on its own without a signal).
    const unsubSwap = subscribeProceduralSwap(markDirty)

    const onVisibility = () => {
      if (!document.hidden) markDirty()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    // Prime one render on mount.
    markDirty()

    let raf = 0
    // Reused across frames — the rAF loop runs forever, so mutate one object
    // instead of allocating a fresh PumpInputs 60×/s (PERF10).
    const inputs: PumpInputs = {
      hidden: false,
      sceneReady: false,
      assetsActive: false,
      walk: false,
      autoRotate: false,
      touring: false,
      recording: false,
      showcaseAccumulating: false,
      dragging: false,
      animatedCount: 0,
      now: 0,
      dirtyUntil: 0,
      overlayTransition: false,
      overlayBoot: false,
      lastOverlayRenderMs: 0,
    }
    // Previous tick's asset-streaming flag, for the falling-edge tail below.
    let wasAssetsActive = false
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const s = useStore.getState()
      inputs.hidden = typeof document !== 'undefined' && document.hidden
      inputs.overlayTransition = s.loading.active
      inputs.overlayBoot = s.bootPhase === 'ready' && !s.sceneReady
      inputs.lastOverlayRenderMs = lastOverlayRenderMs.current
      inputs.sceneReady = s.sceneReady
      inputs.assetsActive = useProgress.getState().active
      // Streaming just finished: a surface that SUSPENDED on its textures commits
      // its loaded material after the loader goes idle, so without this tail the
      // last continuous frame predates the commit and demand mode never draws the
      // result (FINISH-DEFER). Extends the dirty window rather than invalidating
      // once, so the commit + its GPU upload land inside it.
      dirtyUntil.current = assetsSettleDirtyUntil(
        wasAssetsActive,
        inputs.assetsActive,
        performance.now(),
        dirtyUntil.current,
      )
      wasAssetsActive = inputs.assetsActive
      inputs.walk = s.cameraMode === 'firstPerson'
      inputs.autoRotate = s.autoRotate
      inputs.touring = Boolean(s.touring)
      inputs.recording = s.recording
      inputs.showcaseAccumulating = s.showcaseAccumulating
      inputs.dragging = s.draggingItemId != null
      inputs.animatedCount = animatedSourceCount()
      inputs.now = performance.now()
      inputs.dirtyUntil = dirtyUntil.current
      setRenderingContinuously(!inputs.hidden && isContinuous(inputs))
      if (shouldRender(inputs)) {
        if (inputs.overlayBoot || inputs.overlayTransition) lastOverlayRenderMs.current = inputs.now
        invalidate()
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      unsub()
      unsubSwap()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [invalidate])

  return null
}
