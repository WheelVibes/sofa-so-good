import { useEffect, useMemo } from 'react'
import { noExportUserData } from '../../export/sceneGltf'
import { roomPolygon } from '../../floorplan/types'
import { worldUvShapeGeometry } from '../../materials/worldUv'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { useStore } from '../../state/store'
import { useIsMobile } from '../../ui/useIsMobile'

const LIFT = 0.015 // sit just above the floor slab + finish overlays

/**
 * Soft highlight over the room floor the cursor is on in the **orbit overview**,
 * signalling "click to edit this room" (the primary way into the per-room
 * editor). Reads the room from `floorPlan.rooms` and triangulates its outline
 * (`roomPolygon` handles rect, L-extension and free-polygon rooms), so it covers
 * the built-in apartment and custom plans alike. Hover state lives in
 * `selectionSlice.hoveredRoomId`, set by the floor meshes.
 */
export function RoomHoverHighlight() {
  const hoveredRoomId = useStore((s) => s.hoveredRoomId)
  const cameraMode = useStore((s) => s.cameraMode)
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const rooms = useStore((s) => s.floorPlan.rooms)
  // Touch has no real hover: a tap would set this and leave it stuck as a
  // distracting "preselect" before the room is actually entered. On mobile you
  // tap a room to dive straight in, so skip the highlight entirely there.
  const isMobile = useIsMobile()
  const room = hoveredRoomId ? rooms.find((r) => r.id === hoveredRoomId) : undefined
  // Triangulated room outline, in the same plane/transform PlanRoomFloor uses.
  const geometry = useMemo(() => (room ? worldUvShapeGeometry(roomPolygon(room)) : null), [room])
  useDisposeGeometry(geometry)
  // Reset the pointer cursor whenever hover clears or this overlay unmounts
  // (e.g. entering the room editor mid-hover, before a floor's onPointerOut fires).
  useEffect(() => {
    if (!hoveredRoomId) document.body.style.cursor = ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hoveredRoomId])
  // Only in the view-only overview (hover is never set elsewhere, but guard so a
  // stale id can't flash a highlight in walk / the editor).
  if (isMobile || !room || !geometry || cameraMode !== 'orbit' || roomEditorActive) return null
  return (
    <mesh
      position={[0, LIFT, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
      geometry={geometry}
      userData={noExportUserData()}
    >
      <meshBasicMaterial color="#4a90d9" transparent opacity={0.22} depthWrite={false} />
    </mesh>
  )
}
