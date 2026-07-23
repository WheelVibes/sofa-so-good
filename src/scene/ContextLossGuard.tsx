import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { registerAnimatedSource } from './animatedSources'
import { bumpContextRestore } from './contextRestoreSignal'
import { pulseShadowRefresh } from './shadowRefreshSignal'

/** Minimum time the restore keeps the demand-mode pump continuous + the frozen
 *  sun shadow map re-arming, so every render-target-backed resource re-bakes. */
const RESTORE_REBUILD_MS = 1500

/** …and a minimum number of actually-RENDERED frames before the hold releases:
 *  the rebuild chain needs several distinct frames (remounted Environment bakes
 *  its cubemap on one, the shadow map re-renders on another, the final lit
 *  frame presents after both), and on a slow/software renderer a frame can cost
 *  seconds — a purely time-based hold could elapse before the bake frame ever
 *  ran, leaving `scene.environment` null until the next unrelated edit. */
const RESTORE_MIN_FRAMES = 8

/** Hard cap so a hidden tab (rAF frozen → frames never accrue) can't hold the
 *  pump-continuous flag forever. */
const RESTORE_MAX_HOLD_MS = 15_000

/**
 * Safety net for WebGL context loss. By default a lost context leaves the canvas
 * blank (white) forever — the browser only attempts to RESTORE a context if the
 * `webglcontextlost` event was `preventDefault()`-ed. The GPU watchdog can drop
 * the context under extreme load (a >~2 s frame at Maximum tier during a pan —
 * GPU-STARVE — or a mass model import starving the main thread); this catches
 * that, lets the browser restore it, and rebuilds on `webglcontextrestored`.
 *
 * A bare repaint is NOT enough after a restore (GPU-STARVE-2): three re-uploads
 * textures/geometry from CPU sources, but render-target-only resources are gone
 * — the frozen sun shadow map (PERF-MAX-1 holds `shadow.autoUpdate=false`, so
 * without a pulse it would stay black/stale forever) and the baked IBL probe
 * (drei `<Environment>` renders once into a cubemap). So the restore pulses the
 * shadow-refresh signal, bumps the context-restore signal (SceneEnvironment
 * re-bakes its probe), and holds the RenderPump continuous for a short window
 * so the rebuilds actually present.
 *
 * The first line of defence is not starving the GPU at all —
 * `InteractiveDprController` (GPU-STARVE-1) sheds resolution during camera
 * motion; this is belt-and-suspenders for the worst case.
 */
export function ContextLossGuard() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  // Live rebuild-hold state, shared between the event handlers and the frame
  // counter below. `release` is idempotent (registerAnimatedSource contract).
  const hold = useRef<{ release: () => void; startedAt: number; frames: number } | null>(null)
  useEffect(() => {
    const canvas = gl.domElement
    let holdTimer = 0
    const endHold = () => {
      hold.current?.release()
      hold.current = null
      window.clearTimeout(holdTimer)
    }
    const onLost = (e: Event) => {
      // Required for the browser to attempt a restore.
      e.preventDefault()
      console.warn('[ContextLossGuard] WebGL context lost — awaiting restore')
    }
    const onRestored = () => {
      console.warn('[ContextLossGuard] WebGL context restored — rebuilding + repainting')
      const now = performance.now()
      // Re-render the (frozen) sun shadow map across the rebuild window.
      pulseShadowRefresh(now + RESTORE_REBUILD_MS)
      // Remount/re-bake render-target-backed resources (IBL probe / HDRI PMREM).
      bumpContextRestore()
      // Hold the demand-mode pump continuous until the rebuild frames actually
      // rendered (counted in the useFrame below) — released there, or by the
      // hard-cap timer if frames can't accrue (hidden tab).
      endHold()
      hold.current = { release: registerAnimatedSource(), startedAt: now, frames: 0 }
      holdTimer = window.setTimeout(endHold, RESTORE_MAX_HOLD_MS)
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', onLost as EventListener, false)
    canvas.addEventListener('webglcontextrestored', onRestored as EventListener, false)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas.removeEventListener('webglcontextrestored', onRestored as EventListener)
      endHold()
    }
  }, [gl, invalidate])
  // Count rendered frames while a rebuild hold is open; release once enough
  // frames AND enough time have passed (both — see RESTORE_MIN_FRAMES).
  useFrame(() => {
    const h = hold.current
    if (!h) return
    h.frames += 1
    if (h.frames >= RESTORE_MIN_FRAMES && performance.now() - h.startedAt >= RESTORE_REBUILD_MS) {
      h.release()
      hold.current = null
    }
  })
  return null
}
