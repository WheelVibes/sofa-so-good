import { useEffect, useMemo } from 'react'
import { useStore } from '../../state/store'
import { ROOMS } from '../constants'
import { roomRects } from '../roomShell'
import type { RoomId } from '../types'

const LIFT = 0.015 // sit just above the floor slab + finish overlays

/**
 * Soft highlight over the room floor the cursor is on in the **orbit overview**,
 * signalling "click to edit this room" (the primary way into the per-room
 * editor). Default-apartment only — custom plans don't wire floor-click entry.
 * Hover state lives in `selectionSlice.hoveredRoomId`, set by `RoomFloor`.
 */
export function RoomHoverHighlight() {
  const hoveredRoomId = useStore((s) => s.hoveredRoomId)
  const cameraMode = useStore((s) => s.cameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const room = hoveredRoomId ? ROOMS[hoveredRoomId as RoomId] : undefined
  const rects = useMemo(() => (room ? roomRects(room) : []), [room])
  // Safety: reset the pointer cursor whenever hover clears or this overlay
  // unmounts (e.g. entering the room editor mid-hover, which swaps the scene
  // out before `RoomFloor`'s onPointerOut can fire).
  useEffect(() => {
    if (!hoveredRoomId) document.body.style.cursor = ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hoveredRoomId])
  // Only in the view-only overview (hover is never set elsewhere, but guard so a
  // stale id can't flash a highlight in walk / the editor).
  if (!room || rects.length === 0 || cameraMode !== 'orbit' || roomEditorActive) return null
  return (
    <group>
      {rects.map((r, i) => (
        <mesh
          key={i}
          position={[(r.x0 + r.x1) / 2, LIFT, (r.z0 + r.z1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
          <meshBasicMaterial color="#4a90d9" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
