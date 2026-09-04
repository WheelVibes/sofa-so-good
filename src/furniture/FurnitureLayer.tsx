import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../features/useFeature'
import { roomFloorOffsetM } from '../floorplan/floorLevels3d'
import { isMultiLevel, planLevels } from '../floorplan/levels'
import { isDefaultPlan } from '../floorplan/planGeometry'
import type { PlanRoom } from '../floorplan/types'
import { pointInRoom } from '../floorplan/types'
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
 * lies inside that room render — the rest are filtered out. `roomOffsetM`
 * (BSJ-8 follow-up) is the isolated room's own FFL offset (metres) — the
 * caller (`RoomEditorScene`) resolves it once from the SAME `PlanRoomShell`
 * used to render the room's floor, so the editor's furniture always re-seats
 * on the same plane its floor mesh does.
 */
export function FurnitureLayer({
  room,
  roomOffsetM = 0,
}: {
  room?: RoomContainment
  roomOffsetM?: number
} = {}) {
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
  // WALK MODE keeps the storeys BELOW the walked one (item `(g)`, matching `PlanShell`): the shell
  // below is rendered there, and furniture filtered separately would leave a stripped empty room
  // under the mezzanine rail — a different wrong picture from the sky hole, not a fix.
  const walking = useStore((s) => s.cameraMode) === 'firstPerson'
  const walkElevation = useMemo(() => {
    if (!walking || viewLevelId === 'all' || room || !isMultiLevel(plan)) return null
    return planLevels(plan).find((l) => l.id === viewLevelId)?.elevation ?? null
  }, [walking, viewLevelId, plan, room])
  const levelElevations = useMemo(() => {
    // The isolated room editor renders its room at y=0 whatever the storey —
    // items there stay unoffset; level membership is the room filter's job.
    if (room || !isMultiLevel(plan)) return null
    return new Map(planLevels(plan).map((l) => [l.id, l.elevation] as const))
  }, [plan, room])

  // Floor levels (BSJ-8 follow-up, `floorLevels` flag): a room's FFL offset
  // re-seats its floor-anchored furniture at render time — stored
  // `item.position`/`elevation` never gain a Y field (session data stays
  // level-agnostic), mirroring how the multi-storey elevation above is a
  // render-only wrapper, not a stored offset. In the isolated room editor
  // (`room` prop set) the whole layer is already scoped to one room, so its
  // single offset is passed straight in as `roomOffsetM` rather than re-doing
  // a point-in-room scan; the curated default flat has no `floorLevelMm`
  // concept (plan-room feature only), so this only ever matters on a custom
  // plan (`isDefaultPlan` guard below covers the whole-plan overview path).
  const floorLevelsOn = useFeature('floorLevels')
  const roomsByLevel = useMemo(() => {
    if (room || !floorLevelsOn || isDefaultPlan(plan)) return null
    const out = new Map<string, readonly PlanRoom[]>()
    for (const level of planLevels(plan)) out.set(level.id, level.rooms)
    return out
  }, [plan, room, floorLevelsOn])
  const findRoomOffset = (item: { position: readonly [number, number]; levelId?: string }) => {
    if (room) return roomOffsetM
    if (!roomsByLevel) return 0
    const rooms = roomsByLevel.get(item.levelId ?? 'ground')
    if (!rooms) return 0
    for (const r of rooms) {
      if (pointInRoom(r, item.position[0], item.position[1])) return roomFloorOffsetM(r, true)
    }
    return 0
  }

  return (
    <group>
      {items.map((item) => {
        const def = catalog[item.defId]
        if (!def) return null
        if (hiddenSet?.has(item.id)) return null
        if (room && !isItemInRoom(item, room)) return null
        const levelId = item.levelId && levelElevations?.has(item.levelId) ? item.levelId : 'ground'
        if (levelElevations && viewLevelId !== 'all' && levelId !== viewLevelId) {
          // Walking: keep it if its storey is at or below the one being walked.
          const e = levelElevations.get(levelId)
          if (walkElevation == null || e == null || e > walkElevation) return null
        }
        const elevation = (levelElevations?.get(levelId) ?? 0) + findRoomOffset(item)
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
        return elevation !== 0 ? (
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
