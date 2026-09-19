import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * GPU-STARVE-3, third site (audit finding N6) — repaint the drawing buffer in the same
 * task as a VIEWPORT resize.
 *
 * **The rule this restates.** Resizing the drawing buffer CLEARS it. In
 * `frameloop="demand"` the scheduled `invalidate()` renders on the NEXT rAF, so between
 * the resize and that rAF the compositor has a blank (page-white) buffer to show — and
 * it shows it. `InteractiveDprController` learned this for the DPR degrade and fixed it
 * by calling `advance(now, true)` in the same task as its `setSize`; `Scene.tsx`'s `dpr`
 * prop comment restates it for r3f's `configure()`. Both are about the app resizing
 * itself.
 *
 * **What N6 found.** The same clear happens on a resize the app does NOT initiate.
 * `orbit-phone-orientation-mid-gesture` swaps the viewport 390x844 -> 844x390 and
 * frames 82, 83 and 85 composite as an all-white canvas with only the DOM UI drawn
 * (`/tmp/sweep/final/phone-metal/orbit-phone-orientation-mid-gesture/worst/FLASH-85.png`).
 * r3f's own path is `ResizeObserver -> setSize -> configure() -> gl.setSize() ->
 * invalidate()`: the buffer is cleared synchronously and the repaint is deferred, which
 * is exactly the shape the rule forbids. Nothing in r3f closes that gap, and nothing in
 * this app was listening for a resize it did not cause.
 *
 * **Flag-free, deliberately.** This is a straight bug fix, not a behaviour change: it
 * adds renders that were already going to happen, one rAF earlier, and it changes no
 * pixel of any frame the compositor would otherwise have shown. There is no pose, no
 * tier and no arm at which "the canvas is white for three frames" is the intended
 * output, so there is nothing for a flag to select between. (A flag would also be a
 * liability here — the defect it guards is a white flash, and the OFF branch is the
 * flash.)
 *
 * **Two repaints, not one, and the order is load-bearing.**
 *  - `useLayoutEffect` runs synchronously in the same task as the commit that called
 *    `gl.setSize`, before the browser can paint. That one KILLS THE WHITE — it is the
 *    only repaint guaranteed to beat the compositor.
 *  - `useEffect` runs after the passive effects of the rest of the tree, including
 *    `@react-three/postprocessing`'s composer, whose internal render targets re-size in
 *    an effect keyed on the r3f `size` identity (the same subscription
 *    `InteractiveDprController`'s "same-value nudge" exists to poke). That one makes the
 *    post stack's targets agree with the new drawing buffer in the same task. Without
 *    it the composer would run one more frame at the old target size; with only it, the
 *    white frame survives.
 *    Mount this component LAST inside the `Canvas` so that ordering holds — sibling
 *    passive effects fire in mount order.
 *
 * The cost is two synchronous renders per genuine viewport change — an orientation flip
 * or a window drag — which is nothing against the stall the resize itself causes, and
 * zero on every other frame: both effects are keyed on the size tuple and the first
 * mount is skipped (the boot render is already driven).
 */
export function ResizeRepaint() {
  const gl = useThree((s) => s.gl)
  const advance = useThree((s) => s.advance)
  const size = useThree((s) => s.size)
  const { width, height } = size
  /** Skip the mount pass: nothing has been resized yet, and the boot frame is driven by
   *  `RenderPump` / the loader. Only CHANGES are the defect. */
  const seen = useRef<string | null>(null)
  /** Set by the layout pass when it repainted, consumed by the passive pass — so the
   *  second repaint happens only for a size that actually CHANGED, never on mount. */
  const followUp = useRef<string | null>(null)
  const key = `${width}x${height}`

  const repaint = useCallback(() => {
    // Best-effort, exactly like `InteractiveDprController.apply` — a failed repaint just
    // means one blank composite, i.e. the pre-fix behaviour, never a thrown render.
    if (document.hidden || !gl.domElement.isConnected) return
    try {
      advance(performance.now(), true)
    } catch {
      // mid-teardown render — the scheduled invalidate repaints instead
    }
  }, [gl, advance])

  // Beat the compositor (see docstring).
  useLayoutEffect(() => {
    if (seen.current === null) {
      seen.current = key
      return
    }
    if (seen.current === key) return
    seen.current = key
    followUp.current = key
    repaint()
  }, [key, repaint])

  // Then once more, after the composer's own size effect has re-allocated its targets.
  useEffect(() => {
    if (followUp.current !== key) return
    followUp.current = null
    repaint()
  }, [key, repaint])

  return null
}
