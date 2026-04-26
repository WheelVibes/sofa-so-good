import { useCallback } from 'react';
import { useStore } from '../../state/store';
import type { FurnitureDef } from '../../furniture/types';

/**
 * Click handler that arms catalog placement. After a click, the ghost
 * follows the cursor until the user clicks on the floor (commits when
 * the highlight is green) or presses Escape / right-clicks (cancels).
 * Clicking the same card again toggles placement off.
 *
 * The actual cursor tracking and commit/cancel handling lives in
 * `usePlacementController`.
 */
export function usePlacementDrag(def: FurnitureDef) {
  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { activeDefId, setActiveDefId, setCursor, cancelPlacement } =
        useStore.getState();
      if (activeDefId === def.id) {
        cancelPlacement();
        return;
      }
      setActiveDefId(def.id);
      setCursor({ x: e.clientX, y: e.clientY });
    },
    [def],
  );
}
