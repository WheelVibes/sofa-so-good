import { useShallow } from 'zustand/react/shallow'
import type { RoomShell } from '../apartment/roomShell'
import { useQuality } from '../scene/useQuality'
import { useStore } from '../state/store'
import { useCatalog } from './catalog'
import { Furniture } from './Furniture'
import { isItemInRoom } from './roomFilter'

/**
 * Mounts one <Furniture> per item in the store. Each instance receives
 * its def by reference so memoised children only re-render when the
 * item or its def actually changes.
 *
 * When `room` is given (per-room editor), only items whose footprint center
 * lies inside that room render — the rest are filtered out.
 */
export function FurnitureLayer({ room }: { room?: RoomShell } = {}) {
  const items = useStore(useShallow((s) => s.items))
  const catalog = useCatalog()
  // Suppress per-item contact-shadow blobs while the showcase
  // AccumulativeShadows ground plane is converging, so contacts don't
  // double-darken.
  const accumulating = useStore((s) => s.showcaseAccumulating)
  const contactShadow = useQuality().contactShadows && !accumulating
  // Re-render furniture whenever a DLC/catalog material finishes building so
  // the primitives' synchronous material lookup picks up the new texture.
  const materialEpoch = useStore((s) => s.materialEpoch)
  return (
    <group>
      {items.map((item) => {
        const def = catalog[item.defId]
        if (!def) return null
        if (room && !isItemInRoom(item, room)) return null
        return (
          <Furniture
            key={item.id}
            item={item}
            def={def}
            contactShadow={contactShadow}
            materialEpoch={materialEpoch}
          />
        )
      })}
    </group>
  )
}
