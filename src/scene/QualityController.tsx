import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
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
  const dprMax = useQuality().dprMax

  // One-time default selection (skipped if the user already chose a tier).
  useEffect(() => {
    if (useStore.getState().qualityUserSet) return
    const ctx = gl.getContext() as WebGLRenderingContext | WebGL2RenderingContext
    useStore.getState().autoSetQualityTier(detectDefaultTier(ctx))
  }, [gl])

  // Apply the effective device-pixel-ratio clamp.
  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprMax))
  }, [dprMax, gl])

  // Adaptive frame-rate guard (down-only).
  const acc = useRef({ t: 0, frames: 0, lowWindows: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    // Only measure FPS while the pump is rendering continuously. In demand mode
    // idle frames are seconds apart, which would read as ~0 FPS and trigger a
    // spurious tier downgrade — reset the window instead.
    if (!isRenderingContinuously()) {
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
