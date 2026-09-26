import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { PointLight } from 'three'
import { buildCollisionWalls } from '../../collision/wallsFromState'
import { levelAsPlan, walkLevel } from '../../floorplan/levels'
import { isDefaultPlan, planCollisionWalls } from '../../floorplan/planGeometry'
import { useStore } from '../../state/store'
import { shouldReduceMotion } from '../../ui/motionPreference'
import { type FixtureLight, mergeFixtureLights } from './fixtureLights'
import { emptyPool, type PoolState, poolFading, stepPool } from './lightPool'
import {
  aggregateGain,
  LIGHT_POOL_SIZE,
  lightRoomIds,
  poolSelection,
  type RoomLinks,
  roomAtCamera,
  roomEntryId,
  roomLinks,
} from './lightRooms'

const SLOTS = Array.from({ length: LIGHT_POOL_SIZE }, (_, i) => i)
const NO_LINKS: RoomLinks = new Map()

/**
 * ROOM-SCOPED-LIGHTS — the fixture point lights as a CONSTANT pool of {@link LIGHT_POOL_SIZE}
 * slots (`roomScopedLights` flag; the selection rule is `lightRooms.ts`, the slot/fade state
 * `lightPool.ts`).
 *
 * The slots are mounted whatever the lights switch says — dark at intensity 0 while it is off —
 * so the lit programs' `NUM_POINT_LIGHTS` never changes in walk mode and turning the lights on
 * compiles nothing. A dark slot costs exactly what a lit one does (R7-AB §9.2), which is why the
 * pool is small rather than "every fixture, dimmed".
 *
 * - **Walk mode:** the slots carry the camera's room and the rooms visible from it. Everything
 *   per-frame is written straight to the `PointLight`s (uniform writes, no React state), and a
 *   frame is requested while a cross-fade is in flight (demand frameloop).
 * - **Orbit:** a dollhouse sees every room, so every fixture renders — the first
 *   {@link LIGHT_POOL_SIZE} in the slots (stable item order) and the rest as ordinary lights on
 *   top. The orbit picture is exactly the pre-pool one, and a lights-off orbit carries the same
 *   dark slots, so entering walk mode does not change the count either.
 * - **IES spot fixtures** are not pooled (a different light type with its own program key); the
 *   parent renders them as before.
 */
export function PooledFixtureLights({ lights }: { lights: readonly FixtureLight[] }) {
  const walk = useStore((s) => s.cameraMode) === 'firstPerson'
  const floorPlan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const doors = useStore((s) => s.doors)
  const editorRoom = useStore((s) => s.roomEditor.roomId)

  const level = useMemo(() => walkLevel(floorPlan, viewLevelId), [floorPlan, viewLevelId])
  // The room editor shows one room's shell, so a neighbour's lamp could only leak into it.
  const rooms = useMemo(
    () => (editorRoom ? level.rooms.filter((r) => r.id === editorRoom) : level.rooms),
    [level, editorRoom],
  )
  // Exactly the walls the walker collides with (`FirstPersonCamera.tsx`): open doors are gaps,
  // closed doors are walls, so a room behind a closed door is not "visible".
  const links = useMemo(() => {
    if (editorRoom) return NO_LINKS
    const walls = isDefaultPlan(floorPlan)
      ? buildCollisionWalls(doors)
      : planCollisionWalls(levelAsPlan(floorPlan, level), doors)
    return roomLinks(rooms, walls)
  }, [editorRoom, floorPlan, level, rooms, doors])

  const lightRooms = useMemo(() => lightRoomIds(rooms, lights), [rooms, lights])
  // Pool entries that exist at all right now: every fixture, and every room's merged stand-in.
  const { byId, candidates } = useMemo(() => {
    const m = new Map<string, FixtureLight>(lights.map((l) => [l.id, l]))
    const c = new Set(m.keys())
    for (const r of lightRooms.values()) if (r) c.add(roomEntryId(r))
    return { byId: m, candidates: c }
  }, [lights, lightRooms])
  const overflow = walk ? [] : lights.slice(LIGHT_POOL_SIZE)

  const slotRefs = useRef<(PointLight | null)[]>([])
  const pool = useRef<PoolState>(emptyPool(LIGHT_POOL_SIZE))
  const cameraRoom = useRef<string | null>(null)
  const lastWalk = useRef(walk)
  // The selection only changes with its inputs; cache it (and the merged room stand-ins it
  // needs) so a walking camera allocates nothing per frame.
  const selection = useRef<{ key: unknown[]; ids: string[]; merged: Map<string, FixtureLight> }>({
    key: [],
    ids: [],
    merged: new Map(),
  })

  useFrame((state, delta) => {
    let wanted: string[]
    if (walk) {
      const p = state.camera.position
      cameraRoom.current = roomAtCamera(rooms, p.x, p.z, cameraRoom.current)
      const key = [cameraRoom.current, lights, lightRooms, links]
      const c = selection.current
      if (key.some((k, i) => k !== c.key[i])) {
        const entries = poolSelection(lights, lightRooms, links, cameraRoom.current)
        // Keep a stand-in still fading out of a slot, or it would vanish mid-fade.
        const merged = new Map<string, FixtureLight>()
        for (const s of pool.current.slots) {
          const prev = s.lightId ? c.merged.get(s.lightId) : undefined
          if (prev) merged.set(prev.id, prev)
        }
        for (const e of entries) {
          if (e.members.length < 2) continue
          const ms = e.members.map((id) => byId.get(id)).filter((l): l is FixtureLight => !!l)
          const m = mergeFixtureLights(ms)
          const room = rooms.find((r) => r.id === lightRooms.get(e.members[0]))
          const lit = (l: FixtureLight) => ({
            position: l.position,
            intensity: l.baseIntensity * l.moodMultiplier,
            distance: l.distance,
          })
          const gain = room ? aggregateGain(room, ms.map(lit), lit(m)) : 1
          merged.set(e.id, { ...m, id: e.id, baseIntensity: m.baseIntensity * gain })
        }
        selection.current = { key, ids: entries.map((e) => e.id), merged }
      }
      wanted = selection.current.ids
    } else {
      cameraRoom.current = null
      wanted = lights.slice(0, LIGHT_POOL_SIZE).map((l) => l.id)
    }
    const merged = selection.current.merged
    // A view-mode switch re-seats the whole pool at once; so does reduced motion, for any change.
    const instant = walk !== lastWalk.current || shouldReduceMotion()
    lastWalk.current = walk
    const next = stepPool(pool.current, wanted, candidates, Math.min(delta, 0.1), instant)
    pool.current = next
    for (const i of SLOTS) {
      const light = slotRefs.current[i]
      if (!light) continue
      const slot = next.slots[i]
      const l = slot.lightId ? (byId.get(slot.lightId) ?? merged.get(slot.lightId)) : undefined
      if (!l) {
        light.intensity = 0
        continue
      }
      light.position.set(l.position[0], l.position[1], l.position[2])
      light.color.set(l.color)
      light.distance = l.distance
      light.intensity = l.baseIntensity * l.moodMultiplier * slot.weight
    }
    if (poolFading(next)) state.invalidate()
  })

  return (
    <>
      {SLOTS.map((i) => (
        <pointLight
          key={`pool-${i}`}
          ref={(el) => {
            slotRefs.current[i] = el
          }}
          intensity={0}
          decay={2}
        />
      ))}
      {overflow.map((l) => (
        <pointLight
          key={l.id}
          position={l.position}
          color={l.color}
          intensity={l.baseIntensity * l.moodMultiplier}
          distance={l.distance}
          decay={2}
        />
      ))}
    </>
  )
}
