import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { useStore } from '../../state/store'
import { ROOMS } from '../constants'
import { needsTriangulatedFloor, roomOutline, roomParts } from '../roomGeometry'
import type { RoomId } from '../types'
import { RoomFloor } from './RoomFloor'

const SLAB_LIFT = 0.001

/**
 * A plain concrete floor slab for an EXTERNAL room (e.g. the AC ledge) —
 * no finish-picker wiring, no click-to-enter, just a neutral concrete plane
 * at the same floor level as the interior rooms.
 */
function ExternalSlab({
  origin,
  width,
  depth,
}: {
  origin: readonly [number, number]
  width: number
  depth: number
}) {
  const geometry = useMemo(() => worldUvPlaneGeometry(width, depth), [width, depth])
  useDisposeGeometry(geometry)
  return (
    <mesh
      position={[origin[0] + width / 2, SLAB_LIFT, origin[1] + depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      geometry={geometry}
    >
      <meshStandardMaterial color="#b9b9b6" roughness={0.95} metalness={0} />
    </mesh>
  )
}

/**
 * Renders each room's floor, grouped by room. A room's shape comes from the ONE
 * reader, `roomGeometry.ts`: `roomParts` for the rect pieces (a multi-part room
 * — the MB + its foyer, the L/D's column + shelter strip + entrance foyer —
 * emits one mesh per piece, all sharing the room's floor material so the finish
 * wraps without a visible seam), or `roomOutline` for a room declared with a
 * non-rectilinear polygon, which renders as a single triangulated mesh.
 *
 * Room footprints must not overlap (asserted in `roomGeometry.test.ts`) — this
 * used to run an overlap-carve here because livingDining was declared as one
 * oversized rect reaching into bedroom3 and the corridor. AC ledge / external
 * rooms are skipped; they get a plain concrete slab instead.
 */
export function Floor() {
  const finishes = useStore(useShallow((s) => s.finishes.floor))

  return (
    <group>
      {(Object.keys(ROOMS) as RoomId[]).map((id) => {
        const r = ROOMS[id]
        if (r.external) {
          return (
            <group key={id}>
              {roomParts(r).map((rect, i) => (
                <ExternalSlab
                  key={i}
                  origin={[rect.x0, rect.z0]}
                  width={rect.x1 - rect.x0}
                  depth={rect.z1 - rect.z0}
                />
              ))}
            </group>
          )
        }
        const matId = finishes[id]
        if (needsTriangulatedFloor(r)) {
          const b = roomParts(r)[0]
          return (
            <group key={id}>
              <RoomFloor
                roomId={id}
                origin={[b.x0, b.z0]}
                width={b.x1 - b.x0}
                depth={b.z1 - b.z0}
                polygon={roomOutline(r).map(([x, z]) => [x, z])}
                materialId={matId}
              />
            </group>
          )
        }
        return (
          <group key={id}>
            {roomParts(r).map((rect, i) => (
              <RoomFloor
                key={i}
                roomId={id}
                origin={[rect.x0, rect.z0]}
                width={rect.x1 - rect.x0}
                depth={rect.z1 - rect.z0}
                materialId={matId}
              />
            ))}
          </group>
        )
      })}
    </group>
  )
}
