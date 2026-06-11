import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isMultiLevel, planLevels } from '../floorplan/levels'
import { useQuality } from '../scene/useQuality'
import { useStore } from '../state/store'
import { useCatalog } from './catalog'
import { Furniture } from './Furniture'
import { isItemInRoom, type RoomContainment } from './roomFilter'

/**
 * Mounts one <Furniture> per item in the store. Each instance receives
 * its def by reference so memoised children only re-render when the
 * item or its def actually changes.
 *
 * When `room` is given (per-room editor), only items whose footprint center
 * lies inside that room render — the rest are filtered out.
 */
export function FurnitureLayer({ room }: { room?: RoomContainment } = {}) {
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
  // Items hidden for decluttering (visual only) are skipped here.
  const hidden = useStore(useShallow((s) => s.hiddenItemIds))
  // Memoised so a drag (which re-renders this layer every pointermove via the
  // items change) doesn't reallocate the Set when the hidden set is unchanged.
  const hiddenSet = useMemo(() => (hidden.length > 0 ? new Set(hidden) : null), [hidden])
  // Multi-storey plans (F13/ML3): items render at their level's elevation and
  // unmount with a hidden level. Single-level plans skip all of this (null map).
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const levelElevations = useMemo(() => {
    // The isolated room editor renders its room at y=0 whatever the storey —
    // items there stay unoffset; level membership is the room filter's job.
    if (room || !isMultiLevel(plan)) return null
    return new Map(planLevels(plan).map((l) => [l.id, l.elevation] as const))
  }, [plan, room])
  return (
    <group>
      {items.map((item) => {
        const def = catalog[item.defId]
        if (!def) return null
        if (hiddenSet?.has(item.id)) return null
        if (room && !isItemInRoom(item, room)) return null
        const levelId = item.levelId && levelElevations?.has(item.levelId) ? item.levelId : 'ground'
        if (levelElevations && viewLevelId !== 'all' && levelId !== viewLevelId) return null
        const elevation = levelElevations?.get(levelId) ?? 0
        const node = (
          <Furniture
            key={item.id}
            item={item}
            def={def}
            contactShadow={contactShadow}
            materialEpoch={materialEpoch}
          />
        )
        return elevation > 0 ? (
          <group key={item.id} position={[0, elevation, 0]}>
            {node}
          </group>
        ) : (
          node
        )
      })}
    </group>
  )
}
