import { useEffect, useState } from 'react'
import { afterFrames } from './frameGate'

/** Hold scene-swap visuals for two rAF ticks after a transition overlay opens so
 *  the loader paints at full speed before heavy Canvas/editor mounts run.
 *
 * Uses `frameGate.ts:afterFrames` (UPDATE-FLOW boot audit) rather than a raw
 * two-`requestAnimationFrame` chain: a HIDDEN tab/occluded window never
 * delivers a frame (see `frameGate.ts`'s header — this is the exact class of
 * bug `App.tsx`'s phase-1→2 Canvas mount already fixed with the same helper),
 * so backgrounding the tab mid-transition used to strand the OLD scene on
 * screen under the loading overlay forever. `afterFrames` falls back to a
 * timer while hidden, so the swap still completes and resumes instantly on
 * `visibilitychange`. On a visible tab the behaviour is unchanged — still
 * exactly two real frames. */
export function useDeferredSceneSwap(
  loadingActive: boolean,
  roomEditorActive: boolean,
  floorPlanEditing: boolean,
) {
  const [visual, setVisual] = useState(() => ({
    roomEditor: roomEditorActive,
    floorPlan: floorPlanEditing,
  }))

  useEffect(() => {
    if (!loadingActive) {
      setVisual({ roomEditor: roomEditorActive, floorPlan: floorPlanEditing })
      return
    }
    return afterFrames(2, () =>
      setVisual({ roomEditor: roomEditorActive, floorPlan: floorPlanEditing }),
    )
  }, [loadingActive, roomEditorActive, floorPlanEditing])

  return visual
}
