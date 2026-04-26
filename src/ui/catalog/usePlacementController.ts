import { useEffect } from 'react';
import { useStore } from '../../state/store';
import { useCatalog } from '../../furniture/catalog';
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
 * While a catalog placement is armed (`activeDefId` set), tracks the
 * cursor for the ghost preview and commits / cancels on user input:
 *   - pointermove → updates cursor for PlacementGhost
 *   - left click on canvas with green ghost → commits, then disarms
 *   - left click on canvas with red ghost → ignored
 *   - right click or Escape → cancels
 * Clicks outside the canvas (e.g. catalog drawer, toolbar) are passed
 * through so the user can switch defs or interact with UI freely.
 */
export function usePlacementController() {
  const activeDefId = useStore((s) => s.activeDefId);
  const catalog = useCatalog();

  useEffect(() => {
    if (!activeDefId) return;
    const def = catalog[activeDefId];
    if (!def) return;

    const onMove = (ev: PointerEvent) => {
      useStore.getState().setCursor({ x: ev.clientX, y: ev.clientY });
    };
    const onClick = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      if (!(ev.target instanceof HTMLCanvasElement)) return;
      const { ghostWorld, ghostValid, addItem, cancelPlacement } =
        useStore.getState();
      if (!ghostWorld || !ghostValid) {
        // Red ghost — swallow the click so it doesn't deselect or do
        // anything else; user must move to a green spot first.
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      addItem({
        defId: def.id,
        position: ghostWorld,
        rotation: def.defaultRotation ?? 0,
        props: defaultProps(def),
      });
      cancelPlacement();
    };
    const onContext = (ev: MouseEvent) => {
      ev.preventDefault();
      useStore.getState().cancelPlacement();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Escape') useStore.getState().cancelPlacement();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('click', onClick, true);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
    };
  }, [activeDefId, catalog]);
}
