import { planRoomArea } from '../floorplan/types'
import { useStore } from '../state/store'
import { formatArea } from '../utils/measurement'
import { useIsMobile } from './useIsMobile'

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
  const rooms = useStore((s) => s.floorPlan.rooms)
  const units = useStore((s) => s.units)
  const showMeasurements = useStore((s) => s.showMeasurements)
  const isMobile = useIsMobile()
  if (!active || !roomId || !showMeasurements) return null
  const room = rooms.find((r) => r.id === roomId)
  if (!room) return null
  return (
    <div
      className="room-editor-caption pointer-events-none absolute z-20"
      style={{
        // Sit clear of the top toolbar — more headroom on mobile, where the bar
        // is taller, so the pill never crowds against it.
        top: `calc(env(safe-area-inset-top, 0px) + ${isMobile ? 84 : 68}px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '5px 12px',
        borderRadius: 'var(--r-pill)',
        background: 'var(--surface-solid)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-pop)',
        fontSize: 'var(--t-xs)',
        whiteSpace: 'nowrap',
        maxWidth: 'calc(100vw - 24px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      aria-hidden="true"
    >
      <span style={{ color: 'var(--text-2)' }}>
        Area: <b style={{ color: 'var(--text)' }}>{formatArea(planRoomArea(room), units)}</b>
      </span>
    </div>
  )
}
