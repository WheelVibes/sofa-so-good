import { onFrameRendered } from '../../scene/frameRenderedSignal'

/** rAF ticks to wait before counting frames — matches useDeferredSceneSwap's
 *  two-tick hold, so frames of the OLD scene never count as readiness. */
export const SWAP_COMMIT_RAFS = 2
/** Rendered frames of the swapped-in scene before the overlay may hide. The
 *  first frame carries the shader-compile/upload block; the second means the
 *  scene is actually on screen. */
export const READY_FRAMES = 2
/** Safety net for targets that produce no WebGL frames (2D floor-plan editor
 *  with a dead canvas, lost context) — never strand the overlay. */
export const MAX_WAIT_MS = 2000

export interface TransitionHideDeps {
  raf: (cb: FrameRequestCallback) => number
  caf: (id: number) => void
  setTimeout: (cb: () => void, ms: number) => number
  clearTimeout: (id: number) => void
  /** Subscribe to rendered WebGL frames; returns unsubscribe. */
  onFrame: (cb: () => void) => () => void
}

const domDeps: TransitionHideDeps = {
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  onFrame: onFrameRendered,
}

/**
 * Readiness-based hide for the transition loading overlay: wait for the
 * deferred scene swap to commit (SWAP_COMMIT_RAFS), then for READY_FRAMES real
 * WebGL frames from the swapped-in scene (via frameRenderedSignal, fed by the
 * RenderPump's throttled warm frames), then call `hide` exactly once. A
 * MAX_WAIT_MS timeout guarantees the hide even if no frame ever renders.
 *
 * Returns a cancel function that tears everything down without hiding.
 */
export function scheduleTransitionHide(
  hide: () => void,
  deps: TransitionHideDeps = domDeps,
): () => void {
  let done = false
  let rafId = 0
  let unsubFrame: (() => void) | null = null

  const timeoutId = deps.setTimeout(() => finish(), MAX_WAIT_MS)

  const cleanup = () => {
    done = true
    deps.caf(rafId)
    deps.clearTimeout(timeoutId)
    unsubFrame?.()
    unsubFrame = null
  }
  const finish = () => {
    if (done) return
    cleanup()
    hide()
  }

  let rafsLeft = SWAP_COMMIT_RAFS
  let framesLeft = READY_FRAMES
  const tick = () => {
    if (done) return
    rafsLeft -= 1
    if (rafsLeft > 0) {
      rafId = deps.raf(tick)
      return
    }
    // Swap committed — start counting rendered frames.
    unsubFrame = deps.onFrame(() => {
      framesLeft -= 1
      if (framesLeft <= 0) finish()
    })
  }
  rafId = deps.raf(tick)

  return cleanup
}
