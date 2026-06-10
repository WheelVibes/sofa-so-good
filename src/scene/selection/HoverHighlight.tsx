import { useMemo } from 'react'
import { itemFootprint } from '../../collision/placement'
import { useCatalogGetter } from '../../furniture/catalog'
import { useStore } from '../../state/store'
import { boxEdges, useDisposeGeometry } from '../geometryUtil'

/**
 * Faint outline under the hovered (but not selected) furniture item, so it's
 * clear what a click will select. Suppressed while dragging or placing.
 */
export function HoverHighlight() {
  const hoveredId = useStore((s) => s.hoveredItemId)
  const selectedIds = useStore((s) => s.selectedItemIds)
  const dragging = useStore((s) => s.draggingItemId)
  const items = useStore((s) => s.items)
  // Non-reactive accessor — re-renders on hover/selection/items, not catalog churn.
  const { ref: catalogRef } = useCatalogGetter()

  const item = hoveredId ? items.find((i) => i.id === hoveredId) : null
  const def = item ? catalogRef.current[item.defId] : null
  const obb = useMemo(() => (item && def ? itemFootprint(item, def) : null), [item, def])
  const geom = useMemo(
    () => (obb ? boxEdges(obb.hx * 2 + 0.08, 0.001, obb.hz * 2 + 0.08) : null),
    [obb],
  )
  useDisposeGeometry(geom)

  if (!item || !def || !geom) return null
  if (dragging || selectedIds.includes(item.id)) return null

  return (
    <lineSegments
      geometry={geom}
      position={[item.position[0], 0.015, item.position[1]]}
      rotation={[0, item.rotation, 0]}
      renderOrder={2}
    >
      <lineBasicMaterial color="#93c5fd" transparent opacity={0.8} depthWrite={false} />
    </lineSegments>
  )
}
