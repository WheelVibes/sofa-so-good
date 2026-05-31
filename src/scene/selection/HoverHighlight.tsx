import { useMemo } from 'react'
import { BoxGeometry, EdgesGeometry } from 'three'
import { itemFootprint } from '../../collision/placement'
import { useCatalog } from '../../furniture/catalog'
import { useStore } from '../../state/store'

/**
 * Faint outline under the hovered (but not selected) furniture item, so it's
 * clear what a click will select. Suppressed while dragging or placing.
 */
export function HoverHighlight() {
  const hoveredId = useStore((s) => s.hoveredItemId)
  const selectedIds = useStore((s) => s.selectedItemIds)
  const dragging = useStore((s) => s.draggingItemId)
  const items = useStore((s) => s.items)
  const catalog = useCatalog()

  const item = hoveredId ? items.find((i) => i.id === hoveredId) : null
  const def = item ? catalog[item.defId] : null
  const obb = useMemo(() => (item && def ? itemFootprint(item, def) : null), [item, def])
  const geom = useMemo(
    () =>
      obb ? new EdgesGeometry(new BoxGeometry(obb.hx * 2 + 0.08, 0.001, obb.hz * 2 + 0.08)) : null,
    [obb],
  )

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
