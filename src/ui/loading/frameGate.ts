/**
 * Waiting for animation frames without deadlocking a hidden tab.
 *
 * Chrome delivers **zero** `requestAnimationFrame` callbacks to a page that is
 * not visible — and on macOS "not visible" includes a window merely OCCLUDED by
 * another window, not just a minimised one. Any boot step that awaits a frame
 * therefore stops dead in a background tab, an occluded window, or an offscreen
 * harness, which reads exactly like a broken build: the loader cover never
 * lifts, no canvas mounts, and probing the store shows a perfectly healthy
 * `bootPhase: 'ready'` with nothing on screen.
 *
 * `state/storage/bootstrap.ts:yieldFrame` already solved this for the hydration
 * step (v0.28.0.0). These helpers do the same for the two gates that were left:
 * the phase-1→2 Canvas mount (two chained frames) and `sceneReady` (four
 * `useFrame` ticks).
 *
 * The rule in both: a frame is the PREFERRED signal, because on a visible tab it
 * means the compositor really did paint; a timer is the fallback so a hidden tab
 * still makes progress. Pure — every dependency is injected, so the tests can
 * drive a hidden page without a browser.
 */

export interface FrameGateDeps {
  /** Is the page currently invisible (so no frames will arrive)? */
  hidden: () => boolean
  raf: (cb: () => void) => number
  cancelRaf: (handle: number) => void
  timer: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer: (handle: ReturnType<typeof setTimeout>) => void
}

/** Real-browser dependencies, with safe fallbacks for a non-DOM environment. */
function browserFrameGateDeps(): FrameGateDeps {
  return {
    hidden: () => typeof document !== 'undefined' && document.hidden,
    raf: (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : 0),
    cancelRaf: (h) => {
      if (typeof cancelAnimationFrame === 'function' && h) cancelAnimationFrame(h)
    },
    timer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (h) => clearTimeout(h),
  }
}

/** How long to wait for a frame that may never come before taking the timer. */
const FRAME_FALLBACK_MS = 32

/**
 * Run `cb` after `count` animation frames, or sooner via the timer fallback when
 * the page is hidden (or frames stop arriving mid-wait — a tab can be
 * backgrounded between frames). Returns a cancel function; `cb` runs at most
 * once.
 */
export function afterFrames(
  count: number,
  cb: () => void,
  deps: FrameGateDeps = browserFrameGateDeps(),
): () => void {
  let cancelled = false
  let rafHandle = 0
  let timerHandle: ReturnType<typeof setTimeout> | undefined

  const step = (left: number) => {
    if (cancelled) return
    if (left <= 0) {
      cb()
      return
    }
    // Hidden: no frame is coming, so don't ask for one.
    if (deps.hidden()) {
      timerHandle = deps.timer(() => step(left - 1), 0)
      return
    }
    let advanced = false
    const advance = () => {
      if (cancelled || advanced) return
      advanced = true
      deps.cancelRaf(rafHandle)
      if (timerHandle !== undefined) deps.clearTimer(timerHandle)
      step(left - 1)
    }
    rafHandle = deps.raf(advance)
    // …and a fallback, in case the tab goes hidden after we asked.
    timerHandle = deps.timer(advance, FRAME_FALLBACK_MS)
  }

  step(count)
  return () => {
    cancelled = true
    deps.cancelRaf(rafHandle)
    if (timerHandle !== undefined) deps.clearTimer(timerHandle)
  }
}

/**
 * May `sceneReady` be forced without the usual painted frames?
 *
 * `sceneReady` normally waits for four `useFrame` ticks so shaders and
 * procedural textures are warm before the boot cover fades — a promise about
 * what the user will SEE. A hidden page paints nothing, so those ticks never
 * come and the cover would hide a scene that is, as far as anyone can tell,
 * finished. Forcing it there costs nothing (there is no viewer) and is the
 * difference between a verifiable background tab and an apparent hang.
 *
 * Strictly hidden-only: on a visible tab the frame count still rules, so this
 * can never reveal an unwarmed scene to a real user.
 */
export function shouldForceSceneReady(s: {
  hidden: boolean
  sceneReady: boolean
  /** drei's loading-manager progress — still streaming assets. */
  progressActive: boolean
}): boolean {
  return s.hidden && !s.sceneReady && !s.progressActive
}
