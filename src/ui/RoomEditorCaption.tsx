import { allPlanRooms } from '../floorplan/levels'
import { planRoomArea } from '../floorplan/types'
import { useStore } from '../state/store'
import { formatArea } from '../utils/measurement'

/**
 * The measurement pill shown while the per-room editor is active: a compact
 * top-centre readout of the room's total floor area ("Area: 24.3 m²"). It only
 * appears when the measurements option is toggled on — the per-edge length /
 * width / height numbers live on the in-scene dimension markers
 * (`MeasurementOverlay`), so this pill is just the area summary. Pure DOM
 * overlay; hidden outside the room editor or when measurements are off.
 */
export function RoomEditorCaption() {
  const active = useStore((s) => s.roomEditor.active)
  const roomId = useStore((s) => s.roomEditor.roomId)
  // Select the PLAN, not a derived array — `allPlanRooms` returns a fresh
  // reference on a multi-storey plan, which as a selector re-renders forever.
  const plan = useStore((s) => s.floorPlan)
  const units = useStore((s) => s.units)
  const showMeasurements = useStore((s) => s.showMeasurements)
  if (!active || !roomId || !showMeasurements) return null
  // EVERY storey (F13) — the area pill never appeared for an upstairs room.
  const room = allPlanRooms(plan).find((r) => r.id === roomId)
  if (!room) return null
  return (
    <div className="room-editor-caption pointer-events-none absolute z-20" aria-hidden="true">
      {/* Clearing the taller mobile toolbar is a `body.mobile` top override in
          responsive.css, not a JS branch — hence no `useIsMobile` here. */}
      <span>
        Area: <b>{formatArea(planRoomArea(room), units)}</b>
      </span>
    </div>
  )
}
