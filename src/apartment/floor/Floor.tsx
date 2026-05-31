import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../state/store'
import { ROOMS } from '../constants'
import type { RoomId } from '../types'
import { computeRoomFloorRects } from './floorRects'
import { RoomFloor } from './RoomFloor'

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
        if (r.external) return null
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
