import { useCallback } from 'react'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'

/**
 * Handler that arms catalog placement. After activation, the ghost follows the
 * cursor until the user clicks on the floor (commits when the highlight is
 * green) or presses Escape / right-clicks (cancels). Activating the same card
 * again toggles placement off.
 *
 * Works for both pointer (a `MouseEvent` carries the cursor position) and
 * keyboard (Enter/Space on a focused card — no event, so the ghost starts at
 * the viewport centre and follows the next mouse move). The actual cursor
 * tracking and commit/cancel handling lives in `usePlacementController`.
 */
export function usePlacementDrag(def: FurnitureDef) {
  return useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault()
      e?.stopPropagation()
      const { activeDefId, setActiveDefId, setCursor, cancelPlacement } = useStore.getState()
      if (activeDefId === def.id) {
        cancelPlacement()
        return
      }
      setActiveDefId(def.id)
      setCursor({
        x: e?.clientX ?? window.innerWidth / 2,
        y: e?.clientY ?? window.innerHeight / 2,
      })
    },
    [def],
  )
}
