import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../features/useFeature'
import { isMultiLevel, planLevels } from '../floorplan/levels'
import { useQuality } from '../scene/useQuality'
import { useStore } from '../state/store'
import { useCatalog } from './catalog'
import { Furniture } from './Furniture'
import { computeDimmedItemIds } from './isolateSelection'
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
  // Legacy guard from the retired showcase accumulator (RD-410): it suppressed
  // contact blobs while that ground plane converged. The flag is now pinned
  // `false`, so contacts always show; kept as a harmless no-op rather than
  // rewiring every reader.
  const accumulating = useStore((s) => s.showcaseAccumulating)
  // Grounding blobs are gated by the `contactShadows` feature flag (RZ1) on top
  // of the per-tier quality setting, so they can be turned off independently.
  const contactShadowsOn = useFeature('contactShadows')
  const qualityContactShadows = useQuality().contactShadows
  const contactShadow = contactShadowsOn && qualityContactShadows && !accumulating
  // Re-render furniture whenever a DLC/catalog material finishes building so
  // the primitives' synchronous material lookup picks up the new texture.
  const materialEpoch = useStore((s) => s.materialEpoch)
  // Items hidden for decluttering (visual only) are skipped here.
  const hidden = useStore(useShallow((s) => s.hiddenItemIds))
  // Memoised so a drag (which re-renders this layer every pointermove via the
  // items change) doesn't reallocate the Set when the hidden set is unchanged.
  const hiddenSet = useMemo(() => (hidden.length > 0 ? new Set(hidden) : null), [hidden])
  // Isolate/solo mode (FEAT-C): items outside the current selection render
  // dimmed (not hidden) while active, so the room stays legible. Gated by the
  // `isolateSelection` flag as well as the session-only `isolateActive` state
  // — flipping the flag off (e.g. Simple mode forcing a pro flag off) can't
  // strand a dimmed scene, since the flag simply forces the derived set empty.
  const isolateOn = useFeature('isolateSelection')
  const isolateActive = useStore((s) => s.isolateActive)
  const selectedItemIds = useStore(useShallow((s) => s.selectedItemIds))
  const dimmedSet = useMemo(
    () =>
      computeDimmedItemIds(
        items.map((i) => i.id),
        selectedItemIds,
        isolateOn && isolateActive,
      ),
    [items, selectedItemIds, isolateOn, isolateActive],
  )
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
            dimmed={dimmedSet.has(item.id)}
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
