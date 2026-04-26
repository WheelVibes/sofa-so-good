import { useCallback } from 'react';
import { useStore } from '../../state/store';
import {
  defaultParamProps,
  type FurnitureDef,
  type ParamProps,
} from '../../furniture/types';

function defaultProps(def: FurnitureDef): ParamProps {
  if (def.kind === 'parametric') return defaultParamProps(def);
  return def.scale != null ? { scale: def.scale } : {};
}

/**
 * Hook returning a pointer-down handler that starts a drag-place
 * session for a catalog def.
 *
 * Flow:
 *   1. pointer-down → set activeDefId + cursor; PlacementGhost picks
 *      up the def and starts following the cursor.
 *   2. pointer-move → write cursor to slice; ghost re-projects each
 *      frame and writes ghostWorld + ghostValid back.
 *   3. pointer-up → if ghost is at a valid spot, addItem; else
 *      cancel. Listeners are scoped to this drag session.
 */
export function usePlacementDrag(def: FurnitureDef) {
  return useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const { setActiveDefId, setCursor, cancelPlacement } = useStore.getState();
      setActiveDefId(def.id);
      setCursor({ x: e.clientX, y: e.clientY });

      const onMove = (ev: PointerEvent) => {
        useStore.getState().setCursor({ x: ev.clientX, y: ev.clientY });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const { ghostWorld, ghostValid, addItem } = useStore.getState();
        if (ghostWorld && ghostValid) {
          addItem({
            defId: def.id,
            position: ghostWorld,
            rotation: def.defaultRotation ?? 0,
            props: defaultProps(def),
          });
        }
        cancelPlacement();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [def],
  );
}
