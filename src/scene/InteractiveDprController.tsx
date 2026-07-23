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
 * Mechanics:
 *  - DPR changes go through r3f `setDpr` (so viewport state stays coherent),
 *    followed by a same-value `setSize` nudge: `@react-three/postprocessing`'s
 *    composer only re-sizes its internal buffers when the r3f `size` identity
 *    changes (its effect keys on `size`, and `composer.setSize` re-reads the
 *    *drawing buffer*), so without the nudge the post stack would keep
 *    rendering at the old resolution and the degrade would save nothing.
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
  const setDpr = useThree((s) => s.setDpr)
  const setSize = useThree((s) => s.setSize)
  const get = useThree((s) => s.get)
  const enabled = useFeature('interactiveDegrade')
  const quality = useQuality()
  const postprocessing = quality.postprocessing
  const dprMax = quality.dprMax
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
    const effectiveDpr = () => Math.min(window.devicePixelRatio || 1, dprMax)
    const apply = (want: boolean) => {
      degraded.current = want
      const full = effectiveDpr()
      setDpr(want ? degradedDpr(full) : full)
      // Nudge the composer's size subscription (see docstring) — same values,
      // fresh identity. r3f re-applies the (unchanged) camera + canvas size and
      // invalidates, so the new resolution presents immediately in demand mode.
      const { size } = get()
      setSize(size.width, size.height, size.top, size.left)
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
      // Heal external stomps too (tier switch / Canvas dpr prop re-apply set
      // the full ratio while a degrade window is open).
      const desired = want ? degradedDpr(effectiveDpr()) : effectiveDpr()
      if (want !== degraded.current || Math.abs(gl.getPixelRatio() - desired) > 1e-3) apply(want)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      // Never leave the scene stuck at the degraded resolution (flag flipped
      // off / tier change remount / Canvas teardown order).
      if (degraded.current) apply(false)
    }
  }, [enabled, postprocessing, dprMax, gl, setDpr, setSize, get])

  return null
}
