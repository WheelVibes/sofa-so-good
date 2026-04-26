import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { BoxGeometry, EdgesGeometry } from 'three';
import { useStore } from '../../state/store';
import { useCatalog } from '../../furniture/catalog';
import { itemFootprint } from '../../collision/placement';

const OUTLINE_COLOR = '#3b82f6';
const OUTLINE_LIFT = 0.005;

/**
 * Draws a thin rectangular outline on the floor under the selected
 * item, matching its OBB footprint. Lives at the scene root so it is
 * not coupled to the FurnitureLayer transform stack.
 */
export function SelectionOutline() {
  const selectedId = useStore((s) => s.selectedItemId);
  const item = useStore(
    useShallow((s) => s.items.find((i) => i.id === s.selectedItemId)),
  );
  const catalog = useCatalog();

  // Geometry depends only on size — memoize on width/depth to avoid
  // rebuilding the edges geometry every render.
  const obb = item && catalog[item.defId] ? itemFootprint(item, catalog[item.defId]) : null;
  const w = obb ? obb.hx * 2 + 0.06 : 0;
  const d = obb ? obb.hz * 2 + 0.06 : 0;
  const geom = useMemo(() => {
    if (!w || !d) return null;
    return new EdgesGeometry(new BoxGeometry(w, 0.001, d));
  }, [w, d]);

  if (!selectedId || !obb || !geom) return null;

  return (
    <group position={[obb.cx, OUTLINE_LIFT, obb.cz]} rotation={[0, obb.rot, 0]}>
      <lineSegments geometry={geom}>
        <lineBasicMaterial color={OUTLINE_COLOR} />
      </lineSegments>
    </group>
  );
}
