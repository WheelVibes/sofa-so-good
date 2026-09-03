import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { cameraGestureEndedAt, isCameraGestureActive } from './cameraMotionSignal'
import {
  degradedDpr,
  lastLongFrameTime,
  noteRenderedFrame,
  shouldDegradeDpr,
} from './interactiveDegrade'
import { isRenderingContinuously } from './renderPumpSignal'
import { useQuality } from './useQuality'

/**
 * GPU-STARVE-1 — applies the interactive render-resolution degrade decided by
 * `interactiveDegrade.ts`: while the camera is being driven at a post-stack
 * tier (High/Maximum), halve the pixel ratio so no frame can approach the OS
 * GPU watchdog (whose driver reset drops the WebGL context and flashes the
 * canvas white mid-pan). Mounted once in BOTH Canvases (main + room editor),
 * like `RendererTierController`.
 *
 * Mechanics (GPU-STARVE-3 hardened — the original mechanics themselves caused
 * white flicker, see below):
 *  - The degrade is applied at the RAW `gl.setPixelRatio` level and is
 *    deliberately INVISIBLE to r3f's `viewport.dpr` state. It must NOT go
 *    through r3f `setDpr`: r3f's root `configure()` re-runs on every Canvas
 *    commit and re-applies the `dpr` prop whenever its value differs from
 *    `viewport.dpr` — so a degrade held in r3f state was stomped back to full
 *    resolution by ANY store-driven Canvas re-render mid-gesture (probe
 *    stack-traced to `configure → setDpr`, 2026-07-24), each stomp clearing
 *    the buffer with no repaint (a white flash) and forcing a heal-back
 *    (another resize). With `viewport.dpr` always at the full clamp,
 *    `configure()`'s comparison never fires.
 *  - Each raw ratio change is followed by a same-value r3f `setSize` nudge:
 *    `@react-three/postprocessing`'s composer only re-sizes its internal
 *    buffers when the r3f `size` identity changes (its effect keys on `size`,
 *    and `composer.setSize` re-reads the *drawing buffer*), so without the
 *    nudge the post stack would keep rendering at the old resolution and the
 *    degrade would save nothing. The nudge doesn't touch the GL ratio (r3f's
 *    size/dpr subscriber skips identical width/height/dpr values).
 *  - Every resize is repainted in the SAME task via `advance()`: resizing the
 *    drawing buffer CLEARS it, and in demand mode the scheduled invalidate
 *    only renders on the NEXT rAF — so each degrade engage/release composited
 *    at least one blank (page-white) frame, long ones after a restore whose
 *    first full-res frame at Maximum takes hundreds of ms. That blank
 *    composite WAS the "white flickering while orbiting at Maximum".
 *  - The decision is re-checked on a cheap always-on rAF loop (not useFrame):
 *    the restore edge fires *after* frames stop (gesture released → demand
 *    mode idle), when no useFrame would run — restoring there means the next
 *    discrete edit renders sharp instead of flashing one soft frame first.
 *  - Long-frame detection lives in useFrame (it needs the rendered-frame
 *    delta) but only trusts deltas while frames are continuously driven —
 *    idle demand-mode gaps between two single frames are not slow frames.
 */
export function InteractiveDprController() {
  const gl = useThree((s) => s.gl)
  const setSize = useThree((s) => s.setSize)
  const advance = useThree((s) => s.advance)
  const get = useThree((s) => s.get)
  const enabled = useFeature('interactiveDegrade')
  const quality = useQuality()
  const postprocessing = quality.postprocessing
  const dprMax = quality.dprMax
  const dprHalved = useStore((s) => s.dprHalved)
  const degraded = useRef(false)

  useFrame((_, dt) => {
    noteRenderedFrame(
      dt * 1000,
      isCameraGestureActive() || isRenderingContinuously(),
      performance.now(),
    )
  })

  useEffect(() => {
    if (!enabled) return
    // `dprHalved` is the adaptive ladder's LAST RUNG (`(z)`7): once the class ladder and the shadow
    // fallback are both spent, cap resolution at 1. Worth 4.5x measured (10.9 -> 49.6 fps), the
    // largest lever in this arc.
    //
    // **It lives HERE, not in `QualityController`, and that is the whole reason it works.**
    // `v0.31.7.144` measured two failed attempts: an r3f `setDpr` is stomped back by `configure()`
    // on every Canvas commit, and clamping the Canvas `dpr` prop did not take either. This
    // controller already owns the raw `gl.setPixelRatio` level, keeps `viewport.dpr` deliberately
    // at the full clamp so `configure()` has nothing to disagree with, and — critically — its rAF
    // loop below HEALS EXTERNAL STOMPS by comparing `gl.getPixelRatio()` against `desired` every
    // frame. Folding the rung into `effectiveDpr` inherits all of that for free.
    const effectiveDpr = () => Math.min(window.devicePixelRatio || 1, dprHalved ? 1 : dprMax)
    const apply = (want: boolean, renderNow = true) => {
      degraded.current = want
      const full = effectiveDpr()
      // Raw GL-level ratio — never r3f setDpr (see docstring: configure()
      // stomps any viewport.dpr that differs from the Canvas dpr prop).
      gl.setPixelRatio(want ? degradedDpr(full) : full)
      // Nudge the composer's size subscription (see docstring) — same values,
      // fresh identity; r3f skips the GL-level resize for identical values so
      // the raw ratio above survives.
      const { size } = get()
      setSize(size.width, size.height, size.top, size.left)
      // Repaint in the SAME task as the resize (see docstring) so the cleared
      // buffer never reaches the compositor. Guarded so a Canvas teardown
      // never renders a half-disposed tree; best-effort — a failed repaint
      // just means one blank composite, the pre-fix behaviour.
      if (renderNow && !document.hidden && gl.domElement.isConnected) {
        try {
          advance(performance.now(), true)
        } catch {
          // mid-teardown render — the scheduled invalidate repaints instead
        }
      }
    }
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const want = shouldDegradeDpr({
        now: performance.now(),
        gestureActive: isCameraGestureActive(),
        gestureEndedAt: cameraGestureEndedAt(),
        lastLongFrameAt: lastLongFrameTime(),
        postprocessing,
        effectiveDpr: effectiveDpr(),
        recording: useStore.getState().recording,
      })
      // Heal external stomps too (a window resize or tier switch re-applies
      // the full state-level ratio at the GL level while a degrade window is
      // open — rare, and each heal repaints in-task).
      const desired = want ? degradedDpr(effectiveDpr()) : effectiveDpr()
      if (want !== degraded.current || Math.abs(gl.getPixelRatio() - desired) > 1e-3) apply(want)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      // Never leave the scene stuck at the degraded resolution (flag flipped
      // off / tier change remount / Canvas teardown order). This cleanup also
      // runs on a dep-change re-run (e.g. a tier switch) where the canvas
      // lives on — repaint there too; the isConnected guard in `apply` skips
      // the repaint on a real teardown.
      if (degraded.current) apply(false)
    }
  }, [enabled, postprocessing, dprMax, dprHalved, gl, setSize, advance, get])

  return null
}
