import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { isProfilerBenchmarkActive } from '../dev/profiler/benchmarkSignal'
import { setProceduralBaseSize } from '../materials/procedural/generators'
import { useStore } from '../state/store'
import { detectDefaultTier, RENDER_TIERS } from './quality'
import { isRenderingContinuously } from './renderPumpSignal'
import { useQuality } from './useQuality'

const ORDER = RENDER_TIERS
/** Frame-rate floor. Sustained dips below this auto-drop the tier. */
const FPS_FLOOR = 30

/**
 * Keeps the experience fluid:
 *   - boots at the default tier ('performance' — flat & fast — for everyone),
 *   - applies each tier's pixel-ratio clamp,
 *   - watches frame rate and steps the tier DOWN if it sustains below ~30fps.
 *
 * Higher tiers are strictly opt-in from the Graphics panel; the monitor never
 * raises the tier on its own. Auto-adjust is disabled entirely once the user
 * pins a tier manually (`qualityUserSet`).
 */
export function QualityController() {
  const { gl } = useThree()
  const advance = useThree((s) => s.advance)
  const setDpr = useThree((s) => s.setDpr)
  const dprMax = useQuality().dprMax

  // One-time default selection (skipped if the user already chose a tier).
  useEffect(() => {
    if (useStore.getState().qualityUserSet) return
    const ctx = gl.getContext() as WebGLRenderingContext | WebGL2RenderingContext
    useStore.getState().autoSetQualityTier(detectDefaultTier(ctx))
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

  // Adaptive frame-rate guard (down-only).
  const acc = useRef({ t: 0, frames: 0, lowWindows: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    // Only measure FPS while the pump is rendering continuously. In demand mode
    // idle frames are seconds apart, which would read as ~0 FPS and trigger a
    // spurious tier downgrade — reset the window instead.
    // Skip while idle (demand mode) OR while the profiler sweep is toggling
    // quality overrides — the sweep must not trigger a spurious tier downgrade.
    if (!isRenderingContinuously() || isProfilerBenchmarkActive()) {
      a.t = 0
      a.frames = 0
      return
    }
    a.t += dt
    a.frames++
    if (a.t < 1.5) return
    const fps = a.frames / a.t
    a.t = 0
    a.frames = 0
    if (useStore.getState().qualityUserSet) return
    if (fps < FPS_FLOOR) {
      a.lowWindows++
      if (a.lowWindows >= 2) {
        // ~3s sustained below floor → drop one tier, or — once bottomed out at
        // Performance — shed the sun-shadow pass as a final fallback. (At
        // Performance shadows are already off, so this only bites if an
        // override re-enabled them.)
        const st = useStore.getState()
        const i = ORDER.indexOf(st.qualityTier)
        if (i > 0) st.autoSetQualityTier(ORDER[i - 1])
        else if (!st.autoShadowsOff) st.setAutoShadowsOff(true)
        a.lowWindows = 0
      }
    } else {
      a.lowWindows = 0
    }
  })

  return null
}
