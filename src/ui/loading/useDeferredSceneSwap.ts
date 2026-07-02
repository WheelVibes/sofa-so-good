import { useEffect, useState } from 'react'

/** Hold scene-swap visuals for two rAF ticks after a transition overlay opens so
 *  the loader paints at full speed before heavy Canvas/editor mounts run. */
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
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        setVisual({ roomEditor: roomEditorActive, floorPlan: floorPlanEditing })
      })
    })
    return () => {
      cancelAnimationFrame(id1)
      if (id2) cancelAnimationFrame(id2)
    }
  }, [loadingActive, roomEditorActive, floorPlanEditing])

  return visual
}
