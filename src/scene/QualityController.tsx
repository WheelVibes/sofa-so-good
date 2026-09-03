import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { isProfilerBenchmarkActive } from '../dev/profiler/benchmarkSignal'
import { setProceduralBaseSize } from '../materials/procedural/generators'
import { useStore } from '../state/store'
import { classifyWindow, DEMOTE_WINDOWS, decideAutoDevice } from './adaptiveTier'
import {
  closeFrameCostSample,
  installFrameCostMeter,
  takeCostWindow,
  uninstallFrameCostMeter,
} from './frameCost'
import { type DeviceClass, detectDeviceClass, shouldSampleFps } from './quality'
import { useQuality } from './useQuality'

/**
 * Keeps the experience fluid:
 *   - boots at the conservative first-visit tier (`quality.ts:initialAutoTier`)
 *     or, for a returning device, at its persisted SETTLED tier,
 *   - applies each tier's pixel-ratio clamp,
 *   - measures frame rate and moves the tier BOTH ways (TIER-ADAPTIVE).
 *
 * The ladder — not hardware detection — is the primary signal, because in a
 * browser the hardware isn't legible (see `adaptiveTier.ts` for why, and for why
 * promotion has to be a probe rather than a threshold read). Capability
 * detection survives only as a best-effort ceiling. Auto-adjust stops entirely
 * once the user pins a tier (`qualityUserSet`), and is deliberately deaf during
 * boot warm-up — see `FPS_GUARD_WARMUP_MS`.
 */
export function QualityController() {
  const { gl } = useThree()
  const advance = useThree((s) => s.advance)
  const setDpr = useThree((s) => s.setDpr)
  const dprMax = useQuality().dprMax

  // The capability CEILING for this device — a best-effort veto the adaptive
  // ladder may not climb past, captured once (TIER-AUTODETECT).
  const ceiling = useRef<DeviceClass>('weak')

  // One-time boot pick. Skipped when the user pinned a tier, AND when prefs
  // restored a SETTLED tier — otherwise every reload would stomp a device that
  // had earned High back to the conservative first-visit tier and make it
  // re-probe from scratch.
  useEffect(() => {
    const ctx = gl.getContext() as WebGLRenderingContext | WebGL2RenderingContext
    ceiling.current = detectDeviceClass(ctx)
    useStore.getState().setDeviceClass(ceiling.current)
    // No boot MODE pick any more: `BOOT_TIER` is the store's initial value, so a
    // first visit is already there, and a returning visitor's persisted mode must
    // not be stomped. Detection now only chooses the variant, above.
  }, [gl])

  // Apply the effective device-pixel-ratio clamp. This controller is the SOLE
  // owner of the tier DPR clamp (GPU-STARVE-3): the Canvases pass no `dpr`
  // prop, because r3f re-applies that prop from the Canvas component's own
  // layout effect — which React runs AFTER every child effect, so nothing in
  // the tree can repaint after its resize and every tier switch composited one
  // cleared (page-white) frame (probe-confirmed 2026-07-24, stack-traced to
  // r3f's internal `setDpr`). Routed through r3f `setDpr` (not a raw
  // `gl.setPixelRatio`) so viewport state stays coherent, then repainted in
  // the SAME task: any drawing-buffer resize CLEARS the buffer, and without a
  // pre-composite repaint the browser shows the blank canvas until the next
  // demand-mode frame. A layout effect runs pre-composite (a plain useEffect
  // is one composite late); same rule as InteractiveDprController.
  useLayoutEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, dprMax))
    if (!document.hidden && gl.domElement.isConnected) {
      try {
        advance(performance.now(), true)
      } catch {
        // mid-teardown — the next scheduled frame repaints instead
      }
    }
  }, [dprMax, gl, setDpr, advance])

  // Procedural finish textures generate at 256² on Performance (the default
  // tier — quarter the texels, near-identical at room scale) and 512² above.
  // Applies to new generations; cache keys carry the size (PERF9).
  const tier = useStore((s) => s.qualityTier)
  useEffect(() => {
    setProceduralBaseSize(tier === 'performance' ? 256 : 512)
  }, [tier])

  // Adaptive quality ladder — BIDIRECTIONAL (TIER-ADAPTIVE). Steps down when the
  // current tier no longer fits the frame budget, and probes UP when it fits
  // comfortably. The signal is per-frame render COST, not frame rate: this Canvas
  // is `frameloop="demand"`, so rate reports how often the pump chose to draw
  // (measured 30 renders/s against 59.7 rAF/s while each frame cost 5.7 ms) and a
  // rate-based guard demotes a scene that is using a third of its budget. See
  // `frameCost.ts` and `adaptiveTier.ts`.
  //
  // Cost-based sampling also removes the need for the old `isRenderingContinuously()`
  // gate: an idle demand-mode frame renders nothing, so it contributes no sample
  // at all (rather than a misleading multi-second delta), and `MIN_WINDOW_FRAMES`
  // discards any window too short to judge.
  useEffect(() => {
    installFrameCostMeter(gl as unknown as { render: (...a: never[]) => unknown })
    return () => uninstallFrameCostMeter()
  }, [gl])

  const acc = useRef({ t: 0, good: 0, bad: 0 })
  // When `sceneReady` first turned true, for the warm-up gate below.
  const readyAt = useRef(0)
  useFrame((_, dt) => {
    // Close the in-flight frame's cost sample first, every frame, so the meter
    // keeps a true per-displayed-frame series regardless of the gates below.
    closeFrameCostSample()

    const a = acc.current
    // Ignore boot: streaming/compilation/bakes drive frames continuously at the
    // least representative moment there is (see FPS_GUARD_WARMUP_MS).
    const ready = useStore.getState().sceneReady
    if (!ready) readyAt.current = 0
    else if (readyAt.current === 0) readyAt.current = performance.now()
    if (!shouldSampleFps(ready, readyAt.current === 0 ? 0 : performance.now() - readyAt.current)) {
      a.t = 0
      a.good = 0
      a.bad = 0
      takeCostWindow()
      return
    }
    // The profiler sweep toggles quality overrides — its frames are not the
    // user's frames, so they must not move the tier.
    if (isProfilerBenchmarkActive()) {
      a.t = 0
      takeCostWindow()
      return
    }
    a.t += dt
    if (a.t < 1.5) return
    a.t = 0
    const costWindow = takeCostWindow()
    if (useStore.getState().qualityUserSet) return

    // Consecutive-window counters: a verdict resets the opposite streak, so one
    // good window can't cancel a genuine sustained failure and vice versa. A
    // `neutral` window (too few frames, or cost between the thresholds) clears
    // both — it is not evidence either way.
    const verdict = classifyWindow(costWindow)
    if (verdict === 'bad') {
      a.bad++
      a.good = 0
    } else if (verdict === 'good') {
      a.good++
      a.bad = 0
    } else {
      a.good = 0
      a.bad = 0
    }

    const st = useStore.getState()
    // The ladder now moves the DEVICE CLASS, not the mode: the mode is the user's
    // intent and auto-adjust must not overrule it. A demotion here from
    // `capable` to `weak` is exactly the old medium→performance step inside
    // `performance`, and the old maximum→high step inside `realistic`.
    const next = decideAutoDevice(
      { device: st.deviceClass, autoMaxDevice: st.autoMaxDevice },
      ceiling.current,
      a.good,
      a.bad,
    )
    if (next) {
      if (next.device !== st.deviceClass) st.setDeviceClass(next.device)
      if (next.autoMaxDevice !== st.autoMaxDevice) st.setAutoMaxDevice(next.autoMaxDevice)
      // The evidence has been spent on this decision.
      a.good = 0
      a.bad = 0
      return
    }
    // Already at the lowest tier and still over budget: shed the sun-shadow pass
    // as the final fallback. (At Performance shadows are already off, so this
    // only bites if an override re-enabled them.)
    if (verdict === 'bad' && a.bad >= DEMOTE_WINDOWS && !st.autoShadowsOff) {
      st.setAutoShadowsOff(true)
      a.bad = 0
    }
  })

  return null
}
