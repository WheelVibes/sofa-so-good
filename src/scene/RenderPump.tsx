import { useProgress } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { subscribeProceduralSwap } from '../materials/proceduralSwapSignal'
import { useStore } from '../state/store'
import { animatedSourceCount } from './animatedSources'
import { isContinuous, type PumpInputs, settleTailMs, shouldRender } from './renderDecision'
import { setRenderingContinuously } from './renderPumpSignal'
import { pulseShadowRefresh } from './shadowRefreshSignal'
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

  // drei's loader progress — keep rendering while assets stream in. Read into a
  // ref so the rAF loop doesn't need to re-subscribe.
  const { active: assetsActive } = useProgress()
  const assetsActiveRef = useRef(assetsActive)
  assetsActiveRef.current = assetsActive

  const showcaseRef = useRef(showcaseEnabled)
  showcaseRef.current = showcaseEnabled

  const dirtyUntil = useRef(0)
  const lastOverlayRenderMs = useRef(0)

  useEffect(() => {
    // Any store change marks the scene dirty for a settle tail, so discrete
    // edits (place/move/select/finish/door/time-scrub/theme/plan) draw without
    // a dedicated invalidate call at each call site. drei's OrbitControls also
    // invalidates on its own `change` event.
    const markDirty = () => {
      dirtyUntil.current = performance.now() + settleTailMs(showcaseRef.current)
      // PERF-MAX-1: a discrete change happened — let Lighting re-render the frozen
      // sun shadow map across this same settle tail (see shadowRefreshSignal).
      pulseShadowRefresh(dirtyUntil.current)
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
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const s = useStore.getState()
      inputs.hidden = typeof document !== 'undefined' && document.hidden
      inputs.overlayTransition = s.loading.active
      inputs.overlayBoot = s.bootPhase === 'ready' && !s.sceneReady
      inputs.lastOverlayRenderMs = lastOverlayRenderMs.current
      inputs.sceneReady = s.sceneReady
      inputs.assetsActive = assetsActiveRef.current
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
