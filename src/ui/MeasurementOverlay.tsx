import { Html } from '@react-three/drei'
import { ROOMS } from '../apartment/constants'
import { noExportUserData } from '../export/sceneGltf'
import { type PlanRoom, planRoomArea } from '../floorplan/types'
import { useStore } from '../state/store'
import { formatLength, formatRoomSize } from '../utils/measurement'

/** Label anchor for a room: polygon centroid when free-form, else rect centre
 *  (which equals the default-apartment `roomCentroid` for seeded rooms). */
function roomLabelCentre(r: PlanRoom): [number, number] {
  if (r.polygon && r.polygon.length > 0) {
    const n = r.polygon.length
    return [
      r.polygon.reduce((a, p) => a + p[0], 0) / n,
      r.polygon.reduce((a, p) => a + p[1], 0) / n,
    ]
  }
  return [r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2]
}

export function MeasurementOverlay() {
  const show = useStore((s) => s.showMeasurements)
  const ceilingHeight = useStore((s) => s.floorPlan.ceilingHeight)
  // Iterate the ACTIVE plan's rooms (custom plans render their own rooms; the
  // default plan's rooms are seeded from ROOMS so this matches the old output).
  // Per-room ceiling overrides live on the plan room, falling back to the ROOMS
  // constant then the global height — matching Ceiling.tsx.
  const planRooms = useStore((s) => s.floorPlan.rooms)
  const units = useStore((s) => s.units)
  // Hide the drei <Html> labels while the 2D floor-plan editor covers the scene
  // (its <Html> sits above the editor's z-index otherwise).
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  // In the per-room editor only the room being edited is on screen, so its label
  // is the only one that should show — never the whole apartment's.
  const roomEditorActive = useStore((s) => s.roomEditor.active)
  const roomEditorId = useStore((s) => s.roomEditor.roomId)
  if (!show || floorPlanEditing) return null
  const rooms =
    roomEditorActive && roomEditorId ? planRooms.filter((r) => r.id === roomEditorId) : planRooms
  return (
    <group userData={noExportUserData()}>
      {rooms.map((r) => {
        const [cx, cz] = roomLabelCentre(r)
        const height =
          r.ceilingHeight ?? ROOMS[r.id as keyof typeof ROOMS]?.ceilingHeight ?? ceilingHeight
        const cy = height / 2
        const area = planRoomArea(r)
        return (
          <Html key={r.id} position={[cx, cy, cz]} center distanceFactor={10} zIndexRange={[15, 0]}>
            <div className="rounded bg-[var(--surface-solid)]/90 px-2 py-1 text-xs text-[var(--text)] shadow whitespace-nowrap pointer-events-none">
              <div className="font-semibold">{r.name}</div>
              <div>{formatRoomSize(r.width, r.depth, area, units)}</div>
              <div
                style={{ color: 'var(--text-2)' }}
              >{`Ceiling ${formatLength(height, units)}`}</div>
            </div>
          </Html>
        )
      })}
    </group>
  )
}
