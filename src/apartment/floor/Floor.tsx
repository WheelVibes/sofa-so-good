import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { useStore } from '../../state/store'
import { ROOMS } from '../constants'
import type { RoomId } from '../types'
import { computeRoomFloorRects } from './floorRects'
import { RoomFloor } from './RoomFloor'

const SLAB_LIFT = 0.001

/**
 * A plain concrete floor slab for an EXTERNAL room (e.g. the AC ledge) —
 * no finish-picker wiring, no click-to-enter, just a neutral concrete plane
 * at the same floor level as the interior rooms. `computeRoomFloorRects`
 * (the carve logic feeding `RoomFloor` above) deliberately excludes external
 * rooms — they have no interior floor finish to carve around — so this
 * renders the room's own rect(s) directly instead.
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
 * Renders one mesh per non-overlapping floor sub-rect, grouped by room.
 * Source ROOMS rectangles overlap in places (e.g. livingDining's NW
 * corner reaches into bedroom3 and the corridor); `computeRoomFloorRects`
 * clips each room's rects against smaller-area rooms so overlap regions
 * are owned by the more specific room. AC ledge / external rooms are
 * skipped — they have no interior floor.
 *
 * L-shaped rooms (mainBedroom, livingDining) emit one mesh per piece,
 * all sharing the room's floor material so the finish wraps without a
 * visible seam.
 */
export function Floor() {
  const finishes = useStore(useShallow((s) => s.finishes.floor))
  const roomRects = useMemo(() => computeRoomFloorRects(), [])

  return (
    <group>
      {(Object.keys(ROOMS) as RoomId[]).map((id) => {
        const r = ROOMS[id]
        if (r.external) {
          return (
            <group key={id}>
              <ExternalSlab origin={r.origin} width={r.width} depth={r.depth} />
              {r.extension && (
                <ExternalSlab
                  origin={[
                    r.origin[0] + r.extension.offset[0],
                    r.origin[1] + r.extension.offset[1],
                  ]}
                  width={r.extension.width}
                  depth={r.extension.depth}
                />
              )}
            </group>
          )
        }
        const matId = finishes[id]
        const rects = roomRects[id]
        return (
          <group key={id}>
            {rects.map((rect, i) => (
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
